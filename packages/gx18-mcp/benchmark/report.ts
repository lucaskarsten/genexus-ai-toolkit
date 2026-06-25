// Report formatters — JSON serialization + Markdown table + console output.

import { createHash } from 'node:crypto';

export type CellStatus = 'pass' | 'fail' | 'error' | 'skip';

export interface LatencyStats {
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
  samples: number[];
}

export interface CellReport {
  fixtureKey: string;
  tool: string;
  objectKey: string | null;
  status: CellStatus;
  diffSummary?: string;
  error?: string;
  schemaValid: boolean;
  latency: LatencyStats;
  liveChecksum: string;
  fixtureChecksum: string;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
}

export interface RunReport {
  reportVersion: 1;
  runAt: string;
  durationMs: number;
  runs: number;
  summary: RunSummary;
  cells: CellReport[];
}

// ── Latency helpers ───────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function computeLatency(samples: number[]): LatencyStats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    samples,
  };
}

// ── Summary computation ───────────────────────────────────────────────────────

export function computeSummary(cells: CellReport[]): RunSummary {
  const summary: RunSummary = { total: cells.length, passed: 0, failed: 0, errored: 0, skipped: 0 };
  for (const c of cells) {
    if (c.status === 'pass') summary.passed++;
    else if (c.status === 'fail') summary.failed++;
    else if (c.status === 'error') summary.errored++;
    else summary.skipped++;
  }
  return summary;
}

// ── Diff helper ───────────────────────────────────────────────────────────────

/**
 * Returns a short diff summary: lists top-level keys whose values differ.
 * For strings (gx_read source), returns character-count delta.
 */
export function diffSummary(fixture: unknown, live: unknown): string {
  if (typeof fixture === 'string' && typeof live === 'string') {
    if (fixture === live) return '';
    return `string length fixture=${fixture.length} live=${live.length}`;
  }

  if (
    fixture === null || live === null ||
    typeof fixture !== 'object' || typeof live !== 'object' ||
    Array.isArray(fixture) !== Array.isArray(live)
  ) {
    return `type mismatch: fixture=${typeof fixture} live=${typeof live}`;
  }

  if (Array.isArray(fixture) && Array.isArray(live)) {
    if (fixture.length !== live.length) {
      return `array length fixture=${fixture.length} live=${live.length}`;
    }
    return '';
  }

  const a = fixture as Record<string, unknown>;
  const b = live as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs: string[] = [];

  for (const k of allKeys) {
    if (!(k in a)) { diffs.push(`+${k}`); continue; }
    if (!(k in b)) { diffs.push(`-${k}`); continue; }
    const av = JSON.stringify(a[k]);
    const bv = JSON.stringify(b[k]);
    if (av !== bv) diffs.push(k);
  }

  return diffs.length === 0 ? '' : `changed: ${diffs.slice(0, 8).join(', ')}`;
}

// ── Markdown table ────────────────────────────────────────────────────────────

const STATUS_ICON: Record<CellStatus, string> = {
  pass: '✅',
  fail: '❌',
  error: '💥',
  skip: '⏭️',
};

export function toMarkdown(report: RunReport): string {
  const { summary, cells, runAt, durationMs, runs } = report;
  const lines: string[] = [];

  lines.push(`# gx18-mcp Benchmark Report`);
  lines.push('');
  lines.push(`**Run:** ${runAt}  `);
  lines.push(`**Duration:** ${(durationMs / 1000).toFixed(1)}s  `);
  lines.push(`**Repetitions per cell:** ${runs}  `);
  lines.push('');
  lines.push(
    `**Summary:** ${summary.passed}/${summary.total} passed` +
    (summary.failed > 0 ? ` · **${summary.failed} failed**` : '') +
    (summary.errored > 0 ? ` · **${summary.errored} errors**` : '') +
    (summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ''),
  );
  lines.push('');
  lines.push('| Status | Tool | Object | P50ms | P90ms | Schema | Notes |');
  lines.push('|--------|------|--------|------:|------:|:------:|-------|');

  for (const c of cells) {
    const icon = STATUS_ICON[c.status];
    const schema = c.schemaValid ? '✅' : '❌';
    const notes = c.error
      ? c.error.slice(0, 60)
      : c.diffSummary
      ? c.diffSummary.slice(0, 60)
      : '';
    lines.push(
      `| ${icon} | \`${c.tool}\` | ${c.objectKey ?? '—'} | ${c.latency.p50} | ${c.latency.p90} | ${schema} | ${notes} |`,
    );
  }

  // Failed cells section
  const failures = cells.filter((c) => c.status === 'fail' || c.status === 'error');
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Failures');
    for (const c of failures) {
      lines.push('');
      lines.push(`### ${c.tool} / ${c.objectKey ?? 'global'}`);
      lines.push(`- **Fixture key:** \`${c.fixtureKey}\``);
      if (c.error) lines.push(`- **Error:** ${c.error}`);
      if (c.diffSummary) lines.push(`- **Diff:** ${c.diffSummary}`);
    }
  }

  return lines.join('\n');
}

// ── Console output ────────────────────────────────────────────────────────────

export function printProgress(
  cell: Pick<CellReport, 'tool' | 'objectKey' | 'status' | 'latency' | 'error' | 'diffSummary'>,
): void {
  const icon = STATUS_ICON[cell.status];
  const obj = cell.objectKey ? `/${cell.objectKey}` : '';
  const ms = cell.latency.p50;
  const note = cell.error ?? cell.diffSummary ?? '';
  const suffix = note ? ` — ${note.slice(0, 80)}` : '';
  process.stdout.write(`  ${icon} ${cell.tool}${obj} (${ms}ms)${suffix}\n`);
}

export function printSummary(report: RunReport): void {
  const { summary, durationMs } = report;
  const dur = (durationMs / 1000).toFixed(1);
  console.log('');
  console.log(`Benchmark complete in ${dur}s`);
  console.log(
    `  ✅ ${summary.passed} passed  ❌ ${summary.failed} failed  💥 ${summary.errored} errors  ⏭️  ${summary.skipped} skipped`,
  );
}

// ── SHA helper for fixture checksums ─────────────────────────────────────────
export function sha256(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj, null, 0)).digest('hex');
}
