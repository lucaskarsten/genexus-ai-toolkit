import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadConfig, saveConfig, readRawConfig, detectChatConfig, loadConversations, saveConversations, ConversationRecord, Config, OracleConfig, ChatConfig } from '../config';

const pkg = require('../../package.json') as { version: string };
import { bridge } from '../sdk-bridge/bridge';
import { callTool, isReadonly, visibleTools } from '../dispatch';
import { CLIENTS, ClientId, registerClient, getServerEntry, SERVER_KEY } from '../clients';

// Transport-agnostic API handlers for the local web UI. No socket here, so these
// are unit-testable with a mocked bridge. The http adapter (src/ui/server.ts) does
// Host-allowlist + body reading and delegates routing to handleApi().

/** Placeholder shown to the browser instead of a real Oracle password. */
export const PASSWORD_MASK = '********';

export interface ApiCtx {
  /** Expected per-session token; every /api request must echo it. */
  token: string;
  /** Read-only mode (GX18_READONLY) — fixed at server start. */
  readonly: boolean;
  /** Port the server is bound to (for the Host allowlist). */
  port: number;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

/** Host-header allowlist — the canonical DNS-rebinding defense. */
export function isHostAllowed(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Constant-time token comparison; unequal lengths/null are simply not-equal. */
function tokenOk(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function maskedConfig(config: Config): Record<string, unknown> {
  const oracle = config.db.oracle
    ? { ...config.db.oracle, password: config.db.oracle.password ? PASSWORD_MASK : '' }
    : undefined;
  return {
    kbPath: config.kbPath,
    kbServer: config.kbServer,
    kbDatabase: config.kbDatabase,
    gx18Dir: config.gx18Dir,
    outputPath: config.outputPath,
    oracle,
  };
}

interface ConfigPatch {
  kbPath?: string;
  kbServer?: string;
  kbDatabase?: string;
  gx18Dir?: string;
  outputPath?: string;
  oracle?: Partial<OracleConfig> | null;
  chat?: Partial<ChatConfig> | null;
}

/**
 * Merge UI-editable fields into the RAW persisted config (never the env-merged view),
 * preserving any stored Oracle password when the browser sends back the mask sentinel.
 */
function buildConfigToSave(patch: ConfigPatch): Partial<Config> {
  const raw = readRawConfig();
  const next: Partial<Config> = { ...raw };

  for (const k of ['kbPath', 'kbServer', 'kbDatabase', 'gx18Dir', 'outputPath'] as const) {
    if (typeof patch[k] === 'string') next[k] = patch[k] as string;
  }

  if (patch.chat === null) {
    delete next.chat;
  } else if (patch.chat) {
    next.chat = { ...(raw.chat ?? {}), ...patch.chat } as ChatConfig;
  }

  if (patch.oracle === null) {
    // Explicit clear.
    if (next.db) delete next.db.oracle;
  } else if (patch.oracle) {
    const prev = raw.db?.oracle;
    const incoming = patch.oracle;
    const password =
      incoming.password === undefined || incoming.password === PASSWORD_MASK
        ? prev?.password ?? ''
        : incoming.password;
    const merged: OracleConfig = {
      host: incoming.host ?? prev?.host ?? '',
      port: incoming.port ?? prev?.port ?? 1521,
      service: incoming.service ?? prev?.service ?? '',
      user: incoming.user ?? prev?.user ?? '',
      password,
    };
    next.db = { ...(next.db ?? {}), oracle: merged };
  }

  return next;
}

function workerExists(): boolean {
  try { return fs.existsSync(loadConfig().workerExe); } catch { return false; }
}

function isWorkerMissing(message: string): boolean {
  return /Worker not found/i.test(message);
}

/**
 * Route a single /api request. `providedToken` comes from the x-gx18-token header.
 * Returns a status + JSON body; the http adapter just serializes it.
 */
export async function handleApi(
  ctx: ApiCtx,
  method: string,
  pathname: string,
  providedToken: string | undefined,
  body: unknown,
): Promise<ApiResult> {
  if (!tokenOk(providedToken, ctx.token)) {
    return { status: 401, body: { error: 'Invalid or missing token.' } };
  }

  // GET /api/config
  if (method === 'GET' && pathname === '/api/config') {
    return {
      status: 200,
      body: {
        version: pkg.version,
        config: maskedConfig(loadConfig()),
        readonly: ctx.readonly,
        workerExists: workerExists(),
        clients: CLIENTS.map((c) => {
          const entry = getServerEntry();
          return {
            id: c.id,
            label: c.label,
            path: c.path(),
            command: entry.command,
            args: entry.args,
            serverKey: SERVER_KEY,
            rootKey: c.rootKey,
          };
        }),
      },
    };
  }

  // POST /api/config
  if (method === 'POST' && pathname === '/api/config') {
    const patch = (body ?? {}) as ConfigPatch;
    saveConfig(buildConfigToSave(patch));
    return { status: 200, body: { ok: true } };
  }

  // POST /api/validate — keep the worker warm (no shutdown)
  if (method === 'POST' && pathname === '/api/validate') {
    try {
      const ping = await bridge.send<{ sdkReady: boolean; sqlReady: boolean; user: string; kbPath: string }>(
        'ping', {}, 15000,
      );
      const whoami = await bridge.send<{ windowsUser: string; kbUserId: number | null }>('whoami', {});
      return { status: 200, body: { ping, whoami } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: isWorkerMissing(message) ? 503 : 500, body: { error: message } };
    }
  }

  // POST /api/doctor — structured report, no shutdown
  if (method === 'POST' && pathname === '/api/doctor') {
    const { runDoctor } = await import('../doctor');
    try {
      return { status: 200, body: await runDoctor() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 500, body: { error: message } };
    }
  }

  // POST /api/register
  if (method === 'POST' && pathname === '/api/register') {
    const clients = ((body as { clients?: ClientId[] })?.clients ?? []) as ClientId[];
    const results = clients.map((id) => {
      try {
        return { id, path: registerClient(id), ok: true };
      } catch (err) {
        return { id, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });
    return { status: 200, body: { results } };
  }

  // GET /api/conversations
  if (method === 'GET' && pathname === '/api/conversations') {
    return { status: 200, body: { convs: loadConversations() } };
  }

  // POST /api/conversations
  if (method === 'POST' && pathname === '/api/conversations') {
    const convs = ((body as { convs?: ConversationRecord[] })?.convs ?? []) as ConversationRecord[];
    saveConversations(convs);
    return { status: 200, body: { ok: true } };
  }

  // GET /api/detect — auto-detect GX18 installs and KBs on this machine
  if (method === 'GET' && pathname === '/api/detect') {
    const { detectEnvironment } = await import('../config');
    return { status: 200, body: detectEnvironment() };
  }

  // POST /api/chat/image — save a pasted image to temp dir, return the file path
  // so Claude CLI can Read() it in the next message.
  if (method === 'POST' && pathname === '/api/chat/image') {
    const { data, mimeType } = (body ?? {}) as { data?: string; mimeType?: string };
    if (!data) return { status: 400, body: { error: 'data required' } };
    const ext = (mimeType ?? 'image/png').includes('jpeg') ? '.jpg' : '.png';
    const dest = path.join(os.tmpdir(), `gx18-img-${Date.now()}${ext}`);
    fs.writeFileSync(dest, Buffer.from(data, 'base64'));
    return { status: 200, body: { path: dest } };
  }

  // GET /api/chat/detect — auto-detect Claude CLI config
  if (method === 'GET' && pathname === '/api/chat/detect') {
    const cfg = loadConfig();
    return { status: 200, body: detectChatConfig(cfg.chat) };
  }

  // GET /api/worker/status
  if (method === 'GET' && pathname === '/api/worker/status') {
    return { status: 200, body: bridge.status() };
  }

  // POST /api/worker/restart
  if (method === 'POST' && pathname === '/api/worker/restart') {
    try {
      await bridge.restart();
      return { status: 200, body: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 500, body: { error: message } };
    }
  }

  // GET /api/tools
  if (method === 'GET' && pathname === '/api/tools') {
    const readonly = ctx.readonly;
    return { status: 200, body: { readonly, tools: visibleTools(readonly) } };
  }

  // POST /api/tool/:name
  if (method === 'POST' && pathname.startsWith('/api/tool/')) {
    const name = decodeURIComponent(pathname.slice('/api/tool/'.length));
    const args = ((body as { args?: Record<string, unknown> })?.args ?? {}) as Record<string, unknown>;
    if (WRITE_LOG.has(name)) {
      process.stderr.write(`[gx18-ui] write tool ${name} confirm=${String((args as { confirm?: unknown }).confirm)}\n`);
    }
    const result = await callTool(name, args, ctx.readonly);
    if (result.isError && isWorkerMissing(result.text)) {
      return { status: 503, body: { error: result.text } };
    }
    return { status: 200, body: result };
  }

  return { status: 404, body: { error: `Not found: ${method} ${pathname}` } };
}

// KB-mutating tools we log to stderr as an audit trail (this surface can write the live KB).
const WRITE_LOG = new Set(['gx_create', 'gx_modify', 'gx_set_property', 'gx_rename', 'gx_build', 'gx_import']);

/** Re-export so the http adapter can advertise read-only state without importing dispatch. */
export { isReadonly };
