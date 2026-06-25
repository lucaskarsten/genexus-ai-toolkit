// capture sub-command — calls every cell and writes fixtures to benchmark/fixtures/.

import fs from 'node:fs';
import path from 'node:path';
import { GxMcpClient } from './client';
import { MATRIX, type BenchmarkCell } from './matrix';
import { normalizeResponse, checksum, extractEntityVersionId } from './normalizer';
import type { GoldenObject } from './catalog';

export interface Fixture {
  fixtureVersion: 1;
  capturedAt: string;
  tool: string;
  args: Record<string, unknown>;
  response: unknown;
  checksum: string;
  entityVersionId: number | null;
}

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

export function fixtureFilePath(fixtureKey: string): string {
  return path.join(FIXTURES_DIR, `${fixtureKey}.json`);
}

export function fixtureExists(fixtureKey: string): boolean {
  return fs.existsSync(fixtureFilePath(fixtureKey));
}

export function writeFixture(fixtureKey: string, fixture: Fixture): void {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(fixtureFilePath(fixtureKey), JSON.stringify(fixture, null, 2), 'utf8');
}

export function readFixture(fixtureKey: string): Fixture | null {
  const p = fixtureFilePath(fixtureKey);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Fixture;
  } catch {
    return null;
  }
}

export interface CaptureOptions {
  force: boolean;
  filterObject?: string;
  filterTool?: string;
  verbose: boolean;
}

export async function runCapture(opts: CaptureOptions): Promise<void> {
  const cells = MATRIX.filter((c) => {
    if (opts.filterObject && c.objectKey !== opts.filterObject) return false;
    if (opts.filterTool && c.tool !== opts.filterTool) return false;
    return true;
  });

  console.log(`\n[capture] ${cells.length} cells to capture`);
  if (!opts.force) console.log('[capture] --force not set: skipping existing fixtures');
  console.log('');

  const client = new GxMcpClient();
  await client.connect();

  // Warm up the SDK before hitting any SDK-dependent tools (gx_variable, gx_export, etc.).
  // The first SDK call after worker start always fails with NullRef (cold-start); the second
  // succeeds immediately. We pay this cost once here so no matrix cell absorbs it.
  process.stdout.write('  🔥 warming up SDK...');
  const warmup = await client.callWithRetry('gx_export', {
    name: 'UCTooltip',
    type: 'usercontrol',
  });
  process.stdout.write(warmup.isError ? ' ⚠️  (warmup had error, proceeding)\n' : ' ✅\n');

  // Map fixtureKey → outputFile for XPZ dependency resolution
  const xpzPaths: Map<string, string> = new Map();

  let captured = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of cells) {
    if (!opts.force && fixtureExists(c.fixtureKey)) {
      if (opts.verbose) process.stdout.write(`  ⏭️  [skip] ${c.fixtureKey}\n`);
      skipped++;
      continue;
    }

    // Resolve XPZ dependency
    const args = resolveArgs(c, xpzPaths);
    if (args === null) {
      process.stdout.write(`  ⚠️  [skip] ${c.fixtureKey} — dependency XPZ not available\n`);
      skipped++;
      continue;
    }

    process.stdout.write(`  ⏳ ${c.fixtureKey} ...`);

    try {
      const result = await client.callWithRetry(c.tool, args);

      if (result.isError) {
        const errMsg = typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw);
        // "fewer than 2 versions" is an expected condition for newly-created objects —
        // capture the error response as a fixture so future runs verify it's stable.
        const isExpectedCondition =
          errMsg.includes('fewer than 2 versions') ||
          errMsg.includes('at least 2') ||
          errMsg.includes('Unknown section');
        if (!isExpectedCondition) {
          process.stdout.write(` ❌ ERROR\n`);
          process.stderr.write(`     ${errMsg.slice(0, 200)}\n`);
          failed++;
          continue;
        }
        // Fall through — write the error response as a fixture (stable expected error).
        process.stdout.write(` ⚠️  EXPECTED-ERR (${result.latencyMs}ms)\n`);
      }

      // For gx_export: store the XPZ path for downstream gx_read_xpz cells
      if (c.tool === 'gx_export') {
        const raw = result.raw as Record<string, unknown>;
        if (raw && typeof raw['outputFile'] === 'string') {
          const depKey = `gx_export__${c.objectKey}__xpz`;
          xpzPaths.set(depKey, raw['outputFile'] as string);
        }
      }

      const normalized = normalizeResponse(c.tool, result.raw);
      const cksum = checksum(normalized);
      const evId = extractEntityVersionId(c.tool, result.raw);

      const fixture: Fixture = {
        fixtureVersion: 1,
        capturedAt: new Date().toISOString(),
        tool: c.tool,
        args,
        response: normalized,
        checksum: cksum,
        entityVersionId: evId,
      };

      writeFixture(c.fixtureKey, fixture);
      process.stdout.write(` ✅ (${result.latencyMs}ms)\n`);
      captured++;
    } catch (err) {
      process.stdout.write(` 💥 EXCEPTION\n`);
      process.stderr.write(`     ${String(err)}\n`);
      failed++;
    }
  }

  await client.close();

  console.log('');
  console.log(
    `[capture] done: ${captured} captured, ${skipped} skipped, ${failed} failed`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

/** Resolve runtime-dynamic args (e.g. fill xpzFile from a prior gx_export result). */
function resolveArgs(
  c: BenchmarkCell,
  xpzPaths: Map<string, string>,
): Record<string, unknown> | null {
  if (!c.dependsOn) return c.args;

  const depPath = xpzPaths.get(c.dependsOn);
  if (!depPath) return null;

  return { ...c.args, xpzFile: depPath };
}
