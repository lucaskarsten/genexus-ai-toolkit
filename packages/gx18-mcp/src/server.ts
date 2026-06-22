import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { callTool, isReadonly, visibleTools } from './dispatch';

// The tool registry, read-only helpers, and dispatch now live in ./dispatch so the
// same logic backs both this stdio MCP server and the local web UI (src/ui).
// Re-export the pure helpers so existing importers (and tests) keep using ../src/server.
export { isReadonly, visibleTools, readonlyBlock, WRITE_TOOLS, SQL_TOOLS } from './dispatch';

export async function run(): Promise<void> {
  const readonly = isReadonly();

  const server = new Server(
    { name: 'gx18-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[gx18-mcp] Server started on stdio${readonly ? ' — GX18_READONLY: KB writes disabled' : ''}\n`,
  );
}
