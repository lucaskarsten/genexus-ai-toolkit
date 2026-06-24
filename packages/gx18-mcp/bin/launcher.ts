#!/usr/bin/env node
/**
 * Standalone exe entry point — always starts the web UI.
 * Built into dist/bin/launcher.js and bundled by pkg as GeneXusAIToolkit.exe.
 * The main gx18-mcp.js CLI still exists unchanged for npm/stdio usage.
 */
import { startUi } from '../src/ui/server';
import { checkAndUpdate, justUpdated } from '../src/updater';

const pkg = require('../package.json') as { version: string };
const SEP = '  ' + '='.repeat(44);
const LINE = (s: string) => '  ' + s;
const sleep = (ms: number) => new Promise<false>((resolve) => setTimeout(() => resolve(false), ms));

async function main() {
  console.log('');
  console.log(SEP);
  console.log(LINE(`  GeneXus AI Toolkit  v${pkg.version}`));
  console.log(SEP);
  console.log('');

  if (!justUpdated()) {
    console.log(LINE('Verificando atualizacoes... (max 5s)'));
    console.log('');

    // Check for updates BEFORE opening the browser.
    // If an update is found, checkAndUpdate downloads it, spawns _update.cmd, and
    // returns true — we skip startUi entirely so the browser never opens.
    // If GitHub is unreachable or slow (> 5s), the race resolves false and we proceed normally.
    const updated = await Promise.race([
      checkAndUpdate(pkg.version, process.execPath),
      sleep(5000),
    ]);

    if (updated) {
      // _update.cmd is running detached; this process will exit in ~3s.
      return;
    }
  }

  console.log(LINE('Iniciando servidor local...'));
  console.log('');

  startUi({ open: true })
    .then((ui) => {
      console.log(LINE('Servidor rodando:'));
      console.log('');
      console.log('     ' + ui.url);
      console.log('');
      console.log(LINE('O browser abrira automaticamente.'));
      console.log(LINE('Mantenha esta janela aberta.'));
      console.log(LINE('Pressione Ctrl+C para encerrar.'));
      console.log('');
      console.log(SEP);
      console.log('');
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(LINE('[ERRO] Falha ao iniciar servidor: ' + msg));
      console.error(LINE('Pressione Enter para fechar...'));
      process.stdin.resume();
      process.stdin.once('data', () => process.exit(1));
      setTimeout(() => process.exit(1), 30_000);
    });
}

main().catch(console.error);
