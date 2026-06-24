/**
 * Unit tests for analysis tool hardening (P8 / issue #35).
 * Covers input guards and limit clamping added in v1.9.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../src/sdk-bridge/bridge', () => ({ bridge: { send, shutdown: vi.fn() } }));

import { callTool } from '../src/dispatch';

beforeEach(() => { send.mockReset(); });

describe('gx_diff validation', () => {
  it('rejects missing name before calling bridge', async () => {
    const r = await callTool('gx_diff', { type: 34 }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/name/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('forwards valid call to bridge with 60s timeout', async () => {
    send.mockResolvedValueOnce({ sections: [] });
    const r = await callTool('gx_diff', { name: 'PrcFoo', type: 34 }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('diff',
      expect.objectContaining({ name: 'PrcFoo', entityTypeId: 34 }),
      60000,
    );
  });
});

describe('gx_impact validation', () => {
  it('rejects missing name before calling bridge', async () => {
    const r = await callTool('gx_impact', { type: 34 }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/name/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('forwards valid call to bridge with 60s timeout', async () => {
    send.mockResolvedValueOnce({ name: 'PrcFoo', affected: [] });
    const r = await callTool('gx_impact', { name: 'PrcFoo' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('impact',
      expect.objectContaining({ name: 'PrcFoo' }),
      60000,
    );
  });
});

describe('gx_compare validation', () => {
  it('rejects missing name', async () => {
    const r = await callTool('gx_compare', { type: 34, targetDb: 'GX_KB_Other' }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/name/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects missing targetDb', async () => {
    const r = await callTool('gx_compare', { name: 'PrcFoo', type: 34 }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/targetDb/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('forwards valid call to bridge with 60s timeout', async () => {
    send.mockResolvedValueOnce({ equal: true, diffs: [] });
    const r = await callTool('gx_compare', { name: 'PrcFoo', type: 34, targetDb: 'GX_KB_Other' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('compare',
      expect.objectContaining({ name: 'PrcFoo', targetDb: 'GX_KB_Other' }),
      60000,
    );
  });
});

describe('gx_dead_code limit clamping', () => {
  it('clamps limit to 500 when caller passes an excessive value', async () => {
    send.mockResolvedValueOnce({ candidates: [], total: 0 });
    await callTool('gx_dead_code', { limit: 9999 }, false);
    const [, params] = send.mock.calls[0];
    expect((params as Record<string, unknown>).limit).toBe(500);
  });

  it('clamps limit to 1 when caller passes 0 or negative', async () => {
    send.mockResolvedValueOnce({ candidates: [], total: 0 });
    await callTool('gx_dead_code', { limit: -5 }, false);
    const [, params] = send.mock.calls[0];
    expect((params as Record<string, unknown>).limit).toBe(1);
  });

  it('defaults limit to 50', async () => {
    send.mockResolvedValueOnce({ candidates: [], total: 0 });
    await callTool('gx_dead_code', {}, false);
    const [, params] = send.mock.calls[0];
    expect((params as Record<string, unknown>).limit).toBe(50);
  });

  it('forwards call with 60s timeout', async () => {
    send.mockResolvedValueOnce({ candidates: [], total: 0 });
    await callTool('gx_dead_code', { type: 34, limit: 100 }, false);
    expect(send).toHaveBeenCalledWith('dead_code',
      expect.objectContaining({ entityTypeId: 34, limit: 100 }),
      60000,
    );
  });
});
