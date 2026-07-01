// run sub-command — executes every cell and compares against fixtures.

import fs from 'node:fs';
import path from 'node:path';
import { GxMcpClient } from './client';
import { MATRIX } from './matrix';
import { normalizeResponse, checksum } from './normalizer';
import { getSchema } from './schemas';
import { readFixture } from './capture';
import {
  computeLatency,
  computeSummary,
  diffSummary,
  printProgress,
  printSummary,
  toMarkdown,
  type CellReport,
  type RunReport,
} from './report';

export interface RunOptions {
  runs: number;
  filterObject?: string;
  filterTool?: string;
  reportPath?: string;
  verbose: boolean;
}

const RESULTS_DIR = path.resolve(__dirname, 'results');

function defaultReportPath(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(RESULTS_DIR, `run-${ts}`);
}

export async function runBenchmark(opts: RunOptions): Promise<void> {
  const cells = MATRIX.filter((c) => {
    if (opts.filterObject && c.objectKey !== opts.filterObject) return false;
    if (opts.filterTool && c.tool !== opts.filterTool) return false;
    return true;
  });

  // Pre-check: ensure all fixtures exist
  const missing = cells.filter((c) => !fs.existsSync(
    path.join(path.resolve(__dirname, 'fixtures'), `${c.fixtureKey}.json`),
  ));
  if (missing.length > 0) {
    console.error(`\n[run] Missing fixtures (${missing.length}). Run \`benchmark:capture\` first:`);
    for (const m of missing.slice(0, 20)) {
      console.error(`  - ${m.fixtureKey}`);
    }
    if (missing.length > 20) console.error(`  ... and ${missing.length - 20} more`);
    process.exit(1);
  }

  console.log(`\n[run] ${cells.length} cells × ${opts.runs} run(s)`);
  console.log('');

  const client = new GxMcpClient();
  await client.connect();

  // If any export cell is in scope, warm up the SDK first — same logic as capture.ts.
  // Without warm-up, gx_export cold-starts on the first UC and times out at 30s (MCP default),
  // leaving the worker with the KB open in exclusive mode and blocking all subsequent SQL reads.
  const hasExport = cells.some((c) => c.tool === 'gx_export');
  if (hasExport) {
    process.stdout.write('  🔥 warming up SDK (gx_export cold-start can take ~30s)...');
    let warm = false;
    for (let i = 0; i < 12 && !warm; i++) {
      const r = await client.call('gx_export', { name: 'UCTooltip', type: 'usercontrol' }, 180_000);
      if (!r.isError) { warm = true; break; }
      await new Promise((res) => setTimeout(res, 5000));
    }
    process.stdout.write(warm ? ' ✅\n\n' : ' ⚠️  (still cold — exports may fail)\n\n');
  }

  const startMs = Date.now();
  const cellReports: CellReport[] = [];

  // XPZ path cache for cells that depend on gx_export output
  const xpzPaths = new Map<string, string>();

  for (const c of cells) {
    const fixture = readFixture(c.fixtureKey);
    if (!fixture) {
      cellReports.push(skippedCell(c, 'fixture unreadable'));
      continue;
    }

    // Resolve dynamic args
    let args = c.args;
    if (c.dependsOn) {
      const depPath = xpzPaths.get(c.dependsOn);
      if (!depPath) {
        cellReports.push(skippedCell(c, 'dependency XPZ not available'));
        continue;
      }
      args = { ...args, xpzFile: depPath };
    }

    const samples: number[] = [];
    let lastResult: { raw: unknown; isError: boolean } | null = null;
    let cellError: string | undefined;

    for (let i = 0; i < opts.runs; i++) {
      try {
        // gx_export hits the SDK and can cold-start fail; retry it. All other tools are SQL-path
        // and respond on the first call.
        const res =
          c.tool === 'gx_export'
            ? await client.callWithRetry(c.tool, args)
            : await client.call(c.tool, args);

        samples.push(res.latencyMs);
        lastResult = res;

        // Store XPZ path for downstream dependency
        if (c.tool === 'gx_export' && !res.isError) {
          const raw = res.raw as Record<string, unknown>;
          if (raw && typeof raw['outputFile'] === 'string') {
            xpzPaths.set(`gx_export__${c.objectKey}__xpz`, raw['outputFile'] as string);
          }
        }
      } catch (err) {
        cellError = String(err);
        samples.push(c.latencyBudgetMs); // penalize errored runs
      }
    }

    const latency = computeLatency(samples);

    if (cellError || !lastResult) {
      const rep: CellReport = {
        fixtureKey: c.fixtureKey,
        tool: c.tool,
        objectKey: c.objectKey,
        status: 'error',
        error: cellError ?? 'no result',
        schemaValid: false,
        latency,
        liveChecksum: '',
        fixtureChecksum: fixture.checksum,
      };
      cellReports.push(rep);
      printProgress(rep);
      continue;
    }

    if (lastResult.isError) {
      const errMsg = typeof lastResult.raw === 'string'
        ? lastResult.raw
        : JSON.stringify(lastResult.raw);

      // Expected-error fixtures: capture stored the error response (e.g. gx_diff on a
      // single-version object). If the live error normalizes to the same checksum as the
      // fixture, the behaviour is stable → pass. Otherwise it's a real regression.
      const liveErrChecksum = checksum(normalizeResponse(c.tool, lastResult.raw));
      const isExpectedError = liveErrChecksum === fixture.checksum;

      const rep: CellReport = {
        fixtureKey: c.fixtureKey,
        tool: c.tool,
        objectKey: c.objectKey,
        status: isExpectedError ? 'pass' : 'error',
        error: isExpectedError ? undefined : errMsg.slice(0, 200),
        diffSummary: isExpectedError ? 'expected-error (stable)' : undefined,
        schemaValid: false,
        latency,
        liveChecksum: liveErrChecksum,
        fixtureChecksum: fixture.checksum,
      };
      cellReports.push(rep);
      printProgress(rep);
      continue;
    }

    // Schema validation
    const schema = getSchema(c.tool);
    let schemaValid = true;
    if (schema) {
      const result = schema.safeParse(lastResult.raw);
      schemaValid = result.success;
    }

    // Normalize + checksum
    const normalized = normalizeResponse(c.tool, lastResult.raw);
    const liveChecksum = checksum(normalized);

    let status: CellReport['status'];
    let diff: string | undefined;

    if (c.schemaOnly) {
      status = schemaValid ? 'pass' : 'fail';
      if (!schemaValid) diff = 'schema validation failed';
    } else {
      if (liveChecksum === fixture.checksum) {
        status = 'pass';
      } else {
        status = 'fail';
        diff = diffSummary(fixture.response, normalized);
        if (!diff) diff = `checksum mismatch (fixture=${fixture.checksum.slice(0, 8)} live=${liveChecksum.slice(0, 8)})`;
      }
    }

    const rep: CellReport = {
      fixtureKey: c.fixtureKey,
      tool: c.tool,
      objectKey: c.objectKey,
      status,
      diffSummary: diff,
      schemaValid,
      latency,
      liveChecksum,
      fixtureChecksum: fixture.checksum,
    };
    cellReports.push(rep);
    printProgress(rep);
  }

  await client.close();

  const durationMs = Date.now() - startMs;
  const summary = computeSummary(cellReports);

  const report: RunReport = {
    reportVersion: 1,
    runAt: new Date().toISOString(),
    durationMs,
    runs: opts.runs,
    summary,
    cells: cellReports,
  };

  // Write results
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const basePath = opts.reportPath ?? defaultReportPath();
  fs.writeFileSync(`${basePath}.json`, JSON.stringify(report, null, 2), 'utf8');
  const md = toMarkdown(report);
  fs.writeFileSync(`${basePath}.md`, md, 'utf8');

  console.log('');
  console.log(`[run] Report saved to ${basePath}.md`);
  printSummary(report);

  if (summary.failed > 0 || summary.errored > 0) {
    process.exitCode = 1;
  }
}

function skippedCell(
  c: { fixtureKey: string; tool: string; objectKey: string | null; latencyBudgetMs: number },
  reason: string,
): CellReport {
  return {
    fixtureKey: c.fixtureKey,
    tool: c.tool,
    objectKey: c.objectKey,
    status: 'skip',
    error: reason,
    schemaValid: false,
    latency: computeLatency([0]),
    liveChecksum: '',
    fixtureChecksum: '',
  };
}
