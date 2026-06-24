import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { gxFind, gxList, gxGet, gxAnalyze, gxWhereUsed, gxHistory } from './tools/discovery';
import { gxRead, gxProperties, gxStructure, gxAttribute } from './tools/reader';
import { gxWhoami } from './tools/identity';
import { gxCreate, gxModify, gxSetProperty, gxRename, gxImport, gxDelete, gxVariable, gxClone, gxBulkModify } from './tools/writer';
import { gxValidate, gxBuild, gxSql, gxExport, gxReadXpz, gxPatchXpz, gxSaveConfig, gxSearch, gxDoctor, gxReload } from './tools/utility';
import { gxDbConnections, gxDbQuery, gxMove } from './tools/database';
import { gxStats, gxModules, gxDiff, gxDeadCode, gxImpact, gxCompare, gxLint } from './tools/analysis';

// EntityTypeId reference (included in descriptions for discoverability):
// Procedure=34, SDT=36, Transaction=39, WebPanel/WebComponent=43, UserControl=147, DSO=161
// Sub-components: Events=64, Rules/Source=69, Variables=72, WebForm=74
// NOTE: 43 is the SDK value for WebPanel and WebComponent (both). Raw SQL on EntityVersion
// may return different values depending on the KB — always use 43 for tool calls.

