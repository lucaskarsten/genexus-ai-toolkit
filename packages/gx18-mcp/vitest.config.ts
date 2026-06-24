import { defineConfig } from 'vitest/config';

export default defineConfig({
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
