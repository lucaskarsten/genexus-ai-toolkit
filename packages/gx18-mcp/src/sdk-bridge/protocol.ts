// IPC Protocol types — single source of truth for TypeScript ↔ C# worker contract

// ---------- Wire types ----------

export interface WorkerRequest {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

export interface WorkerResponse {
  id: number;
  result?: unknown;
  error?: string;
}

// ---------- Shared domain types ----------

export interface EntityInfo {
  entityTypeId: number;
  typeName: string;
  entityId: number;
  name: string;
  lastModified: string;
}

export interface ComponentInfo {
  entityTypeId: number;
  typeName: string;
  entityId: number;
  entityVersionId: number;
}

export interface EntityDetail extends EntityInfo {
  module?: string;
  components: ComponentInfo[];
}

export interface IdentityInfo {
  windowsUser: string;
  kbUserId: number;
  kbPath: string;
  kbOpen: boolean;
  gx18Dir: string;
  sdkReady: boolean;
}

export interface AttributeInfo {
  name: string;
  type: string;
  length?: number;
  nullable?: boolean;
}

// ---------- Method param/result types ----------

// ping
export interface PingResult {
  ok: true;
  sdkReady: boolean;
  sqlReady: boolean;
  user: string;
  kbPath: string;
}

// find
export interface FindParams {
  pattern: string;
  type?: number;
  limit?: number;
}

// list
export interface ListParams {
  type: number;
  module?: string;
  limit?: number;
  offset?: number;
}

// get
export interface GetParams {
  name: string;
  type: number;
}

// read_source
export interface ReadSourceParams {
  entityTypeId: number;
  entityId: number;
}

export interface ReadSourceResult {
  xml: string;
  text: string;
}

// read_properties
export interface ReadPropertiesParams {
  name: string;
  type: number;
}

// read_structure
export interface ReadStructureParams {
  name: string;
}

export interface ReadStructureResult {
  name: string;
  attributes: AttributeInfo[];
}

// create
export interface CreateParams {
  type: number;
  name: string;
  module?: string;
  source?: string;
  events?: string;
  rules?: string;
  structure?: AttributeInfo[];
}

// Unified result for create/modify — mirrors the worker's post-save UserId verification.
export interface WriteResult {
  op: string;
  name: string;
  entityTypeId: number;
  entityId: number;
  userId: number | null;
  expectedUserId: number;
  kbUserName: string;
  userIdOk: boolean;
  recentVersions: number;
}

export type CreateResult = WriteResult;

// modify
export interface ModifyParams {
  name: string;
  type: number;
  section: string;
  content: string;
}

export type ModifyResult = WriteResult;

// import (.xpz via Knowledge Manager) — WriteResult-compatible so the UserId guard applies
export interface ImportParams {
  xpzFile: string;
  type: string;
  name: string;
  fullOverwrite?: boolean;
}

export interface ImportResult extends WriteResult {
  ok: boolean;
  xpzFile: string;
  fullOverwrite: boolean;
  /** The named object's recent EntityVersion rows (diagnostics) */
  versions?: Array<{ EntityTypeId: number; EntityId: number; EntityVersionId: number; UserId: number }>;
}

// set_property — C# returns WriteResult-compatible shape + property/value
export interface SetPropertyParams {
  name: string;
  type: number;
  property: string;
  value: string;
}

export type SetPropertyResult = WriteResult & { property: string; value: string };

// rename — C# returns WriteResult (VerifyUserId shape)
export interface RenameParams {
  name: string;
  type: number;
  newName: string;
}

export type RenameResult = WriteResult;

// validate
export interface ValidateParams {
  name: string;
  type: number;
}

export interface ValidateResult {
  errors: string[];
  warnings: string[];
  name?: string;
  typeKey?: string;
}

// build
export interface BuildParams {
  name: string;
  type: number;
}

export interface BuildResult {
  success: boolean;
  output: string[];
  errors: string[];
  note?: string;
}

// delete
export interface DeleteResult {
  op: string;
  name: string;
  typeKey: string;
  entityTypeId: number;
  entityId: number;
  deleted: boolean;
  dryRun?: boolean;
  note?: string;
}

// variable
export interface VariableInfo {
  name: string;
  isCollection: boolean;
}

export interface VariableListResult {
  name: string;
  typeKey: string;
  variables: VariableInfo[];
  count: number;
}

export interface VariableMutateResult {
  op: string;
  objectName: string;
  varName: string;
  deleted?: boolean;
  note?: string;
  writeResult?: WriteResult;
}

// search
export interface SearchMatch {
  name: string;
  entityTypeId: number;
  typeName: string;
  entityId: number;
  section: string;
  matchCount: number;
  matchLines: Array<{ line: number; text: string }>;
}

export interface SearchResult {
  pattern: string;
  matches: SearchMatch[];
  total: number;
}

// analyze
export interface AnalyzeRef {
  name: string;
  entityTypeId: number;
  typeName?: string;
}

export interface AnalyzeResult {
  name: string;
  entityTypeId: number;
  entityId: number;
  action: string;
  results: AnalyzeRef[];
}

// history
export interface VersionInfo {
  versionId: number;
  userId: number;
  userName: string;
  timestamp: string;
  description: string;
}

export interface HistoryResult {
  name: string;
  entityTypeId: number;
  typeName: string;
  entityId: number;
  versions: VersionInfo[];
  count: number;
}

// move
export interface MoveResult {
  op: string;
  name: string;
  entityTypeId: number;
  entityId: number;
  fromModule: string;
  toModule: string;
  rowsUpdated: number;
}

// sql_query
export interface SqlQueryParams {
  query: string;
  readOnly?: boolean;
}

export interface SqlQueryResult {
  rows: Record<string, unknown>[];
  count: number;
}

// export
export interface ExportParams {
  name: string;
  type: number;
  outputDir?: string;
}

export interface ExportResult {
  path: string;
}
