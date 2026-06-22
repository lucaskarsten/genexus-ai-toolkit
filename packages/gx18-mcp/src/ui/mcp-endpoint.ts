// MCP Streamable HTTP transport endpoint (spec 2025-03-26).
// A single POST /mcp handles all JSON-RPC: initialize, tools/list, tools/call.
// Used by the chat subprocess to connect to the already-running gx18 server,
// eliminating the C# worker cold-start that occurs when spawning a fresh process.

import http from 'http';
import { callTool, visibleTools } from '../dispatch';

type RpcRequest = {
  jsonrpc?: string;
  id?: number | string | null;
  method: string;
  params?: unknown;
};

type RpcResponse =
  | { jsonrpc: '2.0'; id: number | string; result: unknown }
  | { jsonrpc: '2.0'; id: number | string; error: { code: number; message: string } };

async function dispatch(r: RpcRequest, readonly: boolean): Promise<unknown | undefined> {
  if (r.method === 'initialize') {
    return {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'gx18', version: '1.0.0' },
    };
  }

  if (r.method === 'ping') return {};

  if (r.method === 'tools/list') {
    return {
      tools: visibleTools(readonly).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  if (r.method === 'tools/call') {
    const p = r.params as { name: string; arguments?: Record<string, unknown> };
    const tr = await callTool(p.name, p.arguments ?? {}, readonly);
    return { content: [{ type: 'text', text: tr.text }], isError: tr.isError };
  }

  // Notifications and unknown methods: return undefined (no response body)
  return undefined;
}

export async function handleMcp(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  body: unknown,
  readonly: boolean,
): Promise<void> {
  const items: RpcRequest[] = Array.isArray(body) ? body : [body as RpcRequest];
  const responses: RpcResponse[] = [];

  for (const r of items) {
    // Notifications have no id — no response required
    if (r.id === undefined || r.id === null) {
      try { await dispatch(r, readonly); } catch { /* ignore notification errors */ }
      continue;
    }

    let result: unknown;
    let rpcError: { code: number; message: string } | undefined;

    try {
      const out = await dispatch(r, readonly);
      if (out === undefined) {
        rpcError = { code: -32601, message: `Method not found: ${r.method}` };
      } else {
        result = out;
      }
    } catch (err) {
      rpcError = { code: -32603, message: err instanceof Error ? err.message : String(err) };
    }

    responses.push(
      rpcError
        ? { jsonrpc: '2.0', id: r.id, error: rpcError }
        : { jsonrpc: '2.0', id: r.id, result: result! },
    );
  }

  if (responses.length === 0) { res.writeHead(204).end(); return; }

  const payload = JSON.stringify(responses.length === 1 ? responses[0] : responses);
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}
