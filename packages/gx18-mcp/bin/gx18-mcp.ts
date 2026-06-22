#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import os from 'os';

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

    console.log(chalk.bold('\ngx18-mcp setup wizard\n'));

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
        choices: [
          { name: 'Claude Code (project .mcp.json)', value: 'claude-project' },
          { name: 'Claude Desktop (claude_desktop_config.json)', value: 'claude-desktop' },
          { name: 'Cursor (.cursor/mcp.json)', value: 'cursor' },
          { name: 'VS Code (.vscode/mcp.json)', value: 'vscode' },
        ],
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

    // Portable server entry — resolved from PATH so it survives reinstall/relocation
    // (an absolute path to the installed dist would break on a clean machine via npx).
    const serverEntry = {
      command: 'npx',
      args: ['-y', 'gx18-mcp', 'start'],
    };

    for (const client of answers.clients as string[]) {
      try {
        if (client === 'claude-project') {
          patchMcpJson(path.join(process.cwd(), '.mcp.json'), 'gx18', serverEntry);
          console.log(chalk.green('Patched .mcp.json in current directory'));
        } else if (client === 'claude-desktop') {
          const cfgPath = path.join(
            os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'
          );
          patchMcpJson(cfgPath, 'gx18', serverEntry);
          console.log(chalk.green(`Patched ${cfgPath}`));
        } else if (client === 'cursor') {
          const cfgPath = path.join(process.cwd(), '.cursor', 'mcp.json');
          patchMcpJson(cfgPath, 'gx18', serverEntry);
          console.log(chalk.green(`Patched ${cfgPath}`));
        } else if (client === 'vscode') {
          // VS Code uses a top-level `servers` key (not `mcpServers`).
          const cfgPath = path.join(process.cwd(), '.vscode', 'mcp.json');
          patchMcpJson(cfgPath, 'gx18', serverEntry, 'servers');
          console.log(chalk.green(`Patched ${cfgPath}`));
        }
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
    const { loadConfig } = await import('../src/config');
    const { bridge } = await import('../src/sdk-bridge/bridge');

    const config = loadConfig();
    console.log(chalk.bold('\ngx18-mcp doctor\n'));

    // 1. Worker exe
    if (fs.existsSync(config.workerExe)) {
      console.log(chalk.green('  [OK] Worker exe:'), config.workerExe);
    } else {
      console.log(chalk.red('  [FAIL] Worker exe not found:'), config.workerExe);
      console.log('         Run: npm run build:worker');
    }

    // 2. GX18 install dir
    if (fs.existsSync(config.gx18Dir)) {
      console.log(chalk.green('  [OK] GX18 dir:'), config.gx18Dir);
    } else {
      console.log(chalk.yellow('  [WARN] GX18 dir not found:'), config.gx18Dir);
    }

    // 3. KB path
    if (config.kbPath && fs.existsSync(config.kbPath)) {
      console.log(chalk.green('  [OK] KB path:'), config.kbPath);
    } else {
      console.log(chalk.yellow('  [WARN] KB path not set or missing:'), config.kbPath);
    }

    // 4. Ping worker
    try {
      console.log('\n  Pinging worker...');
      const ping = await bridge.send<{
        ok: boolean; sdkReady: boolean; sqlReady: boolean; user: string; kbPath: string;
      }>('ping', {}, 15000);
      console.log(chalk.green('  [OK] Worker ping:'));
      console.log('       user     :', ping.user);
      console.log('       kbPath   :', ping.kbPath);
      console.log('       sdkReady :', ping.sdkReady);
      console.log('       sqlReady :', ping.sqlReady);

      if (ping.sqlReady) {
        const result = await bridge.send<{ rows: Array<{ cnt: number }> }>(
          'sql_query',
          { query: 'SELECT COUNT(*) AS cnt FROM EntityVersion', readOnly: true }
        );
        console.log(chalk.green('  [OK] SQL EntityVersion rows:'), result.rows[0]?.cnt);
      }
    } catch (err) {
      console.log(chalk.red('  [FAIL] Worker ping failed:'), String(err));
    } finally {
      await bridge.shutdown();
    }

    console.log('');
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

// ─── helpers ──────────────────────────────────────────────────────────────────

function patchMcpJson(
  filePath: string,
  serverKey: string,
  entry: { command: string; args: string[] },
  rootKey: string = 'mcpServers'
): void {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try { existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { /* ignore */ }
  }

  const servers = (existing[rootKey] ?? {}) as Record<string, unknown>;
  servers[serverKey] = entry;
  existing[rootKey] = servers;

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
}

program.parse(process.argv);
