/**
 * Vitest setupFile for integration tests.
 * Runs in the same worker process BEFORE any test module is imported,
 * so env vars are in place when bridge.ts first calls loadConfig().
 */
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: resolve(__dirname, '.env.spike'), override: true });