// Single source of truth for the tool registry. Kept module-private and exposed
// only via visibleTools(); both the stdio MCP server (src/server.ts) and the local
// web UI (src/ui) dispatch through callTool() below — so read-only enforcement and
// write serialization live in exactly one place.
const TOOLS: Tool[] = [
  {
    name: 'gx_find',
    description:
      'Search GeneXus KB objects by name pattern (SQL LIKE). ' +
      'Returns matching entities with entityTypeId, entityId, name, lastModified. ' +
      'EntityTypeId values: Procedure=34, SDT=36, Transaction=39, WebPanel/WebComponent=43, UserControl=147, DSO=161. ' +
      'PREFER this over manual SQL on EntityVersion for name lookups. ' +
      'Always call gx_find first to confirm the object exists and get its real entityTypeId before reading or writing.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'SQL LIKE pattern, e.g. "%NavHeader%" or "PrcFocco%"' },
        type: {
          description: 'Filter by EntityTypeId. Pass a single number (e.g. 34) or an array (e.g. [34, 43]) to match multiple types at once.',
          oneOf: [
            { type: 'number' },
            { type: 'array', items: { type: 'number' } },
          ],
        },
        limit: { type: 'number', description: 'Max results (default 50, max 5000)' },
        module: { type: 'string', description: 'Filter by module name (exact match, optional)' },
        exclude: { type: 'string', description: 'Exclude objects whose name matches this SQL LIKE pattern (e.g. "%Test%", "%Submit")' },
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
        exclude: { type: 'string', description: 'Exclude names matching this SQL LIKE pattern (e.g. "%V2", "Prc%Test%")' },
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
      'Returns the reconstructed plain-text source. ' +
      'NEVER read the generated Java in javaoracle/ or render.js in static/ — use this tool instead. ' +
      'IMPORTANT: UserControl AfterShow and Methods scripts are NOT included in any gx_read section — ' +
      'use gx_export to get the .xpz archive, then read the CDATA blocks inside it.',
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
    description:
      'Read all properties of a GeneXus KB object (e.g. Title, IsPrivate, Theme). Returns a key-value map of actual property VALUES. ' +
      'PREFER this over gx_read with section=properties — that returns the property definitions XML, not the values.',
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
    description:
      'Read the attribute structure of a GeneXus Transaction — the table schema with field names, types, lengths, decimals, and key flags. ' +
      'Returns the decoded level/attribute hierarchy directly from the KB blob, without hitting Oracle. ' +
      'Use this instead of raw SQL on EntityVersionComposition when you need to understand TRN fields before reading or writing related data.',
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
      'ALWAYS call this before any write operation (gx_create, gx_modify, gx_import). ' +
      'Wrong UserId corrupts Team Development authorship — verify first.',
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
      'Sections: source, events, rules, layout, variables. ' +
      'Use this for existing objects — NOT gx_import (import does not overwrite existing objects). ' +
      'IMPORTANT: gx_modify cannot reach UserControl AfterShow/Methods scripts. ' +
      'For those, use the round-trip: gx_export → patch CDATA in .xpz → gx_import with fullOverwrite:true. ' +
      'For DSO styles, pass the friendly @import name (e.g. "@import DsoBase;"), NOT the GUID form.',
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
    description:
      'Set a named property on a GeneXus KB object. Requires confirm:true. ' +
      'Common property names: "Title" (display name), "IsPrivate" (bool), "Theme" (string), "MainProgram" (bool), "AccessLevel". ' +
      'Property names are case-sensitive and must match the GeneXus property key exactly — use gx_properties first to list valid names and current values. ' +
      'ALWAYS call gx_whoami before writing to verify the correct Windows identity.',
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
    description:
      'Rename a GeneXus KB object. Requires confirm:true. ' +
      'The rename updates the object\'s EntityVersionName in the KB and propagates to all caller objects that reference it by name — ' +
      'run gx_where_used first to understand the impact before renaming. ' +
      'ALWAYS call gx_whoami before writing. Note: renaming a UserControl also requires re-deploying static assets (the render.js is named after the UC).',
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
      'Attempt to build (compile) a GeneXus KB object. Requires confirm:true. ' +
      'NOTE: Headless compilation is NOT supported — this tool always returns a descriptive error. ' +
      'Use GX18 IDE (F5 / Build All) to compile. gx_modify saves source to the KB; build from IDE generates the code.',
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
      'Execute a SQL query directly on the GeneXus KB database (SQL Server, Windows auth). ' +
      'PREFER this over gx_db_query with connection="kb" — they hit the same database but gx_sql is direct. ' +
      'For Oracle queries, use gx_db_query with connection="oracle" instead. ' +
      'Read-only queries (SELECT) require only query param. ' +
      'Write queries require readOnly:false AND confirm:true.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query to execute' },
        readOnly: { type: 'boolean', description: 'true (default) = SELECT only, false = allow writes (requires confirm:true)' },
        maxRows: { type: 'number', description: 'Max rows to return (default 1000, max 5000). Result includes truncated:true when capped.' },
        confirm: { type: 'boolean', description: 'Required when readOnly:false' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gx_export',
    description:
      'Export one or more GeneXus KB objects to a real .xpz archive via the Knowledge Manager service ' +
      '(importable into any GeneXus 18 KB). A successful export also validates objects are well-formed. ' +
      'Single object: pass name + type. Multiple objects of the same type: pass names (array) + type. ' +
      'Writes <name>.xpz (or <first>_and_N_more.xpz) to outputDir or the configured GX_OUTPUT_PATH. ' +
      'This is the ONLY way to access UserControl AfterShow and Methods scripts — ' +
      'they are stored as CDATA blocks inside the .xpz XML and are not reachable via gx_read. ' +
      'Also use as the first step of the edit round-trip: gx_export → patch CDATA → gx_import.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name (single-object export). Use names for multi-object.' },
        names: { type: 'array', items: { type: 'string' }, description: 'Array of object names to export into one .xpz (all must share the same type).' },
        type: { type: 'number', description: 'EntityTypeId (all exported objects must share the same type)' },
        outputDir: { type: 'string', description: 'Output directory (optional, defaults to GX_OUTPUT_PATH)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'gx_import',
    description:
      'Import a .xpz archive into the GeneXus KB via the native Knowledge Manager service. Requires confirm:true. ' +
      'This is the safe GX18-native import (NOT the gxnext mass-import that corrupts Team Development): the author ' +
      '(UserId) is the Windows user running the worker, verified after import. Footprint = the object + its parts only. ' +
      'Use the export → edit the .xpz → import round-trip to change sections the SDK write path cannot reach ' +
      '(e.g. UserControl AfterShow/Methods scripts, stored as CDATA in the .xpz). ' +
      'Pass name + type of the primary object so the post-import UserId guard can verify it.',
    inputSchema: {
      type: 'object',
      properties: {
        xpzFile: { type: 'string', description: 'Absolute path to the .xpz file to import' },
        type: {
          type: 'string',
          enum: ['procedure', 'webpanel', 'webcomponent', 'api', 'usercontrol', 'dso', 'sdt', 'dataselector', 'transaction'],
          description: 'Type of the primary object in the archive (for the result echo)',
        },
        name: { type: 'string', description: 'Name of the primary object (used for post-import UserId verification)' },
        fullOverwrite: { type: 'boolean', description: 'Overwrite existing objects (default true). false = ImportOptions.Default.' },
        confirm: { type: 'boolean', description: 'Must be true to execute the import' },
      },
      required: ['xpzFile', 'name', 'confirm'],
    },
  },
  {
    name: 'gx_read_xpz',
    description:
      'Read the scripts inside a .xpz archive (GeneXus export format). ' +
      'Without scriptName: lists all <Script> elements with name and byte length. ' +
      'With scriptName: returns the full CDATA content of that script (e.g. "AfterShow", "Tooltip", or any method name). ' +
      'Use partFilter to narrow the listing (e.g. partFilter="AfterShow" lists only scripts whose name contains "AfterShow"). ' +
      'No KB connection required — operates directly on the .xpz file. ' +
      'Use after gx_export to inspect scripts, then gx_patch_xpz to modify.',
    inputSchema: {
      type: 'object',
      properties: {
        xpzFile: { type: 'string', description: 'Absolute path to the .xpz file' },
        scriptName: { type: 'string', description: 'Script name to read (e.g. "AfterShow"). Omit to list all scripts.' },
        partFilter: { type: 'string', description: 'Substring filter for script names when listing (no scriptName). E.g. "AfterShow" to list only AfterShow scripts.' },
      },
      required: ['xpzFile'],
    },
  },
  {
    name: 'gx_patch_xpz',
    description:
      'Patch one or more script CDATA blocks in a .xpz archive, writing the result to a NEW file (original is never modified). ' +
      'Single patch: pass scriptName + content. Multi-patch: pass patches array [{scriptName, content}, ...] — all scripts are updated in one ZIP pass. ' +
      'Also bumps lastUpdate and zeroes checksum on <Object> elements. ' +
      'No KB write — produces a local patched .xpz only. Content must NOT contain the literal sequence "]]>". ' +
      'Workflow: gx_export → gx_read_xpz (inspect) → gx_patch_xpz → gx_import(confirm:true) to apply to KB.',
    inputSchema: {
      type: 'object',
      properties: {
        xpzFile: { type: 'string', description: 'Absolute path to the source .xpz file' },
        scriptName: { type: 'string', description: 'Script name to patch (e.g. "AfterShow"). Use patches for multi-script.' },
        content: { type: 'string', description: 'New CDATA content for the script (single-patch mode). Must not contain "]]>".' },
        patches: {
          type: 'array',
          description: 'Multi-patch mode: array of {scriptName, content} objects. Applied in order, single ZIP write.',
          items: {
            type: 'object',
            properties: {
              scriptName: { type: 'string', description: 'Script name to patch.' },
              content: { type: 'string', description: 'New CDATA content. Must not contain "]]>".' },
            },
            required: ['scriptName', 'content'],
          },
        },
        outputFile: { type: 'string', description: 'Output path for the patched .xpz (default: <original>_patched.xpz in same dir)' },
      },
      required: ['xpzFile'],
    },
  },
  {
    name: 'gx_save_config',
    description:
      'Update the gx18-mcp server configuration (KB path, database, SQL Server instance, GX18 install dir). ' +
      'Changes are saved immediately and the worker restarts to pick up the new KB connection. ' +
      'Only provide the fields you want to change — omitted fields keep their current values. ' +
      'Use this when the user asks to switch KB, change database, or reconfigure the server.',
    inputSchema: {
      type: 'object',
      properties: {
        kbPath: { type: 'string', description: 'Path to the GeneXus KB folder (containing the .gxw file), e.g. C:\\KBs\\FoccoLojas_03' },
        kbDatabase: { type: 'string', description: 'SQL Server database name, e.g. GX_KB_FoccoLojas_03' },
        kbServer: { type: 'string', description: 'SQL Server instance, e.g. (localdb)\\MSSQLLocalDB' },
        gx18Dir: { type: 'string', description: 'GeneXus 18 install directory, e.g. C:\\Program Files (x86)\\GeneXus\\GeneXus18U6' },
      },
    },
  },
  {
    name: 'gx_db_connections',
    description:
      'List all configured database connections available for gx_db_query, with live ping status. ' +
      'Always includes "kb" (GeneXus KB SQL Server, Integrated Security). ' +
      'Also lists "oracle" when ORACLE_* env vars are set. ' +
      'Credentials are never shown — only host/database/type info. ' +
      'Each entry includes ping:true/false showing whether the connection is reachable right now.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'gx_db_query',
    description:
      'Execute SQL on a named database connection. ' +
      'connection "kb" → GeneXus KB SQL Server (Windows auth, same as gx_sql — prefer gx_sql for KB queries). ' +
      'connection "oracle" → Oracle database via ODP.NET Managed (supports NNE); use this for Oracle, NOT gx_sql. ' +
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
        params: {
          type: 'object',
          description: 'Named bind parameters for Oracle queries (e.g. { "name": "Focco%" }). Prevents SQL injection. Oracle only.',
          additionalProperties: { type: ['string', 'number'] },
        },
        confirm: { type: 'boolean', description: 'Required when readOnly:false' },
      },
      required: ['connection', 'query'],
    },
  },
  {
    name: 'gx_delete',
    description:
      'Delete a GeneXus KB object. Irreversible — requires BOTH confirm:true AND force:true to execute. ' +
      'ALWAYS use dryRun:true first to preview what would be deleted without making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: {
          type: 'string',
          enum: ['procedure', 'webpanel', 'webcomponent', 'api', 'usercontrol', 'dso', 'sdt', 'dataselector', 'transaction'],
          description: 'Object type key',
        },
        dryRun: { type: 'boolean', description: 'Preview the delete without executing (default false). Use this first.' },
        confirm: { type: 'boolean', description: 'Must be true to execute (not required for dryRun)' },
        force: { type: 'boolean', description: 'Must be true to execute alongside confirm:true. Double-gate against accidental deletes.' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_variable',
    description:
      'Manage variables on a GeneXus KB object. ' +
      'action=list: returns all declared variables (name, type, length, collection flag) — no confirm needed. ' +
      'action=add: declares a new variable; dataType must be one of Character, VarChar, Numeric, Int, Date, DateTime, Boolean, GUID; add confirm:true. ' +
      'action=delete: removes a variable by name; requires confirm:true. ' +
      'ALWAYS call gx_whoami before add/delete. Prefer gx_create sections.variables for bulk variable declarations on new objects.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'delete', 'update'], description: 'Operation: list (no confirm), add/delete/update (require confirm:true)' },
        name: { type: 'string', description: 'Exact object name' },
        type: {
          type: 'string',
          enum: ['procedure', 'webpanel', 'webcomponent', 'api', 'usercontrol', 'dso', 'sdt', 'dataselector', 'transaction'],
          description: 'Object type key',
        },
        varName: { type: 'string', description: 'Variable name (required for add/delete)' },
        dataType: { type: 'string', description: 'Data type for add: Character, VarChar, Numeric, Int, Date, DateTime, Boolean, GUID (default Character)' },
        length: { type: 'number', description: 'Length for add (optional)' },
        decimals: { type: 'number', description: 'Decimals for add (optional)' },
        isCollection: { type: 'boolean', description: 'Mark as collection for add (optional)' },
        confirm: { type: 'boolean', description: 'Must be true for add/delete' },
      },
      required: ['action', 'name', 'type'],
    },
  },
  {
    name: 'gx_search',
    description:
      'Search for a text pattern across GeneXus KB object sources (procedures, events, rules). ' +
      'Returns matching objects with line-level context. ' +
      'Use this to find where a procedure, attribute, or constant is referenced.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text pattern to search for (case-insensitive substring)' },
        type: { type: 'number', description: 'Filter by EntityTypeId (optional, 0 = all)' },
        section: { type: 'string', description: 'Section to search: source, events (default: all)' },
        limit: { type: 'number', description: 'Max matching objects to return (default 20)' },
        module: { type: 'string', description: 'Restrict search to objects in this module (optional)' },
        exclude: { type: 'string', description: 'Skip objects whose name matches this SQL LIKE pattern (e.g. "%Test%")' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'gx_analyze',
    description:
      'Analyze cross-object impact and dependencies. ' +
      'action=usedby: find objects that reference this object by name. ' +
      'action=uses: find objects referenced from this object\'s source. ' +
      'action=dependencies: alias for uses.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId of the object' },
        action: { type: 'string', enum: ['usedby', 'uses', 'dependencies'], description: 'Analysis direction (default usedby)' },
        limit: { type: 'number', description: 'Max results (default 50)' },
        exclude: { type: 'string', description: 'Exclude results whose name matches this SQL LIKE pattern' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_history',
    description:
      'Get the revision history of a GeneXus KB object — all EntityVersion rows with author, timestamp, and description. ' +
      'Useful for auditing who changed what and when.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId' },
        limit: { type: 'number', description: 'Max revisions to return (default 10)' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_move',
    description:
      'Move a GeneXus KB object to a different module. Requires confirm:true. ' +
      'Updates ModelEntityVersion — the change is reflected in GX18 IDE after reload. ' +
      'To list available modules: gx_sql with "SELECT ev.EntityVersionName FROM EntityVersion ev WHERE ev.EntityTypeId=100 ORDER BY ev.EntityVersionName".',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact object name' },
        type: { type: 'number', description: 'EntityTypeId (e.g. 34=Procedure, 147=UserControl, 43=WebPanel)' },
        targetModule: { type: 'string', description: 'Target module name (e.g. "Nuc", "VEN", "UserControls")' },
        confirm: { type: 'boolean', description: 'Must be true to execute the move' },
      },
      required: ['name', 'type', 'targetModule', 'confirm'],
    },
  },
  {
    name: 'gx_doctor',
    description:
      'Health check for the gx18-mcp server: verifies worker exe, GX18 install dir, KB path, worker ping, and SQL connectivity. ' +
      'Run this when the server is not responding or when diagnosing connection issues.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'gx_reload',
    description:
      'Restart the SDK worker, forcing the KB to be reopened fresh. ' +
      'Use this after any direct SQL write (gx_sql readOnly:false) that modifies KB schema or metadata ' +
      '(e.g. INSERTing properties, updating EntityVersion). ' +
      'The worker restarts in ~30s (cold-start). No arguments required.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'gx_stats',
    description: 'KB statistics: object counts by type and module, recently modified objects.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        module: { type: 'string', description: 'Filter by module name (optional).' },
      },
      required: [],
    },
  },
  {
    name: 'gx_modules',
    description: 'List all modules in the KB with their hierarchy (id, name, parentId).',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'gx_diff',
    description: 'Diff between two EntityVersion revisions of an object. Omit versionA/versionB to diff the two most recent versions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Object name.' },
        type: { type: 'number', description: 'EntityTypeId (34=Proc, 43=WBP, 147=UC, 161=DSO…).' },
        section: { type: 'string', description: 'Section name (default: source).' },
        versionA: { type: 'number', description: 'EntityVersionId A (older). Omit for auto.' },
        versionB: { type: 'number', description: 'EntityVersionId B (newer). Omit for auto.' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_dead_code',
    description: 'Find objects of a given type that have no inbound references in the KB source blobs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'number', description: 'EntityTypeId to scan (default: 34=Procedure).' },
        module: { type: 'string', description: 'Restrict to objects in this module (optional).' },
        limit: { type: 'number', description: 'Max candidates to check (default: 50).' },
        exclude: { type: 'string', description: 'Skip candidates whose name matches this SQL LIKE pattern — useful to exclude known entry points (e.g. "%Submit", "Prc%Seed%").' },
      },
      required: [],
    },
  },
  {
    name: 'gx_where_used',
    description:
      'Find all objects that reference a given object by name in their source, events, or rules. ' +
      'Simpler alias for gx_analyze with action=usedby. ' +
      'Use exclude to filter out known false positives.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Object name to find references to' },
        type: { type: 'number', description: 'EntityTypeId of the object (34=Procedure, 147=UserControl, 43=WebPanel, etc.)' },
        limit: { type: 'number', description: 'Max results (default 50)' },
        exclude: { type: 'string', description: 'Exclude results whose name matches this SQL LIKE pattern' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'gx_impact',
    description: 'Transitive impact analysis: which objects would be affected if the given object changes. Traverses the usedby graph up to `depth` levels.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Object name.' },
        type: { type: 'number', description: 'EntityTypeId (optional, improves accuracy).' },
        depth: { type: 'number', description: 'Max traversal depth (default: 2, max: 5).' },
      },
      required: ['name'],
    },
  },
  {
    name: 'gx_attribute',
    description: 'List KB attributes (EntityTypeId=24) with their type, length, decimals, domain, and description.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', description: 'SQL LIKE pattern to filter by name (e.g. "Client%").' },
        limit: { type: 'number', description: 'Max results (default: 100).' },
      },
      required: [],
    },
  },
  {
    name: 'gx_compare',
    description: 'Compare an object\'s source between the current KB and another KB on the same SQL Server instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Object name.' },
        type: { type: 'number', description: 'EntityTypeId.' },
        targetDb: { type: 'string', description: 'Target SQL Server database name (e.g. "GX_KB_FoccoLojas_03").' },
        section: { type: 'string', description: 'Section to compare (default: source).' },
      },
      required: ['name', 'type', 'targetDb'],
    },
  },
  {
    name: 'gx_lint',
    description: 'Scan GeneXus object sources for known bad patterns (jQuery reflow, missing guards, hard-coded user IDs, etc.).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'number', description: 'EntityTypeId to scan (default: 147=UserControl).' },
        module: { type: 'string', description: 'Restrict to objects in this module (optional).' },
        severity: { type: 'string', enum: ['error', 'warn', 'info'], description: 'Filter by minimum severity (optional).' },
      },
      required: [],
    },
  },
  {
    name: 'gx_clone',
    description:
      'Clone an existing GeneXus object to a new name, copying all source sections. Requires confirm:true. ' +
      'Use cases: creating a new object based on a similar one (faster than gx_create from scratch), or making a backup before a risky refactor. ' +
      'The clone lands in the root module unless you specify a target module. ' +
      'ALWAYS call gx_whoami before cloning; run gx_find on the newName first to confirm it does not already exist.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Object type key (procedure, webpanel, dso, usercontrol, etc.).' },
        name: { type: 'string', description: 'Source object name.' },
        newName: { type: 'string', description: 'New object name.' },
        module: { type: 'string', description: 'Target module (optional, defaults to root).' },
        confirm: { type: 'boolean', description: 'Must be true to execute the clone.' },
      },
      required: ['type', 'name', 'newName', 'confirm'],
    },
  },
  {
    name: 'gx_bulk_modify',
    description:
      'Apply the same section content to multiple GeneXus objects in a single call. Requires confirm:true. ' +
      'Writes are serialized one-at-a-time (the SDK worker is single-session); a failed object stops the batch and reports which objects succeeded. ' +
      'Use case: standardizing a DSO styles block across several DSOs, or applying the same rules block to a set of procedures. ' +
      'ALWAYS call gx_whoami first. For heterogeneous changes (different content per object) call gx_modify individually instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Object type key (procedure, webpanel, dso, etc.).' },
        names: { type: 'array', items: { type: 'string' }, description: 'List of object names to modify.' },
        section: { type: 'string', description: 'Section to replace (source, events, rules, styles, etc.).' },
        content: { type: 'string', description: 'New content for the section.' },
        confirm: { type: 'boolean', description: 'Must be true to execute.' },
      },
      required: ['type', 'names', 'section', 'content', 'confirm'],
    },
  },
];

