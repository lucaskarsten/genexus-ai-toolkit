import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

const { send, shutdown } = vi.hoisted(() => ({ send: vi.fn(), shutdown: vi.fn() }));
vi.mock('../src/sdk-bridge/bridge', () => ({ bridge: { send, shutdown } }));
vi.mock('../src/config', () => ({
  loadConfig: () => ({
    kbPath: 'C:\\KBs\\X', kbServer: '(localdb)\\MSSQLLocalDB', kbDatabase: 'GX_KB_X',
    gx18Dir: 'C:\\GX18', outputPath: '.\\output', workerExe: 'C:\\worker.exe',
    logLevel: 'info', db: {},
  }),
}));

import { runDoctor } from '../src/doctor';

beforeEach(() => { vi.restoreAllMocks(); send.mockReset(); shutdown.mockReset(); });

describe('runDoctor', () => {
  it('maps checks to ok/warn/fail and never shuts the bridge down', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    send.mockImplementation(async (method: string) => {
      if (method === 'ping') return { ok: true, sdkReady: true, sqlReady: true, user: 'me', kbPath: 'C:\\KBs\\X' };
      if (method === 'sql_query') return { rows: [{ cnt: 42 }] };
      throw new Error('unexpected ' + method);
    });

    const report = await runDoctor();
    const byName = Object.fromEntries(report.checks.map((c) => [c.name, c]));
    expect(byName['Worker exe'].status).toBe('ok');
    expect(byName['Worker ping'].status).toBe('ok');
    expect(byName['SQL EntityVersion rows'].detail).toBe('42');
    expect(report.ok).toBe(true);
    expect(shutdown).not.toHaveBeenCalled();
  });

  it('reports fail when the worker exe is missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    send.mockRejectedValue(new Error('Worker not found: C:\\worker.exe'));

    const report = await runDoctor();
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'Worker exe')!.status).toBe('fail');
    expect(shutdown).not.toHaveBeenCalled();
  });
});
