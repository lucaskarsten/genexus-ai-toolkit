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
    {
      capabilities: { tools: {}, resources: {} },
      instructions: `GeneXus 18 Knowledge Base MCP server. Reads via direct SQL (zero revisions); writes via native GX18 SDK with correct Windows UserId (no Team Development corruption).

## Resources — read these first
- gx18://docs/quick-reference — Task→tool decision table, EntityTypeIds, sections, mandatory sequences
- gx18://docs/usage-guide — Complete tool reference, anti-patterns, workflow examples
- gx18://docs/entity-types — All object types with EntityTypeId, SDK type, write support
- gx18://docs/xpz-workflow — Full XPZ round-trip guide (UC AfterShow/Methods scripts)
- gx18://docs/genexus-knowledge — GeneXus 18 platform knowledge: object model, events, syntax, UC patterns

## Tool categories (47 tools)
**Read (SQL):** gx_find, gx_list, gx_get, gx_read, gx_properties, gx_structure, gx_attribute
**Analysis:** gx_analyze, gx_where_used, gx_impact, gx_dead_code, gx_search, gx_lint, gx_compare, gx_diff, gx_stats, gx_history
**Write (SDK):** gx_create, gx_modify, gx_set_property, gx_rename, gx_delete, gx_variable, gx_clone, gx_bulk_modify, gx_move
**XPZ archive:** gx_export, gx_read_xpz, gx_patch_xpz, gx_import
**Database:** gx_sql, gx_db_connections, gx_db_query
**Config/Server:** gx_save_config, gx_doctor, gx_reload, gx_validate, gx_build, gx_modules, gx_whoami

## Mandatory write sequence
1. gx_whoami — verify Windows identity (wrong UserId permanently corrupts Team Development)
2. gx_find — confirm object exists (modify) or doesn't exist (create)
3. write tool with confirm:true

## UC AfterShow/Methods scripts
gx_read cannot access these. Use: gx_export → gx_read_xpz → gx_patch_xpz → gx_import(confirm:true)
See resource gx18://docs/xpz-workflow for the full annotated workflow.

## Critical safety rule
NEVER use gxnext MCP tools to write to GeneXus 18 KBs — on 2026-06-17 this caused ~76k spurious Team Development revisions requiring 6 hours of SQL recovery. Safe gxnext tools only: export_kb_to_text, validate_kb_text_files, get_kb_property, search_modules.

## GeneXus platform knowledge
For GeneXus syntax, object model, and canonical patterns consult resource gx18://docs/genexus-knowledge or the nexa skill (skills/nexa/nexa/).${readonly ? '\n\n**READ-ONLY MODE** (GX18_READONLY=1): all write tools are disabled.' : ''}`,
    }
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
