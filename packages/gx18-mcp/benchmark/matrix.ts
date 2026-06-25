// Benchmark matrix — all (tool × object × variant) cells to run.
// Pure data: no I/O, no side effects.

import { GOLDEN_CATALOG, type GoldenObject } from './catalog';

export interface BenchmarkCell {
  /** Stable key used in fixture filename: <tool>__<objectKey>__<variant> */
  fixtureKey: string;
  tool: string;
  args: Record<string, unknown>;
  /** Catalog key for per-object cells; null for global cells. */
  objectKey: string | null;
  /** If true, skip deep diff — only validate zod schema. Results are order/content volatile. */
  schemaOnly: boolean;
  /** This cell requires a prior cell's outputFile (XPZ path). Resolved at runtime. */
  dependsOn?: string;
  /** Latency budget in ms for the P90 check. */
  latencyBudgetMs: number;
}

function cell(
  tool: string,
  objectKey: string | null,
  args: Record<string, unknown>,
  variant: string,
  opts: Partial<Pick<BenchmarkCell, 'schemaOnly' | 'dependsOn' | 'latencyBudgetMs'>> = {},
): BenchmarkCell {
  const parts = [tool, objectKey ?? 'global', variant].filter(Boolean);
  return {
    fixtureKey: parts.join('__'),
    tool,
    args,
    objectKey,
    schemaOnly: opts.schemaOnly ?? false,
    dependsOn: opts.dependsOn,
    latencyBudgetMs: opts.latencyBudgetMs ?? 15_000,
  };
}

function perObjectCells(obj: GoldenObject): BenchmarkCell[] {
  const cells: BenchmarkCell[] = [];
  const { key: objKey, name, entityTypeId, typeKey } = obj;

  // ── Discovery ──────────────────────────────────────────────────────────────
  cells.push(cell('gx_find', objKey, { pattern: name, type: entityTypeId }, 'byname'));
  cells.push(cell('gx_get', objKey, { name, type: entityTypeId }, 'detail'));
  cells.push(cell('gx_properties', objKey, { name, type: entityTypeId }, 'props'));

  // ── Source sections ────────────────────────────────────────────────────────
  for (const section of obj.readSections) {
    cells.push(
      cell('gx_read', objKey, { name, type: entityTypeId, section }, section),
    );
  }

  // ── Structure ──────────────────────────────────────────────────────────────
  if (obj.hasStructure) {
    cells.push(cell('gx_structure', objKey, { name }, 'struct'));
  }

  // ── Variables ─────────────────────────────────────────────────────────────
  if (obj.hasVariables) {
    cells.push(
      cell('gx_variable', objKey, { action: 'list', name, type: typeKey }, 'list'),
    );
  }

  // ── History ───────────────────────────────────────────────────────────────
  cells.push(
    cell('gx_history', objKey, { name, type: entityTypeId, limit: 5 }, 'hist5'),
  );

  // ── Dependency analysis ───────────────────────────────────────────────────
  cells.push(
    cell('gx_where_used', objKey, { name, type: entityTypeId }, 'whereused'),
  );
  for (const action of ['usedby', 'uses', 'dependencies'] as const) {
    cells.push(
      cell('gx_analyze', objKey, { name, type: entityTypeId, action, limit: 30 }, action),
    );
  }

  // ── Impact ────────────────────────────────────────────────────────────────
  cells.push(
    cell('gx_impact', objKey, { name, type: entityTypeId, depth: 1 }, 'd1', {
      latencyBudgetMs: 20_000,
    }),
  );
  cells.push(
    cell('gx_impact', objKey, { name, type: entityTypeId, depth: 2 }, 'd2', {
      latencyBudgetMs: 30_000,
    }),
  );

  // ── Text search ───────────────────────────────────────────────────────────
  cells.push(
    cell('gx_search', objKey, { pattern: name, limit: 10 }, 'byname'),
  );

  // ── Diff (auto — latest 2 revisions) ─────────────────────────────────────
  cells.push(
    cell('gx_diff', objKey, { name, type: entityTypeId }, 'auto', { schemaOnly: true }),
  );

  // ── XPZ round-trip (UC only) ──────────────────────────────────────────────
  if (obj.hasXpz) {
    const exportKey = `gx_export__${objKey}__xpz`;
    cells.push(
      cell('gx_export', objKey, { name, type: entityTypeId }, 'xpz', {
        schemaOnly: true, // fixture stores only {ok, bytes, name}
        latencyBudgetMs: 30_000,
      }),
    );
    // gx_read_xpz depends on the XPZ path produced by gx_export above
    cells.push(
      cell('gx_read_xpz', objKey, { xpzFile: '' /* filled at runtime */ }, 'listing', {
        dependsOn: exportKey,
      }),
    );
  }

  return cells;
}

function globalCells(): BenchmarkCell[] {
  return [
    // ── Server health ────────────────────────────────────────────────────────
    cell('gx_whoami', null, {}, 'identity'),
    cell('gx_doctor', null, {}, 'health', { schemaOnly: true }),
    cell('gx_db_connections', null, {}, 'list', { schemaOnly: true }),

    // ── KB metadata ──────────────────────────────────────────────────────────
    cell('gx_modules', null, {}, 'all', { schemaOnly: true }),
    cell('gx_stats', null, {}, 'global', { schemaOnly: true }),

    // ── Type-scoped scanners (schemaOnly — results change as KB evolves) ────
    cell('gx_dead_code', null, { type: 34, limit: 20 }, 'proc20', { schemaOnly: true }),
    cell('gx_lint', null, { type: 147 }, 'uc', { schemaOnly: true, latencyBudgetMs: 30_000 }),
    cell('gx_lint', null, { type: 161 }, 'dso', { schemaOnly: true }),

    // ── Type listings (schemaOnly — order may vary) ───────────────────────────
    cell('gx_list', null, { type: 34, limit: 10 }, 'proc10', { schemaOnly: true }),
    cell('gx_list', null, { type: 147, limit: 10 }, 'uc10', { schemaOnly: true }),

    // ── Attribute catalog sample ──────────────────────────────────────────────
    cell('gx_attribute', null, { pattern: 'Loj%', limit: 20 }, 'loj'),

    // ── SQL — safe KB query ───────────────────────────────────────────────────
    cell(
      'gx_sql',
      null,
      {
        query:
          "SELECT TOP 3 EntityVersionName FROM EntityVersion WHERE EntityTypeId=34 ORDER BY EntityVersionId DESC",
        readOnly: true,
      },
      'top3proc',
      { schemaOnly: true },
    ),
  ];
}

export function buildMatrix(): BenchmarkCell[] {
  const perObject = GOLDEN_CATALOG.flatMap(perObjectCells);
  const globals = globalCells();
  return [...perObject, ...globals];
}

// Precomputed for convenience — the smoke test imports this directly.
export const MATRIX = buildMatrix();
