import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { callTool, isReadonly, visibleTools } from './dispatch';
import { RESOURCES, readResource } from './resources';

const pkg = require('../package.json') as { version: string };

// The tool registry, read-only helpers, and dispatch now live in ./dispatch so the
// same logic backs both this stdio MCP server and the local web UI (src/ui).
// Re-export the pure helpers so existing importers (and tests) keep using ../src/server.
export { isReadonly, visibleTools, readonlyBlock, WRITE_TOOLS, SQL_TOOLS } from './dispatch';

export async function run(): Promise<void> {
  const readonly = isReadonly();

  const server = new Server(
    { name: 'gx18-mcp', version: pkg.version },
    { capabilities: { tools: {}, resources: {} } }
  );

  // ── Tools ────────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: visibleTools(readonly),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;
    const result = await callTool(name, a, readonly);
    return {
      content: [{ type: 'text', text: result.text }],
      isError: result.isError,
    };
  });

  // ── Resources ────────────────────────────────────────────────────────────────
  // Documentation embedded at build time (esbuild loader: { '.md': 'text' }).
  // Available to any MCP client that supports resources/list + resources/read,
  // regardless of whether the user has the git repository.

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const result = readResource(uri);
    if (!result) {
      throw new Error(`Unknown resource: ${uri}`);
    }
    return result;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[gx18-mcp] v${pkg.version} — Server started on stdio${readonly ? ' — GX18_READONLY: KB writes disabled' : ''}\n`,
  );
}