// ── Read-only mode ───────────────────────────────────────────────────────────
// GX18_READONLY=1 (or "true") makes KB writes UNREACHABLE at the server, not just
// guarded client-side: write tools are omitted from the advertised tool list AND
// rejected if a client calls them anyway, and gx_sql/gx_db_query refuse readOnly:false.
// The pieces below are pure/exported so they can be unit-tested without env load order.

/** KB-mutating tools — removed from the tool list and blocked in read-only mode. */
export const WRITE_TOOLS = new Set([
  'gx_create', 'gx_modify', 'gx_set_property', 'gx_rename', 'gx_build', 'gx_import',
  'gx_delete', 'gx_variable', 'gx_move', 'gx_clone', 'gx_bulk_modify',
]);

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
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!readonly) return null;
  const reason = env.GX18_READONLY_REASON ? ` Reason: ${env.GX18_READONLY_REASON}` : '';
  if (WRITE_TOOLS.has(name)) return `Tool "${name}" is disabled: server is in GX18_READONLY mode.${reason}`;
  if (SQL_TOOLS.has(name) && args.readOnly === false) {
    return `Refusing readOnly:false on "${name}": server is in GX18_READONLY mode.${reason}`;
  }
  return null;
}

// ── Tool dispatch ────────────────────────────────────────────────────────────

