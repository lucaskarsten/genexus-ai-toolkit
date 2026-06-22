import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { CLIENTS, SERVER_ENTRY, registerClient } from '../src/clients';

describe('client registration', () => {
  it('exposes 4 targets with the right root keys', () => {
    expect(CLIENTS.map((c) => c.id).sort()).toEqual(
      ['claude-desktop', 'claude-project', 'cursor', 'vscode'],
    );
    expect(CLIENTS.find((c) => c.id === 'vscode')!.rootKey).toBe('servers');
    expect(CLIENTS.find((c) => c.id === 'claude-project')!.rootKey).toBe('mcpServers');
  });

  beforeEach(() => { vi.restoreAllMocks(); });

  it('writes the portable npx entry under the client root key', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    let written = '';
    vi.spyOn(fs, 'writeFileSync').mockImplementation((_p, data) => { written = String(data); });

    const p = registerClient('vscode', 'C:\\proj');
    expect(p).toMatch(/\.vscode[\\/]mcp\.json$/);
    const json = JSON.parse(written);
    expect(json.servers.gx18).toEqual(SERVER_ENTRY);
    expect(SERVER_ENTRY.command).toBe('npx');
  });

  it('uses mcpServers for Claude project config', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    let written = '';
    vi.spyOn(fs, 'writeFileSync').mockImplementation((_p, data) => { written = String(data); });

    registerClient('claude-project', 'C:\\proj');
    expect(JSON.parse(written).mcpServers.gx18).toEqual(SERVER_ENTRY);
  });
});
