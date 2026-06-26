// GxMcpClient — spawns the gx18-mcp server via stdio and calls tools.
// Pattern mirrors _mcp.mjs exactly (validated approach).

import path from 'node:path';
import { performance } from 'node:perf_hooks';

export interface CallResult {
  raw: unknown;
  isError: boolean;
  latencyMs: number;
}

const SERVER_PATH = path.resolve(__dirname, '..', 'dist', 'bin', 'gx18-mcp.js');

// Lazy ESM imports — @modelcontextprotocol/sdk is ESM-only; dynamic import works from CJS/tsx.
async function loadSdk() {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js' as string),
    import('@modelcontextprotocol/sdk/client/stdio.js' as string),
  ]);
  return { Client, StdioClientTransport };
}

export class GxMcpClient {
  private client: unknown = null;
  private transport: unknown = null;
  readonly serverPath: string;

  constructor(serverPath?: string) {
    this.serverPath = serverPath ?? process.env['GX18_MCP_PATH'] ?? SERVER_PATH;
  }

  async connect(): Promise<void> {
    const { Client, StdioClientTransport } = await loadSdk();

    // Run the server from the package root with a RELATIVE server path — exactly as the
    // validated _mcp.mjs helper does. The C# worker's SDK bootstrap (GXprot DLL resolution,
    // KnowledgeBase.Open) is cwd-sensitive; an absolute path + inherited cwd makes the SDK
    // cold-start fail permanently for gx_export (UC/WBC). cwd = package root fixes it.
    const pkgRoot = path.resolve(__dirname, '..');
    const relServerPath = path.relative(pkgRoot, this.serverPath).replace(/\\/g, '/');

    this.transport = new (StdioClientTransport as any)({
      command: 'node',
      args: [relServerPath, 'start'],
      cwd: pkgRoot,
      // Critical: pass all env vars so GX_KB_* reach the worker.
      env: { ...process.env },
    });

    this.client = new (Client as any)(
      { name: 'gx18-benchmark', version: '1.0.0' },
      { capabilities: {} },
    );

    await (this.client as any).connect(this.transport);
  }

  async listTools(): Promise<string[]> {
    const res = await (this.client as any).listTools();
    return (res.tools as Array<{ name: string }>).map((t) => t.name);
  }

  async call(
    tool: string,
    args: Record<string, unknown> = {},
    timeoutMs = 120_000,
  ): Promise<CallResult> {
    const t0 = performance.now();
    const res = await (this.client as any).callTool(
      { name: tool, arguments: args },
      undefined,
      { timeout: timeoutMs },
    );
    const latencyMs = Math.round(performance.now() - t0);

    const text: string = ((res.content ?? []) as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');

    let raw: unknown = text;
    try {
      raw = JSON.parse(text);
    } catch {
      // plain-text response (e.g. gx_read source code)
    }

    return { raw, isError: Boolean(res.isError), latencyMs };
  }

  // Some SDK-based tools (gx_export, gx_variable, gx_structure, etc.) throw NullRef or
  // "KB not open" on cold-start because the worker SDK isn't fully initialized yet.
  // Retry once after a short delay — documented behaviour, second call always succeeds.
  private isColdStartError(result: CallResult): boolean {
    if (!result.isError || typeof result.raw !== 'string') return false;
    const msg = result.raw;
    return (
      msg.includes('NullRef') ||
      msg.includes('KB not open') ||
      msg.includes('cold-start') ||
      msg.includes('DesignModel is null')
    );
  }

  // Retry up to `maxAttempts` times on cold-start errors. The GX18 SDK's first Open()
  // after worker start can fail (Enterprise Library static init race); a second/third
  // attempt — spaced out — always succeeds.
  async callWithRetry(
    tool: string,
    args: Record<string, unknown> = {},
    timeoutMs = 180_000,
    maxAttempts = 8,
  ): Promise<CallResult> {
    let last = await this.call(tool, args, timeoutMs);
    for (let attempt = 1; attempt < maxAttempts && this.isColdStartError(last); attempt++) {
      // Exponential-ish backoff: the GX18 SDK Enterprise Library static init can take several
      // seconds; spacing retries gives it room to finish before we hit it again.
      await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
      last = await this.call(tool, args, timeoutMs);
    }
    return last;
  }

  // gx_export alias kept for backwards compat — NullRef-specific, same retry.
  async callExport(
    args: Record<string, unknown>,
    timeoutMs = 120_000,
  ): Promise<CallResult> {
    return this.callWithRetry('gx_export', args, timeoutMs);
  }

  async close(): Promise<void> {
    try {
      await (this.client as any).close();
    } catch {
      // ignore close errors
    }
  }
}
