import { describe, it, expect, vi, beforeEach } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../../src/sdk-bridge/bridge', () => ({ bridge: { send, shutdown: vi.fn() } }));

import { handleApi, ApiCtx } from '../../src/ui/api';

const TOKEN = 'c'.repeat(32);
const rw: ApiCtx = { token: TOKEN, readonly: false, port: 7337 };
const ro: ApiCtx = { token: TOKEN, readonly: true, port: 7337 };

beforeEach(() => { send.mockReset(); });

describe('GET /api/tools', () => {
  it('advertises all tools (incl. writes) when read-write', async () => {
    const r = await handleApi(rw, 'GET', '/api/tools', TOKEN, undefined);
    const names = (r.body as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(names).toContain('gx_create');
    expect(names).toContain('gx_find');
    expect((r.body as { readonly: boolean }).readonly).toBe(false);
  });

  it('hides the 6 write tools in read-only mode', async () => {
    const r = await handleApi(ro, 'GET', '/api/tools', TOKEN, undefined);
    const names = (r.body as { tools: { name: string }[] }).tools.map((t) => t.name);
    for (const w of ['gx_create', 'gx_modify', 'gx_set_property', 'gx_rename', 'gx_build', 'gx_import']) {
      expect(names).not.toContain(w);
    }
    expect(names).toContain('gx_sql');
  });
});

describe('POST /api/tool/:name', () => {
  it('runs a read tool and returns { text, isError:false }', async () => {
    send.mockResolvedValue([{ name: 'WbpX', entityId: 7 }]);
    const r = await handleApi(rw, 'POST', '/api/tool/gx_find', TOKEN, { args: { pattern: '%X%' } });
    expect(r.status).toBe(200);
    expect((r.body as { isError: boolean }).isError).toBe(false);
    expect(send).toHaveBeenCalledWith('find', expect.objectContaining({ pattern: '%X%' }));
  });

  it('blocks a write tool in read-only mode (isError, bridge untouched)', async () => {
    const r = await handleApi(ro, 'POST', '/api/tool/gx_create', TOKEN, { args: { type: 'procedure', name: 'P', confirm: true } });
    expect(r.status).toBe(200);
    expect((r.body as { isError: boolean }).isError).toBe(true);
    expect((r.body as { text: string }).text).toMatch(/disabled/);
    expect(send).not.toHaveBeenCalled();
  });

  it('reports an unknown tool', async () => {
    const r = await handleApi(rw, 'POST', '/api/tool/nope', TOKEN, { args: {} });
    expect((r.body as { text: string }).text).toBe('Unknown tool: nope');
  });

  it('maps a worker-not-found tool error to 503', async () => {
    send.mockRejectedValue(new Error('Worker not found: C:\\worker.exe\nRun: npm run build:worker'));
    const r = await handleApi(rw, 'POST', '/api/tool/gx_find', TOKEN, { args: { pattern: '%X%' } });
    expect(r.status).toBe(503);
  });
});
