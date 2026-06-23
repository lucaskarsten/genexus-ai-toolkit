/**
 * Integration test helpers.
 * Env vars (GX_KB_DATABASE, etc.) are loaded by test/integration/setup.ts
 * via vitest setupFiles — they are set before this module is first imported.
 */
import { bridge } from '../../src/sdk-bridge/bridge';

export const SPIKE_AVAILABLE = !!process.env.GX_KB_DATABASE?.includes('SPIKE');

export async function callBridge<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return bridge.send<T>(method, params, 180_000);
}

/** Prefix para nomes de objetos criados em testes — fácil de filtrar no SQL */
export const TEST_PREFIX = 'IntTest';

export function testName(type: string): string {
  return `${TEST_PREFIX}${type}${Date.now()}`;
}

/** Deleta objeto se existir — não falha se não encontrar */
export async function cleanup(name: string, typeKey: string): Promise<void> {
  try {
    await callBridge('delete', { name, typeKey, dryRun: false });
  } catch {
    // ignore — object may not exist
  }
}
