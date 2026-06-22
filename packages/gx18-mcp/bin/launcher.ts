#!/usr/bin/env node
/**
 * Standalone exe entry point — always starts the web UI.
 * Built into dist/bin/launcher.js and bundled by pkg as GeneXusAIToolkit.exe.
 * The main gx18-mcp.js CLI still exists unchanged for npm/stdio usage.
 */
import { startUi } from '../src/ui/server';

const SEP = '  ' + '='.repeat(44);
const LINE = (s: string) => '  ' + s;

console.log('');
console.log(SEP);
console.log(LINE('  GeneXus AI Toolkit'));
console.log(SEP);
console.log('');
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
