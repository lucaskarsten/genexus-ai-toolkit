import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { bridge } from './sdk-bridge/bridge';
import { gxFind, gxList, gxGet } from './tools/discovery';
import { gxRead, gxProperties, gxStructure } from './tools/reader';
import { gxWhoami } from './tools/identity';
import { gxCreate, gxModify, gxSetProperty, gxRename } from './tools/writer';
import { gxValidate, gxBuild, gxSql, gxExport } from './tools/utility';
import { gxDbConnections, gxDbQuery } from './tools/database';

// EntityTypeId reference (included in descriptions for discoverability):
// Procedure=34, SDT=36, Transaction=39, WebPanel/WebComponent=43, UserControl=147, DSO=161
// Sub-components: Events=64, Rules/Source=69, Variables=72, WebForm=74

const TOOLS: Tool[] = [
  {
    name: 'gx_find',
    description:
      'Search GeneXus KB objects by name pattern (SQL LIKE). ' +
      'Returns matching entities with entityTypeId, entityId, name, lastModified. ' +
      'EntityTypeId values: Procedure=34, SDT=36, Transaction=39, WebPanel/WebComponent=43, UserControl=147, DSO=161.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'SQL LIKE pattern, e.g. "%NavHeader%" or "PrcFocco%"' },
        type: { type: 'number', description: 'Filter by EntityTypeId (optional)' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'gx_list',
    description:
      'List all GeneXus KB objects of a given type, optionally filtered by module. ' +
      'EntityTypeId values: Procedure=34, SDT=36, Transaction=39, WebPanel/WebComponent=43, UserControl=147.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'number', description: 'EntityTypeId (required). E.g. 34 for Procedures.' },
        module: { type: 'string', description: 'Module name filter (optional)' },
        limit: { type: 'number', description: 'Max results (default 100)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'gx_get',
    description:
      'Get details of a specific GeneXus KB object including its sub-components. ' +
      'Returns EntityDetail with components list (Events=64, Rules/Source=69, Variables=72, WebForm=74).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId. E.g. 34=Procedure, 43=WebPanel.' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_read',
    description:
      'Read the source code of a GeneXus KB object section. ' +
      'Sections: source (Procedure code / UC template), events (WebPanel/UC events), ' +
      'rules (Transaction/Procedure rules), layout (WebForm), variables. ' +
      'Returns the reconstructed plain-text source.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId' },
        section: {
          type: 'string',
          description: 'Section to read: source, events, rules, layout, variables (defaults by object type)',
        },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_properties',
    description: 'Read all properties of a GeneXus KB object (e.g. Title, IsPrivate, Theme). Returns a key-value map.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_structure',
    description: 'Read the attribute structure of a GeneXus Transaction (table structure with field names, types, lengths).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Transaction name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'gx_whoami',
    description:
      'Get current Windows identity as seen by the GeneXus KB. ' +
      'Returns windowsUser, kbUserId, kbPath, kbOpen, gx18Dir, sdkReady. ' +
      'Use this to verify the correct user is attached before write operations.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'gx_create',
    description:
      'Create a new GeneXus KB object. Requires confirm:true. The author (UserId) is the Windows user ' +
      'running the worker and is verified after save (no Team Development corruption). ' +
      'Provide only the sections that apply to the type:\n' +
      '- procedure: source, rules, conditions\n' +
      '- webpanel / webcomponent: events, rules, conditions, layout\n' +
      '- api: source (service group), events\n' +
      '- usercontrol: template, properties\n' +
      '- dso: tokens, styles, elements (each must use a valid header, e.g. "styles <Name> { ... }")\n' +
      '- sdt: structure (array of members)\n' +
      '- dataselector: (name only)\n' +
      'transaction: structure is accepted but transaction form auto-generation is experimental.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['procedure', 'webpanel', 'webcomponent', 'api', 'usercontrol', 'dso', 'sdt', 'dataselector', 'transaction'],
          description: 'Object type to create',
        },
        name: { type: 'string', description: 'Object name (must follow project prefix convention, e.g. PrcFoccoMyProc)' },
        module: { type: 'string', description: 'Module path (optional, e.g. "Nuc")' },
        confirm: { type: 'boolean', description: 'Must be true to execute the write' },
        source: { type: 'string', description: 'Procedure code / API service group source (optional)' },
        events: { type: 'string', description: 'Events code for webpanel/webcomponent/api (optional)' },
        rules: { type: 'string', description: 'Rules code (optional)' },
        conditions: { type: 'string', description: 'Conditions source (optional)' },
        layout: { type: 'string', description: 'WebForm layout (editable text) for webpanel/webcomponent (optional)' },
        properties: { type: 'string', description: 'UserControl properties definition (optional)' },
        template: { type: 'string', description: 'UserControl screen template (optional)' },
        tokens: { type: 'string', description: 'DSO design tokens source, e.g. "tokens <Name> { ... }" (optional)' },
        styles: { type: 'string', description: 'DSO design styles source, e.g. "styles <Name> { ... }" (optional)' },
        elements: { type: 'string', description: 'DSO design elements source (optional)' },
        structure: {
          type: 'array',
          description: 'Member/attribute definitions for sdt (members) or transaction (attributes).',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', description: 'Character, VarChar, LongVarChar, Numeric, Int, Date, DateTime, Boolean, GUID' },
              length: { type: 'number' },
              decimals: { type: 'number' },
              key: { type: 'boolean', description: 'Primary key (transactions)' },
            },
            required: ['name', 'type'],
          },
        },
      },
      required: ['type', 'name', 'confirm'],
    },
  },
  {
    name: 'gx_modify',
    description:
      'Modify a section of an existing GeneXus KB object. Requires confirm:true. ' +
      'Sections: source, events, rules, layout, variables.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId' },
        section: { type: 'string', description: 'Section to modify: source, events, rules, layout, variables' },
        content: { type: 'string', description: 'New content for the section' },
        confirm: { type: 'boolean', description: 'Must be true to execute the write' },
      },
      required: ['name', 'type', 'section', 'content', 'confirm'],
    },
  },
  {
    name: 'gx_set_property',
    description: 'Set a property on a GeneXus KB object. Requires confirm:true.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId' },
        property: { type: 'string', description: 'Property name, e.g. "Title", "IsPrivate"' },
        value: { type: 'string', description: 'Property value' },
        confirm: { type: 'boolean', description: 'Must be true to execute the write' },
      },
      required: ['name', 'type', 'property', 'value', 'confirm'],
    },
  },
  {
    name: 'gx_rename',
    description: 'Rename a GeneXus KB object. Requires confirm:true.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current object name' },
        type: { type: 'number', description: 'EntityTypeId' },
        newName: { type: 'string', description: 'New object name' },
        confirm: { type: 'boolean', description: 'Must be true to execute the rename' },
      },
      required: ['name', 'type', 'newName', 'confirm'],
    },
  },
  {
    name: 'gx_validate',
    description: 'Validate a GeneXus KB object for syntax errors and warnings without building.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_build',
    description:
      'Build (compile) a single GeneXus KB object. Requires confirm:true. ' +
      'This is a write operation — it saves the object and generates code.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId' },
        confirm: { type: 'boolean', description: 'Must be true to execute the build' },
      },
      required: ['name', 'type', 'confirm'],
    },
  },
  {
    name: 'gx_sql',
    description:
      'Execute a SQL query directly on the GeneXus KB database. ' +
      'Read-only queries (SELECT) require only query param. ' +
      'Write queries require readOnly:false AND confirm:true.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query to execute' },
        readOnly: { type: 'boolean', description: 'true (default) = SELECT only, false = allow writes' },
        confirm: { type: 'boolean', description: 'Required when readOnly:false' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gx_export',
    description:
      'Export a GeneXus KB object to a real .xpz archive via the Knowledge Manager service ' +
      '(importable into any GeneXus 18 KB). A successful export also validates the object is well-formed. ' +
      'Writes <name>.xpz to outputDir or the configured GX_OUTPUT_PATH.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId' },
        outputDir: { type: 'string', description: 'Output directory (optional, defaults to GX_OUTPUT_PATH)' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_db_connections',
    description:
      'List all configured database connections available for gx_db_query. ' +
      'Always includes "kb" (GeneXus KB SQL Server, Integrated Security). ' +
      'Also lists "oracle" when ORACLE_* env vars are set. ' +
      'Credentials are never shown — only host/database/type info.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'gx_db_query',
    description:
      'Execute SQL on a named database connection. ' +
      'connection "kb" → GeneXus KB SQL Server (Windows auth, same as gx_sql). ' +
      'connection "oracle" → Oracle database (from ORACLE_* env vars, thin mode). ' +
      'Read-only by default (readOnly:true). Writes require readOnly:false + confirm:true. ' +
      'Results are capped at 1000 rows max (use limit to control).',
    inputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'Connection name: "kb" or "oracle". Use gx_db_connections to list available ones.',
        },
        query: { type: 'string', description: 'SQL query to execute' },
        readOnly: { type: 'boolean', description: 'true (default) = SELECT only, false = allow writes (requires confirm)' },
        limit: { type: 'number', description: 'Max rows to return (default 100, max 1000)' },
        confirm: { type: 'boolean', description: 'Required when readOnly:false' },
      },
      required: ['connection', 'query'],
    },
  },
];

