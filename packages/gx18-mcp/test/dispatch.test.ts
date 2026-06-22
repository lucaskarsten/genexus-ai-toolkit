import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the worker bridge so dispatch runs without spawning the C# worker.
// vi.hoisted lets the (hoisted) vi.mock factory reference these without TDZ errors.
const { events, send } = vi.hoisted(() => {
  const events: string[] = [];
  const send = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === 'find') return [{ name: 'A', entityId: 1 }];
    if (method === 'create') {
      events.push('start:' + params.name);
      await new Promise((r) => setTimeout(r, 10));
      events.push('end:' + params.name);
      return {
        op: 'create', name: params.name, entityTypeId: 34, entityId: 1,
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
