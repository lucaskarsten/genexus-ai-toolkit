// Zod schemas for gx18-mcp tool responses.
// Used by the run command to validate response structure (not values).
// Derived from src/sdk-bridge/protocol.ts types.

import { z } from 'zod';

// ── Shared shapes ────────────────────────────────────────────────────────────

export const EntityInfoSchema = z.object({
  entityTypeId: z.number(),
  typeName: z.string(),
  entityId: z.number(),
  name: z.string(),
  module: z.string().optional(),
  lastModified: z.string(),
});

export const ComponentInfoSchema = z.object({
  entityTypeId: z.number(),
  typeName: z.string(),
  entityId: z.number(),
  entityVersionId: z.number(),
});

export const EntityDetailSchema = EntityInfoSchema.extend({
  components: z.array(ComponentInfoSchema),
});

export const VersionInfoSchema = z.object({
  versionId: z.number(),
  userId: z.number(),
  userName: z.string(),
  timestamp: z.string(),
  description: z.string(),
});

export const AttributeInfoSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  length: z.number().optional(),
  nullable: z.boolean().optional(),
});

export const AnalyzeRefSchema = z.object({
  name: z.string(),
  entityTypeId: z.number(),
  typeName: z.string().optional(),
});

export const SearchMatchSchema = z.object({
  name: z.string(),
  entityTypeId: z.number(),
  typeName: z.string(),
  entityId: z.number(),
  section: z.string(),
  matchCount: z.number(),
  matchLines: z.array(z.object({ line: z.number(), text: z.string() })),
});

export const VariableInfoSchema = z.object({
  name: z.string(),
  isCollection: z.boolean(),
});

// ── Per-tool response schemas ─────────────────────────────────────────────────

// gx_find → array of EntityInfo
export const FindResultSchema = z.array(EntityInfoSchema);

// gx_list → array of EntityInfo
export const ListResultSchema = z.array(EntityInfoSchema);

// gx_get → EntityDetail
export const GetResultSchema = EntityDetailSchema;

// gx_read → plain text string (source code, template, etc.)
export const ReadResultSchema = z.string().min(0);

// gx_properties → record of property key → value
export const PropertiesResultSchema = z.record(z.string(), z.unknown());

// gx_structure → {name, attributes}
export const StructureResultSchema = z.object({
  name: z.string(),
  attributes: z.array(AttributeInfoSchema),
});

// gx_attribute → { attributes[], total }
export const AttributeListSchema = z.object({
  attributes: z.array(z.object({}).passthrough()),
  total: z.number(),
}).passthrough();

// gx_where_used → same shape as gx_analyze: { name, entityTypeId, entityId, action, results[] }
export const WhereUsedResultSchema = z.object({
  name: z.string(),
  entityTypeId: z.number(),
  entityId: z.number(),
  action: z.string(),
  results: z.array(z.object({}).passthrough()),
}).passthrough();

// gx_analyze → AnalyzeResult
export const AnalyzeResultSchema = z.object({
  name: z.string(),
  entityTypeId: z.number(),
  entityId: z.number(),
  action: z.string(),
  results: z.array(AnalyzeRefSchema),
});

// gx_impact → { root, entityTypeId, depth, impacted[], total }
export const ImpactResultSchema = z.object({
  root: z.string(),
  entityTypeId: z.number(),
  depth: z.number(),
  impacted: z.array(z.object({}).passthrough()),
  total: z.number(),
}).passthrough();

// gx_history → HistoryResult
export const HistoryResultSchema = z.object({
  name: z.string(),
  entityTypeId: z.number(),
  typeName: z.string(),
  entityId: z.number(),
  versions: z.array(VersionInfoSchema),
  count: z.number(),
});

// gx_search → SearchResult
export const SearchResultSchema = z.object({
  pattern: z.string(),
  matches: z.array(SearchMatchSchema),
  total: z.number(),
});

// gx_diff → string (unified diff) or object with diff field
export const DiffResultSchema = z.union([
  z.string(),
  z.object({ diff: z.string() }).passthrough(),
]);

// gx_lint → { entityTypeId, module, findings[], total }
export const LintResultSchema = z.object({
  entityTypeId: z.number(),
  module: z.string().nullable(),
  findings: z.array(z.object({}).passthrough()),
  total: z.number(),
}).passthrough();

// gx_dead_code → { entityTypeId, module, candidates[] }
export const DeadCodeResultSchema = z.object({
  entityTypeId: z.number(),
  module: z.string().nullable(),
  candidates: z.array(
    z.object({
      name: z.string(),
      entityId: z.number(),
      entityTypeId: z.number(),
    }).passthrough(),
  ),
}).passthrough();

// gx_stats → stats object
export const StatsResultSchema = z.object({}).passthrough();

// gx_modules → { modules: [{ Id, Name, ParentId }] }
export const ModulesResultSchema = z.object({
  modules: z.array(
    z.object({
      Id: z.number(),
      Name: z.string(),
    }).passthrough(),
  ),
}).passthrough();

// gx_whoami → IdentityInfo
export const WhoamiResultSchema = z.object({
  windowsUser: z.string(),
  kbUserId: z.number(),
  kbPath: z.string(),
  kbOpen: z.boolean(),
  sdkReady: z.boolean(),
});

// gx_doctor → health check object
export const DoctorResultSchema = z.object({}).passthrough();

// gx_db_connections → array of connection objects
export const DbConnectionsResultSchema = z.array(
  z.object({ name: z.string() }).passthrough(),
);

// gx_sql → SqlQueryResult
export const SqlResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  count: z.number(),
  truncated: z.boolean().optional(),
});

// gx_export → ExportResult (benchmark stores only size metadata)
export const ExportResultSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
  bytes: z.number(),
});

// gx_read_xpz → listing (scripts array without content)
export const ReadXpzResultSchema = z.object({
  ok: z.boolean(),
  scripts: z.array(
    z.object({ name: z.string(), length: z.number() }),
  ),
  scriptCount: z.number(),
});

// gx_variable list → VariableListResult
export const VariableListResultSchema = z.object({
  name: z.string(),
  typeKey: z.string(),
  variables: z.array(VariableInfoSchema),
  count: z.number(),
});

// ── Tool → schema mapping ────────────────────────────────────────────────────

export const TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  gx_find: FindResultSchema,
  gx_list: ListResultSchema,
  gx_get: GetResultSchema,
  gx_read: ReadResultSchema,
  gx_properties: PropertiesResultSchema,
  gx_structure: StructureResultSchema,
  gx_attribute: AttributeListSchema,
  gx_where_used: WhereUsedResultSchema,
  gx_analyze: AnalyzeResultSchema,
  gx_impact: ImpactResultSchema,
  gx_history: HistoryResultSchema,
  gx_search: SearchResultSchema,
  gx_diff: DiffResultSchema,
  gx_lint: LintResultSchema,
  gx_dead_code: DeadCodeResultSchema,
  gx_stats: StatsResultSchema,
  gx_modules: ModulesResultSchema,
  gx_whoami: WhoamiResultSchema,
  gx_doctor: DoctorResultSchema,
  gx_db_connections: DbConnectionsResultSchema,
  gx_sql: SqlResultSchema,
  gx_export: ExportResultSchema,
  gx_read_xpz: ReadXpzResultSchema,
  gx_variable: VariableListResultSchema,
};

export function getSchema(tool: string): z.ZodTypeAny | null {
  return TOOL_SCHEMAS[tool] ?? null;
}
