import crypto from 'crypto';
import http from 'http';
import { spawn } from 'child_process';

import { handleApi, isHostAllowed, isReadonly, ApiCtx } from './api';
import { INDEX_HTML } from './page';
import { bridge } from '../sdk-bridge/bridge';
import { logBuffer, logEmitter, LogEntry } from './log-bus';

export interface UiServerOptions {
  /** Explicit port — disables the fallback scan (errors if busy, so the URL is deterministic). */
  port?: number;
  /** Open the browser on start (default true). */
  open?: boolean;
}

export interface RunningUi {
  url: string;
  port: number;
  close(): Promise<void>;
}

const DEFAULT_PORT = 7337;
const FALLBACK_RANGE = 10; // try DEFAULT_PORT .. DEFAULT_PORT+9 when no explicit port
const MAX_BODY = 1_000_000; // 1 MB cap on request bodies

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooBig = false;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY) { tooBig = true; req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('Request body too large'));
      if (chunks.length === 0) return resolve(undefined);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown, contentType = 'application/json'): void {
  const payload = contentType === 'application/json' ? JSON.stringify(body) : String(body);
  res.writeHead(status, {
    'content-type': contentType + '; charset=utf-8',
    'x-content-type-options': 'nosniff',
    // No CORS allow headers — browsers block cross-origin reads of our responses.
  });
  res.end(payload);
}

function openBrowser(url: string): void {
  try {
    // Windows-targeted package; `start` needs an empty title arg before the URL.
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* non-fatal — the URL is always printed by the caller */ }
}

function listenOn(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => { server.removeListener('listening', onListening); reject(err); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

export async function startUi(opts: UiServerOptions = {}): Promise<RunningUi> {
  const readonly = isReadonly();
  const token = crypto.randomBytes(16).toString('hex'); // 32-char hex session token

  let boundPort = 0;
  const ctx: ApiCtx = { readonly, port: 0, token };

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, ctx);
  });

  // Pick a port: explicit = no fallback; default = scan a small range.
  if (opts.port != null) {
    await listenOn(server, opts.port);
    boundPort = opts.port;
  } else {
    let lastErr: unknown;
    for (let p = DEFAULT_PORT; p < DEFAULT_PORT + FALLBACK_RANGE; p++) {
      try { await listenOn(server, p); boundPort = p; break; }
      catch (err) {
        lastErr = err;
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
      }
    }
    if (!boundPort) {
      throw new Error(
        `No free port in ${DEFAULT_PORT}-${DEFAULT_PORT + FALLBACK_RANGE - 1}. ` +
        `Last error: ${String(lastErr)}`,
      );
    }
  }

  ctx.port = boundPort;
  const url = `http://127.0.0.1:${boundPort}/`;
  if (opts.open !== false) openBrowser(url);

  return {
    url,
    port: boundPort,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await bridge.shutdown();
    },
  };
}

function handleLogSse(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });

  // Drain the ring buffer immediately so new subscribers see recent history.
  for (const entry of logBuffer) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  const onLog = (entry: LogEntry) => {
    try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch { /* client gone */ }
  };
  logEmitter.on('log', onLog);

  req.on('close', () => { logEmitter.removeListener('log', onLog); });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, ctx: ApiCtx): Promise<void> {
  // Host-header allowlist on EVERY route (incl. GET /) — DNS-rebinding defense.
  if (!isHostAllowed(req.headers.host, ctx.port)) {
    send(res, 403, { error: 'Forbidden host.' });
    return;
  }

  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${ctx.port}`);
  const pathname = url.pathname;

  // Reject any preflight we didn't originate.
  if (method === 'OPTIONS') { send(res, 403, { error: 'Forbidden.' }); return; }

  // Static page (ungated, carries no token — the token lives only in the URL fragment).
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    send(res, 200, INDEX_HTML, 'text/html');
    return;
  }
  if (method === 'GET' && pathname === '/favicon.ico') { res.writeHead(204).end(); return; }

  // MCP Streamable HTTP endpoint — used by the chat subprocess to connect to this
  // already-running server instead of spawning a fresh gx18-mcp process.
  // No token required: bound to 127.0.0.1 only (Host allowlist above).
  if (method === 'POST' && pathname === '/mcp') {
    let mcpBody: unknown;
    try { mcpBody = await readBody(req); } catch { send(res, 400, { error: 'Invalid JSON' }); return; }
    const { handleMcp } = await import('./mcp-endpoint');
    await handleMcp(req, res, mcpBody, ctx.readonly);
    return;
  }

  if (pathname.startsWith('/api/')) {
    // Chat streaming (POST /api/chat) — agentic loop with SSE response.
    if (method === 'POST' && pathname === '/api/chat') {
      let chatBody: unknown;
      try { chatBody = await readBody(req); } catch (e) { send(res, 400, { error: String(e) }); return; }
      const { message, sessionId } = (chatBody ?? {}) as { message?: string; sessionId?: string | null };
      if (!message) { send(res, 400, { error: 'message is required' }); return; }
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
        'x-accel-buffering': 'no',
      });
      const ac = new AbortController();
      req.on('close', () => ac.abort());
      const { streamChat } = await import('./chat');
      await streamChat(message, sessionId ?? null, ctx.readonly, res, ac.signal, ctx.port);
      res.end();
      return;
    }

    // SSE log stream: long-lived — handled before the normal JSON adapter.
    if (method === 'GET' && pathname === '/api/logs') {
      handleLogSse(req, res);
      return;
    }

    const requestToken = (req.headers['x-auth-token'] as string | undefined)
      ?? req.headers.authorization?.replace(/^Bearer\s+/i, '');

    let body: unknown;
    if (method === 'POST') {
      try { body = await readBody(req); }
      catch (err) { send(res, 400, { error: err instanceof Error ? err.message : String(err) }); return; }
    }
    try {
      const result = await handleApi(ctx, method, pathname, requestToken, body);
      send(res, result.status, result.body);
    } catch (err) {
      send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  send(res, 404, { error: 'Not found.' });
}
