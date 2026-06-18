const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const ctx = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  minify: !watch,
};

if (watch) {
  esbuild.context(ctx).then(c => {
    c.watch();
    console.log('[genexus-view] watching for changes…');
  }).catch(() => process.exit(1));
} else {
  esbuild.build(ctx).catch(() => process.exit(1));
}
