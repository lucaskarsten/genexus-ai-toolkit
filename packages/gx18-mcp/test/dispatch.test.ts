import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the worker bridge so dispatch runs without spawning the C# worker.
// vi.hoisted lets the (hoisted) vi.mock factory reference these without TDZ errors.
const { events, send } = vi.hoisted(() => {
  const events: string[] = [];
  const send = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === 'find') return [{ name: 'A', entityId: 1, module: 'NUC' }];
    if (method === 'list') return [{ name: 'B', entityId: 2, module: 'VEN' }];
    if (method === 'search') return { pattern: params.pattern, matches: [], total: 0 };
    if (method === 'analyze') return { name: params.name, entityTypeId: params.type, entityId: 1, action: params.action, results: [] };
    if (method === 'dead_code') return { entityTypeId: params.entityTypeId, module: params.module, candidates: [], total: 0 };
    if (method === 'create') {
      events.push('start:' + params.name);
      await new Promise((r) => setTimeout(r, 10));
      events.push('end:' + params.name);
      return {
        op: 'create', name: params.name, entityTypeId: 34, entityId: 1,
        userId: 321, expectedUserId: 321, kbUserName: 'x', userIdOk: true, recentVersions: 1,
      };
    }
    if (method === 'modify') {
      return {
        op: 'modify', name: params.name, entityTypeId: 34, entityId: 1,
        userId: 321, expectedUserId: 321, kbUserName: 'x', userIdOk: true, recentVersions: 1,
      };
    }
    throw new Error('unexpected method ' + method);
  });
  return { events, send };
});

vi.mock('../src/sdk-bridge/bridge', () => ({ bridge: { send, shutdown: vi.fn() } }));

import { callTool } from '../src/dispatch';

beforeEach(() => { events.length = 0; send.mockClear(); });

describe('callTool', () => {
  it('dispatches gx_find through the bridge and returns its JSON text', async () => {
    const r = await callTool('gx_find', { pattern: '%A%' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('find', expect.objectContaining({ pattern: '%A%' }));
    expect(JSON.parse(r.text)[0].name).toBe('A');
  });

  it('returns an error result for an unknown tool', async () => {
    const r = await callTool('nope', {}, false);
    expect(r.isError).toBe(true);
    expect(r.text).toBe('Unknown tool: nope');
  });

  it('normalizes a thrown tool error into { isError, "Error: ..." }', async () => {
    // gx_create without confirm throws inside the tool; callTool catches it.
    const r = await callTool('gx_create', { type: 'procedure', name: 'P', confirm: false }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Error:.*confirm/);
    expect(send).not.toHaveBeenCalled();
  });

  it('blocks write tools in read-only mode without touching the bridge', async () => {
    const r = await callTool('gx_create', { type: 'procedure', name: 'P', confirm: true }, true);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/disabled/);
    expect(send).not.toHaveBeenCalled();
  });

  it('serializes concurrent writes (no interleave through the single worker session)', async () => {
    const p1 = callTool('gx_create', { type: 'procedure', name: 'P1', confirm: true }, false);
    const p2 = callTool('gx_create', { type: 'procedure', name: 'P2', confirm: true }, false);
    await Promise.all([p1, p2]);
    // Without the mutex this would be start:P1, start:P2, end:P1, end:P2.
    expect(events).toEqual(['start:P1', 'end:P1', 'start:P2', 'end:P2']);
  });
});

describe('gx_modify input validation', () => {
  it('rejects invalid section for procedure — fails before bridge call', async () => {
    const r = await callTool('gx_modify', {
      name: 'PrcTest', type: 34, section: 'events', content: 'x', confirm: true,
    }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/section.*events.*not valid.*procedure/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects invalid section for usercontrol and includes gx_export hint', async () => {
    const r = await callTool('gx_modify', {
      name: 'UcTest', type: 147, section: 'aftershow', content: 'x', confirm: true,
    }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/gx_export/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects unknown EntityTypeId with key=id mapping in message', async () => {
    const r = await callTool('gx_modify', {
      name: 'Foo', type: 9999, section: 'source', content: 'x', confirm: true,
    }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/9999/);
    expect(r.text).toMatch(/procedure=34/);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects missing confirm', async () => {
    const r = await callTool('gx_modify', {
      name: 'PrcTest', type: 34, section: 'source', content: 'x', confirm: false,
    }, false);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/confirm/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('accepts valid section and calls bridge', async () => {
    const r = await callTool('gx_modify', {
      name: 'PrcTest', type: 34, section: 'source', content: '// ok', confirm: true,
    }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('modify', expect.objectContaining({
      name: 'PrcTest', type: 'procedure', section: 'source',
    }), 180000);
  });
});

describe('gx_find / gx_list filters', () => {
  it('passes module and exclude to bridge for gx_find', async () => {
    const r = await callTool('gx_find', { pattern: 'Prc%', module: 'VEN', exclude: '%Test%' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('find', expect.objectContaining({
      pattern: 'Prc%', module: 'VEN', exclude: '%Test%',
    }));
  });

  it('passes exclude to bridge for gx_list', async () => {
    const r = await callTool('gx_list', { type: 34, module: 'NUC', exclude: '%V2' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('list', expect.objectContaining({
      type: 34, module: 'NUC', exclude: '%V2',
    }));
  });

  it('passes module and exclude to bridge for gx_search', async () => {
    const r = await callTool('gx_search', { pattern: 'NotifyClient', module: 'VEN', exclude: '%Test%' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('search', expect.objectContaining({
      pattern: 'NotifyClient', module: 'VEN', exclude: '%Test%',
    }), 60000);
  });

  it('passes exclude to bridge for gx_dead_code', async () => {
    const r = await callTool('gx_dead_code', { type: 34, exclude: '%Submit' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('dead_code', expect.objectContaining({
      entityTypeId: 34, exclude: '%Submit',
    }), 60000);
  });

  it('passes exclude to bridge for gx_analyze', async () => {
    const r = await callTool('gx_analyze', { name: 'PrcFoo', type: 34, action: 'usedby', exclude: '%Test%' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('analyze', expect.objectContaining({
      name: 'PrcFoo', action: 'usedby', exclude: '%Test%',
    }), 60000);
  });
});

describe('gx_where_used', () => {
  it('routes to analyze with action=usedby', async () => {
    const r = await callTool('gx_where_used', { name: 'UcNucIAInsight', type: 147 }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('analyze', expect.objectContaining({
      name: 'UcNucIAInsight', type: 147, action: 'usedby',
    }), 60000);
  });

  it('forwards exclude to analyze', async () => {
    const r = await callTool('gx_where_used', { name: 'PrcFoo', type: 34, exclude: '%Test%' }, false);
    expect(r.isError).toBe(false);
    expect(send).toHaveBeenCalledWith('analyze', expect.objectContaining({
      name: 'PrcFoo', action: 'usedby', exclude: '%Test%',
    }), 60000);
  });
});
