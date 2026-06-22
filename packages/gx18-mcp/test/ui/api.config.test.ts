import { describe, it, expect, vi, beforeEach } from 'vitest';

const { saveConfig, getRaw, setRaw } = vi.hoisted(() => {
  let raw: Record<string, unknown> = {};
  return { saveConfig: vi.fn(), getRaw: () => raw, setRaw: (v: Record<string, unknown>) => { raw = v; } };
});

vi.mock('../../src/config', () => ({
  loadConfig: () => ({
    kbPath: 'C:\\KBs\\X', kbServer: '(localdb)\\MSSQLLocalDB', kbDatabase: 'GX_KB_X',
    gx18Dir: 'C:\\GX18', outputPath: '.\\output', workerExe: 'C:\\worker.exe', logLevel: 'info',
    db: { oracle: { host: 'h', port: 1521, service: 's', user: 'u', password: 'secret' } },
  }),
  saveConfig,
  readRawConfig: () => getRaw(),
}));

import { handleApi, ApiCtx, PASSWORD_MASK } from '../../src/ui/api';

const TOKEN = 'd'.repeat(32);
const ctx: ApiCtx = { token: TOKEN, readonly: false, port: 7337 };

beforeEach(() => { saveConfig.mockReset(); setRaw({}); });

describe('GET /api/config', () => {
  it('masks the Oracle password and lists clients', async () => {
    const r = await handleApi(ctx, 'GET', '/api/config', TOKEN, undefined);
    const body = r.body as { config: { oracle: { password: string } }; clients: unknown[] };
    expect(body.config.oracle.password).toBe(PASSWORD_MASK);
    expect(body.clients.length).toBe(4);
  });
});

describe('POST /api/config', () => {
  it('merges edits against the raw file and preserves a masked password', async () => {
    setRaw({ kbPath: 'OLD', db: { oracle: { host: 'h', port: 1521, service: 's', user: 'u', password: 'secret' } } });
    await handleApi(ctx, 'POST', '/api/config', TOKEN, {
      kbPath: 'NEW',
      oracle: { host: 'h', port: 1521, service: 's', user: 'u', password: PASSWORD_MASK },
    });
    const saved = saveConfig.mock.calls[0][0];
    expect(saved.kbPath).toBe('NEW');
    expect(saved.db.oracle.password).toBe('secret'); // mask never overwrites the stored secret
  });

  it('persists a real password change', async () => {
    setRaw({ db: { oracle: { host: 'h', port: 1521, service: 's', user: 'u', password: 'secret' } } });
    await handleApi(ctx, 'POST', '/api/config', TOKEN, {
      oracle: { host: 'h', port: 1521, service: 's', user: 'u', password: 'newpass' },
    });
    expect(saveConfig.mock.calls[0][0].db.oracle.password).toBe('newpass');
  });

  it('does not bake env-only fields into the file (only edited keys change)', async () => {
    setRaw({ kbPath: 'OLD' });
    await handleApi(ctx, 'POST', '/api/config', TOKEN, { kbDatabase: 'DB2' });
    const saved = saveConfig.mock.calls[0][0];
    expect(saved.kbPath).toBe('OLD');
    expect(saved.kbDatabase).toBe('DB2');
    expect(saved.kbServer).toBeUndefined(); // never came through the patch
  });
});
