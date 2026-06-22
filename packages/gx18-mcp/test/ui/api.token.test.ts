import { describe, it, expect } from 'vitest';
import { handleApi, isHostAllowed, ApiCtx } from '../../src/ui/api';

const ctx: ApiCtx = { token: 'a'.repeat(32), readonly: false, port: 7337 };

describe('UI API token + host gate', () => {
  it('rejects /api/* with a missing token', async () => {
    const r = await handleApi(ctx, 'GET', '/api/tools', undefined, undefined);
    expect(r.status).toBe(401);
  });

  it('rejects /api/* with a wrong-length token (no crash)', async () => {
    const r = await handleApi(ctx, 'GET', '/api/tools', 'short', undefined);
    expect(r.status).toBe(401);
  });

  it('rejects /api/* with a same-length but different token', async () => {
    const r = await handleApi(ctx, 'GET', '/api/tools', 'b'.repeat(32), undefined);
    expect(r.status).toBe(401);
  });

  it('accepts /api/* with the correct token', async () => {
    const r = await handleApi(ctx, 'GET', '/api/tools', ctx.token, undefined);
    expect(r.status).toBe(200);
  });

  it('host allowlist only accepts loopback on the bound port', () => {
    expect(isHostAllowed('127.0.0.1:7337', 7337)).toBe(true);
    expect(isHostAllowed('localhost:7337', 7337)).toBe(true);
    expect(isHostAllowed('evil.com', 7337)).toBe(false);
    expect(isHostAllowed('127.0.0.1:9999', 7337)).toBe(false);
    expect(isHostAllowed(undefined, 7337)).toBe(false);
  });
});