// ── Read-only mode ───────────────────────────────────────────────────────────
// GX18_READONLY=1 (or "true") makes KB writes UNREACHABLE at the server, not just
// guarded client-side: write tools are omitted from the advertised tool list AND
// rejected if a client calls them anyway, and gx_sql/gx_db_query refuse readOnly:false.
// The pieces below are pure/exported so they can be unit-tested without env load order.

/** KB-mutating tools — removed from the tool list and blocked in read-only mode. */
export const WRITE_TOOLS = new Set(['gx_create', 'gx_modify', 'gx_set_property', 'gx_rename', 'gx_build']);

/** Tools that can write when readOnly:false — forced to read-only in read-only mode. */
export const SQL_TOOLS = new Set(['gx_sql', 'gx_db_query']);

/** Whether the server is in read-only mode (GX18_READONLY=1|true). */
export function isReadonly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GX18_READONLY === '1' || env.GX18_READONLY?.toLowerCase() === 'true';
}

/** Tools advertised to clients: write tools hidden in read-only mode. */
export function visibleTools(readonly: boolean): Tool[] {
  return readonly ? TOOLS.filter((t) => !WRITE_TOOLS.has(t.name)) : TOOLS;
}

/** Error message if a call must be blocked in read-only mode, else null. */
export function readonlyBlock(
  name: string,
  args: Record<string, unknown>,
  readonly: boolean,
): string | null {
  if (!readonly) return null;
  if (WRITE_TOOLS.has(name)) return `Tool "${name}" is disabled: server is in GX18_READONLY mode.`;
  if (SQL_TOOLS.has(name) && args.readOnly === false) {
    return `Refusing readOnly:false on "${name}": server is in GX18_READONLY mode.`;
  }
  return null;
}

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

    try {
      // Read-only enforcement: blocks writes even if a client cached the full tool list.
      const blocked = readonlyBlock(name, a, readonly);
      if (blocked) {
        return { content: [{ type: 'text', text: blocked }], isError: true };
      }

      let text: string;

      switch (name) {
        case 'gx_find':
          text = await gxFind(a as Parameters<typeof gxFind>[0]);
          break;
        case 'gx_list':
          text = await gxList(a as Parameters<typeof gxList>[0]);
          break;
        case 'gx_get':
          text = await gxGet(a as Parameters<typeof gxGet>[0]);
          break;
        case 'gx_read':
          text = await gxRead(a as Parameters<typeof gxRead>[0]);
          break;
        case 'gx_properties':
          text = await gxProperties(a as Parameters<typeof gxProperties>[0]);
          break;
        case 'gx_structure':
          text = await gxStructure(a as Parameters<typeof gxStructure>[0]);
          break;
        case 'gx_whoami':
          text = await gxWhoami();
          break;
        case 'gx_create':
          text = await gxCreate(a as Parameters<typeof gxCreate>[0]);
          break;
        case 'gx_modify':
          text = await gxModify(a as Parameters<typeof gxModify>[0]);
          break;
        case 'gx_set_property':
          text = await gxSetProperty(a as Parameters<typeof gxSetProperty>[0]);
          break;
        case 'gx_rename':
          text = await gxRename(a as Parameters<typeof gxRename>[0]);
          break;
        case 'gx_validate':
          text = await gxValidate(a as Parameters<typeof gxValidate>[0]);
          break;
        case 'gx_build':
          text = await gxBuild(a as Parameters<typeof gxBuild>[0]);
          break;
        case 'gx_sql':
          text = await gxSql(a as Parameters<typeof gxSql>[0]);
          break;
        case 'gx_export':
          text = await gxExport(a as Parameters<typeof gxExport>[0]);
          break;
        case 'gx_db_connections':
          text = await gxDbConnections();
          break;
        case 'gx_db_query':
          text = await gxDbQuery(a as Parameters<typeof gxDbQuery>[0]);
          break;
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[gx18-mcp] Server started on stdio${readonly ? ' — GX18_READONLY: KB writes disabled' : ''}\n`,
  );
}
