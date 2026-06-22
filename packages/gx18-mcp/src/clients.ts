import path from 'path';
import fs from 'fs';
import os from 'os';

// AI-client registration for the gx18-mcp server. Shared by the inquirer `setup`
// wizard (bin/gx18-mcp.ts) and the local web UI (src/ui) so both write identical
// .mcp.json entries.

export type ClientId = 'claude-project' | 'claude-desktop' | 'cursor' | 'vscode';

export interface ClientTarget {
  id: ClientId;
  label: string;
  /** Top-level key the client expects: most use `mcpServers`, VS Code uses `servers`. */
  rootKey: 'mcpServers' | 'servers';
  /** Resolved per-call so cwd / homedir reflect the current process. */
  path(cwd?: string): string;
}

// Portable server entry — resolved from PATH so it survives reinstall/relocation
// (an absolute path to the installed dist would break on a clean machine via npx).
export const SERVER_ENTRY = {
  command: 'npx',
  args: ['-y', 'gx18-mcp', 'start'],
};

/** The server key written under rootKey (e.g. mcpServers.gx18). */
export const SERVER_KEY = 'gx18';

export const CLIENTS: ClientTarget[] = [
  {
    id: 'claude-project',
    label: 'Claude Code (project .mcp.json)',
    rootKey: 'mcpServers',
    path: (cwd = process.cwd()) => path.join(cwd, '.mcp.json'),
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop (claude_desktop_config.json)',
    rootKey: 'mcpServers',
    path: () => {
      // Microsoft Store version: AppData\Local\Packages\Claude_<id>\LocalCache\Roaming\Claude\
      const pkgBase = path.join(os.homedir(), 'AppData', 'Local', 'Packages');
      try {
        const storeDir = fs.readdirSync(pkgBase).find(d => d.startsWith('Claude_'));
        if (storeDir) {
          const storeConfig = path.join(pkgBase, storeDir, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json');
          // Return even if file doesn't exist yet — we'll create it on register
          if (fs.existsSync(path.dirname(storeConfig))) return storeConfig;
        }
      } catch { /* AppData\Local\Packages not accessible */ }
      // Standard installation: AppData\Roaming\Claude\
      return path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    },
  },
  {
    id: 'cursor',
    label: 'Cursor (.cursor/mcp.json)',
    rootKey: 'mcpServers',
    path: (cwd = process.cwd()) => path.join(cwd, '.cursor', 'mcp.json'),
  },
  {
    id: 'vscode',
    label: 'VS Code (.vscode/mcp.json)',
    rootKey: 'servers',
    path: (cwd = process.cwd()) => path.join(cwd, '.vscode', 'mcp.json'),
  },
];

/** Merge the gx18 server entry into an MCP config file, preserving other content. */
export function patchMcpJson(
  filePath: string,
  serverKey: string,
  entry: { command: string; args: string[] },
  rootKey: string = 'mcpServers',
): void {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try { existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { /* ignore */ }
  }

  const servers = (existing[rootKey] ?? {}) as Record<string, unknown>;
  servers[serverKey] = entry;
  existing[rootKey] = servers;

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
}

/** Register the gx18 server into the given client's config. Returns the written path. */
export function registerClient(id: ClientId, cwd: string = process.cwd()): string {
  const target = CLIENTS.find((c) => c.id === id);
  if (!target) throw new Error(`Unknown client: ${id}`);
  const filePath = target.path(cwd);
  patchMcpJson(filePath, SERVER_KEY, SERVER_ENTRY, target.rootKey);
  return filePath;
}
