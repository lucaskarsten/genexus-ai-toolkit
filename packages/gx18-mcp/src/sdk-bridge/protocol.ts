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

// set_property
export interface SetPropertyParams {
  name: string;
  type: number;
  property: string;
  value: string;
}

export interface SetPropertyResult {
  ok: boolean;
}

// rename
export interface RenameParams {
  name: string;
  type: number;
  newName: string;
}

export interface RenameResult {
  ok: boolean;
}

// validate
export interface ValidateParams {
  name: string;
  type: number;
}

export interface ValidateResult {
  errors: string[];
  warnings: string[];
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
