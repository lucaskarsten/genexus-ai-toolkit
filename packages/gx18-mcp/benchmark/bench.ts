#!/usr/bin/env node
// Benchmark CLI entry point. Run via: npx tsx benchmark/bench.ts <command>

import { program } from 'commander';
import { runCapture } from './capture';
import { runBenchmark } from './run';
import { runDrift } from './drift';
import { runWriteBenchmark } from './write-suite';
import fs from 'node:fs';
import path from 'node:path';

program
  .name('benchmark')
  .description('gx18-mcp golden dataset + benchmark harness')
  .version('1.0.0');

// ── capture ──────────────────────────────────────────────────────────────────
program
  .command('capture')
  .description('Call every matrix cell and write JSON fixtures to benchmark/fixtures/')
  .option('--object <key>', 'Only capture cells for this catalog object key')
  .option('--tool <name>', 'Only capture cells for this tool')
  .option('--force', 'Overwrite existing fixtures', false)
  .option('-v, --verbose', 'Print skipped cells too', false)
  .action(async (opts) => {
    await runCapture({
      force: Boolean(opts.force),
      filterObject: opts.object,
      filterTool: opts.tool,
      verbose: Boolean(opts.verbose),
    });
  });

// ── run ──────────────────────────────────────────────────────────────────────
program
  .command('run')
  .description('Execute all cells and compare against fixtures')
  .option('--runs <n>', 'Repetitions per cell (1=correctness only, 3=latency P50/P90/P99)', '1')
  .option('--object <key>', 'Only run cells for this catalog object key')
  .option('--tool <name>', 'Only run cells for this tool')
  .option('--report <path>', 'Base path for output files (default: benchmark/results/run-<ts>)')
  .option('-v, --verbose', 'Extra output', false)
  .action(async (opts) => {
    await runBenchmark({
      runs: Math.max(1, parseInt(opts.runs, 10) || 1),
      filterObject: opts.object,
      filterTool: opts.tool,
      reportPath: opts.report,
      verbose: Boolean(opts.verbose),
    });
  });

// ── drift ────────────────────────────────────────────────────────────────────
program
  .command('drift')
  .description('Check catalog objects against the live KB for drift (missing, renamed, modified)')
  .action(async () => {
    await runDrift();
  });

// ── write ────────────────────────────────────────────────────────────────────
program
  .command('write')
  .description('Run write benchmark: create/modify/delete ephemeral BncTest_ objects per type')
  .option(
    '--type <types>',
    'Comma-separated list of types to test (procedure,webcomponent,webpanel,transaction,sdt,usercontrol)',
  )
  .option('-v, --verbose', 'Extra output', false)
  .action(async (opts) => {
    const types = opts.type
      ? (opts.type as string).split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    await runWriteBenchmark({ types, verbose: Boolean(opts.verbose) });
  });

// ── report ───────────────────────────────────────────────────────────────────
program
  .command('report')
  .description('Re-render Markdown from an existing run JSON file')
  .option('--input <path>', 'Path to run-<ts>.json (default: latest in benchmark/results/)')
  .action(async (opts) => {
    const { toMarkdown } = await import('./report');

    let inputPath = opts.input as string | undefined;
    if (!inputPath) {
      const resultsDir = path.resolve(__dirname, 'results');
      if (!fs.existsSync(resultsDir)) {
        console.error('No results directory found. Run `benchmark run` first.');
        process.exit(1);
      }
      const files = fs.readdirSync(resultsDir)
        .filter((f) => f.startsWith('run-') && f.endsWith('.json'))
        .sort()
        .reverse();
      if (files.length === 0) {
        console.error('No run JSON files found in benchmark/results/.');
        process.exit(1);
      }
      inputPath = path.join(resultsDir, files[0]);
    }

    let report: unknown;
    try {
      report = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    } catch (err) {
      console.error(`Cannot read ${inputPath}: ${err}`);
      process.exit(1);
    }

    const md = toMarkdown(report as Parameters<typeof toMarkdown>[0]);
    console.log(md);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