/** Normalized tool result: text body + whether it represents an error. */
export interface ToolResult {
  text: string;
  isError: boolean;
}

// Process-wide serializer for KB-mutating tools. The C# worker is a single headless
// SDK session; two concurrent writes (e.g. two browser tabs firing gx_create) could
// race the same session and risk the revision storm this package exists to prevent.
// Reads stay fully concurrent — only WRITE_TOOLS go through this chain.
const WRITE_QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max wait in queue
let writeChain: Promise<unknown> = Promise.resolve();
function serializeWrite<T>(fn: () => Promise<T>): Promise<T> {
  const queued = new Promise<T>((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error('Write queue timeout: a previous write has been running for >5 minutes. Check for worker hangs or restart the server.')),
      WRITE_QUEUE_TIMEOUT_MS,
    );
    writeChain.then(
      () => { clearTimeout(deadline); fn().then(resolve, reject); },
      () => { clearTimeout(deadline); fn().then(resolve, reject); },
    );
  });
  // Keep the chain alive regardless of success/failure so the next writer still waits.
  writeChain = queued.then(() => undefined, () => undefined);
  return queued;
}

async function dispatch(name: string, a: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case 'gx_find':
      return { text: await gxFind(a as Parameters<typeof gxFind>[0]), isError: false };
    case 'gx_list':
      return { text: await gxList(a as Parameters<typeof gxList>[0]), isError: false };
    case 'gx_get':
      return { text: await gxGet(a as Parameters<typeof gxGet>[0]), isError: false };
    case 'gx_read':
      return { text: await gxRead(a as Parameters<typeof gxRead>[0]), isError: false };
    case 'gx_properties':
      return { text: await gxProperties(a as Parameters<typeof gxProperties>[0]), isError: false };
    case 'gx_structure':
      return { text: await gxStructure(a as Parameters<typeof gxStructure>[0]), isError: false };
    case 'gx_whoami':
      return { text: await gxWhoami(), isError: false };
    case 'gx_create':
      return { text: await gxCreate(a as Parameters<typeof gxCreate>[0]), isError: false };
    case 'gx_modify':
      return { text: await gxModify(a as Parameters<typeof gxModify>[0]), isError: false };
    case 'gx_set_property':
      return { text: await gxSetProperty(a as Parameters<typeof gxSetProperty>[0]), isError: false };
    case 'gx_rename':
      return { text: await gxRename(a as Parameters<typeof gxRename>[0]), isError: false };
    case 'gx_validate':
      return { text: await gxValidate(a as Parameters<typeof gxValidate>[0]), isError: false };
    case 'gx_build':
      return { text: await gxBuild(a as Parameters<typeof gxBuild>[0]), isError: false };
    case 'gx_sql':
      return { text: await gxSql(a as Parameters<typeof gxSql>[0]), isError: false };
    case 'gx_export':
      return { text: await gxExport(a as Parameters<typeof gxExport>[0]), isError: false };
    case 'gx_import':
      return { text: await gxImport(a as Parameters<typeof gxImport>[0]), isError: false };
    case 'gx_read_xpz':
      return { text: await gxReadXpz(a as Parameters<typeof gxReadXpz>[0]), isError: false };
    case 'gx_patch_xpz':
      return { text: await gxPatchXpz(a as Parameters<typeof gxPatchXpz>[0]), isError: false };
    case 'gx_save_config':
      return { text: await gxSaveConfig(a as Parameters<typeof gxSaveConfig>[0]), isError: false };
    case 'gx_db_connections':
      return { text: await gxDbConnections(), isError: false };
    case 'gx_db_query':
      return { text: await gxDbQuery(a as Parameters<typeof gxDbQuery>[0]), isError: false };
    case 'gx_delete':
      return { text: await gxDelete(a as Parameters<typeof gxDelete>[0]), isError: false };
    case 'gx_variable':
      return { text: await gxVariable(a as Parameters<typeof gxVariable>[0]), isError: false };
    case 'gx_search':
      return { text: await gxSearch(a as Parameters<typeof gxSearch>[0]), isError: false };
    case 'gx_analyze':
      return { text: await gxAnalyze(a as Parameters<typeof gxAnalyze>[0]), isError: false };
    case 'gx_where_used':
      return { text: await gxWhereUsed(a as Parameters<typeof gxWhereUsed>[0]), isError: false };
    case 'gx_history':
      return { text: await gxHistory(a as Parameters<typeof gxHistory>[0]), isError: false };
    case 'gx_move':
      return { text: await gxMove(a as Parameters<typeof gxMove>[0]), isError: false };
    case 'gx_doctor':
      return { text: await gxDoctor(), isError: false };
    case 'gx_reload':
      return { text: await gxReload(), isError: false };
    case 'gx_stats':
      return { text: await gxStats(a as Parameters<typeof gxStats>[0]), isError: false };
    case 'gx_modules':
      return { text: await gxModules({} as never), isError: false };
    case 'gx_diff':
      return { text: await gxDiff(a as Parameters<typeof gxDiff>[0]), isError: false };
    case 'gx_dead_code':
      return { text: await gxDeadCode(a as Parameters<typeof gxDeadCode>[0]), isError: false };
    case 'gx_impact':
      return { text: await gxImpact(a as Parameters<typeof gxImpact>[0]), isError: false };
    case 'gx_attribute':
      return { text: await gxAttribute(a as Parameters<typeof gxAttribute>[0]), isError: false };
    case 'gx_compare':
      return { text: await gxCompare(a as Parameters<typeof gxCompare>[0]), isError: false };
    case 'gx_lint':
      return { text: await gxLint(a as Parameters<typeof gxLint>[0]), isError: false };
    case 'gx_clone':
      return { text: await gxClone(a as Parameters<typeof gxClone>[0]), isError: false };
    case 'gx_bulk_modify':
      return { text: await gxBulkModify(a as Parameters<typeof gxBulkModify>[0]), isError: false };
    default:
      return { text: `Unknown tool: ${name}`, isError: true };
  }
}

/**
 * Run a tool by name. Single dispatch shared by the stdio MCP server and the web UI.
 * Applies read-only enforcement, serializes KB writes, and normalizes thrown errors
 * into { text: "Error: ...", isError: true }.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  readonly: boolean,
): Promise<ToolResult> {
  const blocked = readonlyBlock(name, args, readonly);
  if (blocked) return { text: blocked, isError: true };

  try {
    const exec = () => dispatch(name, args);
    return WRITE_TOOLS.has(name) ? await serializeWrite(exec) : await exec();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: `Error: ${message}`, isError: true };
  }
}
