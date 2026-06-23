import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

function mdAsText(): Plugin {
  // Rolldown (vitest bundler) tries to parse files from disk BEFORE calling `load`,
  // so `.md` files fail with "Parse failure". The fix: intercept in `resolveId` and
  // return a virtual module ID (\0-prefixed) — Rolldown never reads the file as JS.
  return {
    name: 'md-as-text',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id.endsWith('.md')) {
        const resolved = importer
          ? path.resolve(path.dirname(importer), id)
          : path.resolve(id);
        return '\0md:' + resolved;
      }
    },
    load(id) {
      if (id.startsWith('\0md:')) {
        const filePath = id.slice(4);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          return `export default ${JSON.stringify(content)}`;
        } catch {
          return `export default ''`;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [mdAsText()],
  test: {
    environment: 'node',
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['test/integration/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          setupFiles: ['test/integration/setup.ts'],
          testTimeout: 300_000,
          hookTimeout: 60_000,
          singleThread: true,
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
