/**
 * Unit tests for the hardened tool behaviors added in v1.9 (issues #34–#40).
 * These run without spawning the C# worker — the bridge is fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../src/sdk-bridge/bridge', () => ({ bridge: { send, shutdown: vi.fn(), restart: vi.fn() } }));

import { callTool, readonlyBlock } from '../src/dispatch';

/** Minimal WriteResult shape that satisfies assertWriteOk. */
function writeOk(name: string, entityTypeId = 34): object {
  return {
    op: 'modify', name, entityTypeId, entityId: 1,
    userId: 321, expectedUserId: 321, kbUserName: 'user', userIdOk: true, recentVersions: 1,
  };
}

beforeEach(() => { send.mockReset(); });

// ── gx_sql ─────────────────────────────────────────────────────────────────

describe('gx_sql hardening', () => {
  it('rejects readOnly:false without confirm — bridge never called', async () => {
    const r = await callTool('gx_sql', { query: 'UPDATE Foo SET Bar=1', readOnly: false }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/confirm.*true/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('accepts readOnly:false with confirm:true — query reaches bridge', async () => {
    send.mockResolvedValueOnce({ rows: [], count: 0 });
    const r = await callTool('gx_sql', { query: 'UPDATE Foo SET Bar=1', readOnly: false, confirm: true }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('sql_query', expect.objectContaining({ readOnly: false }));
  });

  it('clamps maxRows to 5000 when caller passes an excessive value', async () => {
    send.mockResolvedValueOnce({ rows: [], count: 0, truncated: true });
    await callTool('gx_sql', { query: 'SELECT 1', maxRows: 99999 }, false);
    const [, params] = send.mock.calls[0];
    expect((params as Record<string, unknown>).maxRows).toBe(5000);
  });

  it('clamps maxRows to 1 when caller passes 0 or negative', async () => {
    send.mockResolvedValueOnce({ rows: [], count: 0 });
    await callTool('gx_sql', { query: 'SELECT 1', maxRows: 0 }, false);
    const [, params] = send.mock.calls[0];
    expect((params as Record<string, unknown>).maxRows).toBe(1);
  });

  it('defaults maxRows to 1000 when not specified', async () => {
    send.mockResolvedValueOnce({ rows: [], count: 0 });
    await callTool('gx_sql', { query: 'SELECT 1' }, false);
    const [, params] = send.mock.calls[0];
    expect((params as Record<string, unknown>).maxRows).toBe(1000);
  });
});

// ── gx_modify layout validation ─────────────────────────────────────────────

describe('gx_modify layout validation', () => {
  it('rejects non-GxMultiForm content for layout section', async () => {
    const r = await callTool('gx_modify', {
      name: 'WbcFoo', type: 43, section: 'layout',
      content: '<div>not a gx layout</div>', confirm: true,
    }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/GxMultiForm/);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects empty string for layout section', async () => {
    const r = await callTool('gx_modify', {
      name: 'WbcFoo', type: 43, section: 'layout', content: '', confirm: true,
    }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/GxMultiForm/);
  });

  it('accepts content starting with <GxMultiForm and forwards to bridge', async () => {
    send.mockResolvedValueOnce(writeOk('WbcFoo', 43));
    const r = await callTool('gx_modify', {
      name: 'WbcFoo', type: 43, section: 'layout',
      content: '<GxMultiForm><WebForm /></GxMultiForm>', confirm: true,
    }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('modify',
      expect.objectContaining({ name: 'WbcFoo', section: 'layout' }),
      180000,
    );
  });
});

// ── gx_bulk_modify ──────────────────────────────────────────────────────────

describe('gx_bulk_modify hardening', () => {
  it('returns separate succeeded and failed arrays', async () => {
    send.mockResolvedValue(writeOk('X'));
    const r = await callTool('gx_bulk_modify', {
      type: 'procedure', names: ['P1', 'P2', 'P3'],
      section: 'source', content: '// ok', confirm: true,
    }, false);
    expect(r.isError).toBe(false);
    const body = JSON.parse(r.text) as { succeeded: string[]; failed: unknown[]; total: number };
    expect(body.succeeded).toEqual(['P1', 'P2', 'P3']);
    expect(body.failed).toEqual([]);
    expect(body.total).toBe(3);
  });

  it('isolates one failing item without aborting the others', async () => {
    send.mockImplementation(async (_m: string, params: Record<string, unknown>) => {
      if (params.name === 'P2') throw new Error('Object not found: P2');
      return writeOk(params.name as string);
    });
    const r = await callTool('gx_bulk_modify', {
      type: 'procedure', names: ['P1', 'P2', 'P3'],
      section: 'source', content: '// ok', confirm: true,
    }, false);
    expect(r.isError).toBe(false);
    const body = JSON.parse(r.text) as { succeeded: string[]; failed: Array<{ name: string; error: string }>; total: number };
    expect(body.succeeded).toEqual(['P1', 'P3']);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].name).toBe('P2');
    expect(body.failed[0].error).toMatch(/P2/);
    expect(body.total).toBe(3);
  });

  it('rejects missing confirm before calling bridge', async () => {
    const r = await callTool('gx_bulk_modify', {
      type: 'procedure', names: ['P1'], section: 'source', content: 'x', confirm: false,
    }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/confirm/i);
    expect(send).not.toHaveBeenCalled();
  });
});

// ── gx_delete ───────────────────────────────────────────────────────────────

describe('gx_delete hardening', () => {
  it('requires force:true in addition to confirm:true for a live delete', async () => {
    const r = await callTool('gx_delete', {
      name: 'PrcFoo', type: 'procedure', confirm: true,
    }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/force.*true/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('bypasses confirm+force when dryRun:true — bridge is called without deleting', async () => {
    send.mockResolvedValueOnce({
      op: 'delete', name: 'PrcFoo', typeKey: 'procedure',
      entityTypeId: 34, entityId: 1, deleted: false, dryRun: true,
    });
    const r = await callTool('gx_delete', {
      name: 'PrcFoo', type: 'procedure', dryRun: true,
    }, false);
    expect(r.isError).toBe(false);
    const body = JSON.parse(r.text) as { dryRun: boolean; deleted: boolean };
    expect(body.dryRun).toBe(true);
    expect(body.deleted).toBe(false);
  });

  it('proceeds when both confirm:true and force:true are supplied', async () => {
    send.mockResolvedValueOnce({
      op: 'delete', name: 'PrcFoo', typeKey: 'procedure',
      entityTypeId: 34, entityId: 1, deleted: true,
    });
    const r = await callTool('gx_delete', {
      name: 'PrcFoo', type: 'procedure', confirm: true, force: true,
    }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('delete',
      expect.objectContaining({ name: 'PrcFoo', dryRun: false }),
      180000,
    );
  });
});

// ── gx_patch_xpz ────────────────────────────────────────────────────────────

describe('gx_patch_xpz validation', () => {
  it('rejects when neither scriptName nor patches is provided', async () => {
    const spy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    try {
      const r = await callTool('gx_patch_xpz', { xpzFile: '/fake/file.xpz' }, false);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/scriptName|patches/i);
      expect(send).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it('rejects scriptName without content', async () => {
    const spy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    try {
      const r = await callTool('gx_patch_xpz', {
        xpzFile: '/fake/file.xpz', scriptName: 'AfterShow',
      }, false);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/content/i);
      expect(send).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it('sends patches array to bridge when provided', async () => {
    const spy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    send.mockResolvedValueOnce({
      ok: true, xpzFile: '/fake/file.xpz', outputFile: '/fake/out.xpz',
      scriptName: 'AfterShow', originalLength: 10, newLength: 20, patched: true,
    });
    try {
      const r = await callTool('gx_patch_xpz', {
        xpzFile: '/fake/file.xpz',
        patches: [{ scriptName: 'AfterShow', content: 'alert("hi")' }],
      }, false);
      expect(r.isError).toBe(false);
      expect(send).toHaveBeenCalledWith('patch_xpz',
        expect.objectContaining({ patches: [{ scriptName: 'AfterShow', content: 'alert("hi")' }] }),
        30000,
      );
    } finally { spy.mockRestore(); }
  });
});

// ── gx_import size cap ───────────────────────────────────────────────────────

describe('gx_import size cap', () => {
  it('rejects XPZ files larger than 50 MB before calling bridge', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 51 * 1024 * 1024 } as fs.Stats);
    try {
      const r = await callTool('gx_import', {
        xpzFile: '/fake/big.xpz', name: 'PrcBig', confirm: true,
      }, false);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/too large|50 MB/i);
      expect(send).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      statSpy.mockRestore();
    }
  });

  it('allows XPZ files exactly at or below 50 MB through to bridge', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 50 * 1024 * 1024 } as fs.Stats);
    send.mockResolvedValueOnce({
      ok: true, xpzFile: '/fake/ok.xpz', op: 'import', name: 'PrcOk',
      entityTypeId: 34, entityId: 1,
      userId: 321, expectedUserId: 321, kbUserName: 'user', userIdOk: true, recentVersions: 1,
      fullOverwrite: true, versions: [],
      importedObjects: [{ name: 'PrcOk', entityTypeId: 34, entityId: 1 }],
    });
    try {
      const r = await callTool('gx_import', {
        xpzFile: '/fake/ok.xpz', name: 'PrcOk', confirm: true,
      }, false);
      expect(r.isError).toBe(false);
      expect(send).toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      statSpy.mockRestore();
    }
  });
});

// ── gx_find array type ───────────────────────────────────────────────────────

describe('gx_find array type', () => {
  it('forwards type array to bridge unchanged', async () => {
    send.mockResolvedValueOnce([]);
    const r = await callTool('gx_find', { pattern: 'Prc%', type: [34, 43] }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('find',
      expect.objectContaining({ type: [34, 43] }),
    );
  });

  it('forwards a single type number as-is', async () => {
    send.mockResolvedValueOnce([]);
    await callTool('gx_find', { pattern: 'Prc%', type: 34 }, false);
    expect(send).toHaveBeenCalledWith('find',
      expect.objectContaining({ type: 34 }),
    );
  });

  it('rejects limit > 5000', async () => {
    const r = await callTool('gx_find', { pattern: '%', limit: 9999 }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/5000/);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects limit <= 0', async () => {
    const r = await callTool('gx_find', { pattern: '%', limit: 0 }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/limit/i);
    expect(send).not.toHaveBeenCalled();
  });
});

// ── GX18_READONLY_REASON ─────────────────────────────────────────────────────

describe('GX18_READONLY_REASON', () => {
  it('includes the reason in the blocked-write message', () => {
    const env = { GX18_READONLY: '1', GX18_READONLY_REASON: 'deploy freeze until 18:00' } as NodeJS.ProcessEnv;
    const msg = readonlyBlock('gx_create', { confirm: true }, true, env);
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/deploy freeze until 18:00/);
  });

  it('includes the reason when refusing readOnly:false on sql tools', () => {
    const env = { GX18_READONLY: '1', GX18_READONLY_REASON: 'hotfix window' } as NodeJS.ProcessEnv;
    const msg = readonlyBlock('gx_sql', { readOnly: false }, true, env);
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/hotfix window/);
  });

  it('emits no Reason: suffix when GX18_READONLY_REASON is absent', () => {
    const env = { GX18_READONLY: '1' } as NodeJS.ProcessEnv;
    const msg = readonlyBlock('gx_create', { confirm: true }, true, env);
    expect(msg).not.toBeNull();
    expect(msg).not.toMatch(/Reason:/);
  });
});
