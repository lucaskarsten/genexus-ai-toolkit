#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';

// Bundled at build time by esbuild (single source of truth for the version).
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('gx18-mcp')
  .description('MCP server for GeneXus 18 Knowledge Base access')
  .version(pkg.version);

// ─── start ────────────────────────────────────────────────────────────────────

program
  .command('start', { isDefault: true })
  .description('Start the MCP server on stdio (default)')
  .action(async () => {
    const { run } = await import('../src/server');
    await run();
  });

// ─── setup ────────────────────────────────────────────────────────────────────

program
  .command('setup')
  .description('Interactive setup wizard — configure KB paths and AI client integration')
  .action(async () => {
    const chalk = require('chalk');
    const { default: inquirer } = await import('inquirer');
    const { loadConfig, saveConfig } = await import('../src/config');
    const { CLIENTS, registerClient } = await import('../src/clients');
    const { execSync } = require('child_process');

    console.log(chalk.bold(`\ngx18-mcp setup wizard  v${pkg.version}\n`));

    // Step 0 — ensure global install so the AI client can call `gx18-mcp start` directly
    // (no npx, no download delay, no update loop on each connect).
    console.log(chalk.dim('Installing gx18-mcp globally...'));
    try {
      execSync('npm install -g gx18-mcp@latest', { stdio: 'inherit' });
      console.log(chalk.green('  [OK] Global install complete.\n'));
    } catch {
      console.warn(chalk.yellow('  [WARN] Global install failed — you can run it manually: npm install -g gx18-mcp\n'));
    }

    const existing = loadConfig();

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'kbPath',
        message: 'GeneXus KB path (folder containing the .gxw file):',
        default: existing.kbPath || 'C:\\KBs\\MyKB',
        validate: (v: string) => {
          if (!fs.existsSync(v)) return `Path does not exist: ${v}`;
          const hasGxw = fs.readdirSync(v).some(f => f.endsWith('.gxw'));
          if (!hasGxw) return `No .gxw file found in ${v}`;
          return true;
        },
      },
      {
        type: 'input',
        name: 'gx18Dir',
        message: 'GeneXus 18 install directory:',
        default: existing.gx18Dir || 'C:\\Program Files (x86)\\GeneXus\\GeneXus18U6',
        validate: (v: string) => {
          if (!fs.existsSync(v)) return `Path does not exist: ${v}`;
          const hasDll = fs.existsSync(path.join(v, 'Artech.Common.Controls.dll')) ||
                         fs.existsSync(path.join(v, 'GeneXus.Programs.Common.dll'));
          if (!hasDll) return `GeneXus 18 DLLs not found in ${v}`;
          return true;
        },
      },
      {
        type: 'input',
        name: 'kbServer',
        message: 'SQL Server instance:',
        default: existing.kbServer || '(localdb)\\MSSQLLocalDB',
      },
      {
        type: 'input',
        name: 'kbDatabase',
        message: 'KB database name:',
        default: existing.kbDatabase || '',
        validate: (v: string) => v.trim() ? true : 'Database name is required',
      },
      {
        type: 'checkbox',
        name: 'clients',
        message: 'Configure which AI clients to integrate with:',
        choices: CLIENTS.map((c) => ({ name: c.label, value: c.id })),
      },
    ]);

    // Save config
    const config = {
      kbPath: answers.kbPath,
      gx18Dir: answers.gx18Dir,
      kbServer: answers.kbServer,
      kbDatabase: answers.kbDatabase,
    };
    saveConfig(config);
    console.log(chalk.green('\nConfig saved to %LOCALAPPDATA%\\gx18-mcp\\config.json'));

    for (const client of answers.clients as Array<Parameters<typeof registerClient>[0]>) {
      try {
        const written = registerClient(client);
        console.log(chalk.green(`Patched ${written}`));
      } catch (err) {
        console.warn(chalk.yellow(`Warning: could not patch ${client}: ${err}`));
      }
    }

    // Verify the worker actually comes up and resolves the Windows identity.
    console.log(chalk.bold('\nVerifying worker...'));
    try {
      const { bridge } = await import('../src/sdk-bridge/bridge');
      try {
        const ping = await bridge.send<{ sdkReady: boolean; sqlReady: boolean; user: string }>(
          'ping', {}, 15000
        );
        console.log(chalk.green('  [OK] Worker ping:'), `user=${ping.user}`,
          `sqlReady=${ping.sqlReady}`, `sdkReady=${ping.sdkReady}`);
        const who = await bridge.send<{ windowsUser: string; kbUserId: number | null }>('whoami', {});
        console.log(chalk.green('  [OK] gx_whoami:'),
          `${who.windowsUser} → UserId ${who.kbUserId ?? '(not found)'}`);
      } finally {
        await bridge.shutdown();
      }
    } catch (err) {
      console.log(chalk.yellow('  [WARN] Verification failed:'), String(err));
      console.log('         Run "gx18-mcp doctor" for a full diagnostic.');
    }

    console.log(chalk.bold('\nSetup complete.\n'));
  });

// ─── doctor ───────────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Health check — verify worker, SQL connection, and GX18 install')
  .action(async () => {
    const chalk = require('chalk');
    const { runDoctor } = await import('../src/doctor');
    const { bridge } = await import('../src/sdk-bridge/bridge');

    console.log(chalk.bold(`\ngx18-mcp doctor  v${pkg.version}\n`));
    try {
      const report = await runDoctor();
      for (const c of report.checks) {
        const color = c.status === 'ok' ? chalk.green : c.status === 'warn' ? chalk.yellow : chalk.red;
        console.log(color(`  [${c.status.toUpperCase()}] ${c.name}:`), c.detail);
      }
    } finally {
      // runDoctor leaves the worker warm; the CLI is a one-shot, so shut it down here.
      await bridge.shutdown();
    }

    console.log('');
  });

// ─── ui ───────────────────────────────────────────────────────────────────────

program
  .command('ui')
  .description('Launch the local web UI (setup + tool runner) on 127.0.0.1')
  .option('-p, --port <port>', 'Port to bind (default 7337)', (v) => parseInt(v, 10))
  .option('--no-open', 'Do not open the browser automatically')
  .action(async (opts: { port?: number; open?: boolean }) => {
    const chalk = require('chalk');
    const { startUi } = await import('../src/ui/server');
    try {
      const ui = await startUi({ port: opts.port, open: opts.open });
      console.log(chalk.green(`\ngx18-mcp UI  v${pkg.version}  running at`), ui.url);
      console.log(chalk.dim('  The page can read AND write your KB. Keep the URL private.'));
      console.log(chalk.dim('  Press Ctrl-C to stop.\n'));
    } catch (err) {
      console.error(chalk.red('Failed to start UI:'), String(err));
      process.exit(1);
    }
  });

// ─── stop ─────────────────────────────────────────────────────────────────────

program
  .command('stop')
  .description('Gracefully shut down a running gx18-mcp worker process')
  .action(async () => {
    const chalk = require('chalk');
    const { bridge } = await import('../src/sdk-bridge/bridge');
    try {
      await bridge.shutdown();
      console.log(chalk.green('Worker shut down.'));
    } catch (err) {
      console.log(chalk.yellow('No running worker found or shutdown failed:', String(err)));
    }
  });

program.parse(process.argv);
