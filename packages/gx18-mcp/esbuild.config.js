const esbuild = require('esbuild');
const fs = require('fs');
const watch = process.argv.includes('--watch');

const shared = {
  platform: 'node',
  format: 'cjs',
  bundle: true,
  // Sourcemaps only in watch/dev — production bundles ship without .map files
  // (they bloated the published tarball with ~4MB of useless maps).
  sourcemap: watch,
  target: 'node18',
};

const entries = [
  { entryPoints: ['bin/gx18-mcp.ts'], outfile: 'dist/bin/gx18-mcp.js' },
  { entryPoints: ['src/server.ts'], outfile: 'dist/src/server.js' },
  // Local web UI server (lazy-imported by the `ui` command). page.ts/api.ts and the
  // dispatch/clients/doctor modules are pulled in transitively.
  { entryPoints: ['src/ui/server.ts'], outfile: 'dist/src/ui/server.js' },
];

(async () => {
  if (watch) {
    const contexts = await Promise.all(entries.map(e => esbuild.context({ ...shared, ...e })));
    await Promise.all(contexts.map(c => c.watch()));
    console.log('Watching...');
  } else {
    // Remove stale sourcemaps from a previous dev build — esbuild won't delete
    // them when sourcemap is off, and they must not reach the published tarball.
    for (const e of entries) {
      try { fs.rmSync(e.outfile + '.map', { force: true }); } catch { /* ignore */ }
    }
    await Promise.all(entries.map(e => esbuild.build({ ...shared, ...e })));
    console.log('Build complete.');
  }
})().catch(() => process.exit(1));
