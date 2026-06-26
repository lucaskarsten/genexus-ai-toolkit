import fs from 'fs';
import { bridge } from '../sdk-bridge/bridge';
import { CreateResult, ModifyResult, SetPropertyResult, RenameResult, WriteResult, ImportResult } from '../sdk-bridge/protocol';
import { SUPPORTED_WRITE_TYPES, SECTION_FIELDS, ENTITY_TYPE_TO_KEY, OBJECT_TYPES, KEY_TO_ENTITY_TYPE, resolveTypeKey } from '../domain/entity-types';

// Re-exported for backward compatibility and the contract tests; defined in domain/entity-types.
export { SUPPORTED_WRITE_TYPES, SECTION_FIELDS, ENTITY_TYPE_TO_KEY, KEY_TO_ENTITY_TYPE, resolveTypeKey };

function requireConfirm(confirm: unknown, toolName: string): void {
  if (confirm !== true) {
    throw new Error(
      `${toolName} requires confirm: true. This operation modifies the GeneXus KB.`
    );
  }
}

// The worker verifies the author (UserId) server-side against kb.User and returns userIdOk.
// This is the authoritative guard — it runs inside the same transaction context as the save.
function assertWriteOk(result: WriteResult): void {
  if (!result.userIdOk) {
    throw new Error(
      `UserId verification FAILED after ${result.op}!\n` +
      `Object '${result.name}' (entityId ${result.entityId}) was saved with UserId ${result.userId}, ` +
      `but the expected author is ${result.expectedUserId} (${result.kbUserName}).\n` +
      `This would corrupt Team Development history. Review the KB before continuing.`
    );
  }
}

export async function gxCreate(args: {
  type: string;
  name: string;
  module?: string;
  confirm?: boolean;
  source?: string;
  events?: string;
  rules?: string;
  conditions?: string;
  layout?: string;
  properties?: string;
  template?: string;
  tokens?: string;
  styles?: string;
  elements?: string;
  structure?: unknown[];
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_create');

  const typeKey = args.type.toLowerCase();
  if (!SUPPORTED_WRITE_TYPES.includes(typeKey)) {
    throw new Error(
      `Write not yet supported for type '${args.type}'. Currently supported: ${SUPPORTED_WRITE_TYPES.join(', ')}.`
    );
  }

  // NOTE: events/rules/conditions ARE supported at creation time for webpanel/webcomponent.
  // The SDK tokenizes them on Save() headless (proven via spike — the blob becomes a valid
  // <TokenDataList> token stream, not raw text). Invalid source surfaces as a ValidationException
  // that does not persist. The former blanket block here was based on a false premise and is removed.

  const payload: Record<string, unknown> = { type: typeKey, name: args.name, module: args.module };
  const a = args as Record<string, unknown>;
  for (const f of SECTION_FIELDS) if (a[f] !== undefined && a[f] !== null) payload[f] = a[f];

  const result = await bridge.send<CreateResult>('create', payload);

  assertWriteOk(result);
  return JSON.stringify(result, null, 2);
}

export async function gxModify(args: {
  name: string;
  type: number | string;
  section: string;
  content: string;
  confirm?: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_modify');

  if (!args.name) throw new Error('gx_modify: name is required.');
  if (!args.section) throw new Error('gx_modify: section is required.');
  if (args.content == null) throw new Error('gx_modify: content is required (pass empty string to clear a section).');

  const typeKey = resolveTypeKey(args.type);
  if (!SUPPORTED_WRITE_TYPES.includes(typeKey)) {
    throw new Error(
      `gx_modify: type '${typeKey}' is not writable. Writable types: ${SUPPORTED_WRITE_TYPES.join(', ')}.`
    );
  }

  const typeSpec = OBJECT_TYPES.find(t => t.key === typeKey);
  const validSections = typeSpec?.sections.map(s => s.key) ?? [];
  const isUcScriptSection = typeKey === 'usercontrol' && args.section.toLowerCase().startsWith('script:');
  if (validSections.length > 0 && !validSections.includes(args.section.toLowerCase()) && !isUcScriptSection) {
    const ucHint = typeKey === 'usercontrol'
      ? ' To patch AfterShow/Methods scripts, use section="script:<ScriptName>" (e.g. script:AfterShow).'
      : '';
    throw new Error(
      `gx_modify: section '${args.section}' is not valid for type '${typeKey}'. ` +
      `Valid sections: ${validSections.join(', ')}.${ucHint}`
    );
  }

  if (args.section.toLowerCase() === 'layout') {
    const trimmed = (args.content ?? '').trimStart();
    if (!trimmed.startsWith('<GxMultiForm')) {
      throw new Error(
        'gx_modify layout: content must be a <GxMultiForm> XML document. ' +
        'Decode the layout blob first via gx_read (section=layout) and send it back modified.'
      );
    }
  }

  const result = await bridge.send<ModifyResult>('modify', {
    name: args.name,
    type: typeKey,
    section: args.section,
    content: args.content,
  }, 180000);

  assertWriteOk(result);
  return JSON.stringify(result, null, 2);
}

export async function gxImport(args: {
  xpzFile: string;
  type?: number | string;
  name: string;
  fullOverwrite?: boolean;
  confirm?: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_import');

  if (!args.xpzFile) throw new Error('gx_import requires xpzFile (path to the .xpz to import).');
  if (!args.name) throw new Error('gx_import requires name (the primary object, for post-import UserId verification).');
  if (!fs.existsSync(args.xpzFile)) {
    throw new Error(`gx_import: xpzFile not found: ${args.xpzFile}`);
  }

  const xpzSizeBytes = fs.statSync(args.xpzFile).size;
  const MAX_XPZ_BYTES = 50 * 1024 * 1024; // 50 MB
  if (xpzSizeBytes > MAX_XPZ_BYTES) {
    throw new Error(
      `gx_import: XPZ file is too large (${(xpzSizeBytes / 1024 / 1024).toFixed(1)} MB). ` +
      `Maximum allowed is 50 MB to prevent worker hangs. Split the import into smaller archives.`
    );
  }

  // Import is often the first write in a fresh worker → it pays the SDK cold-start (~10-15s)
  // on top of the import itself. Give it a generous timeout (the default 30s is not enough cold).
  const result = await bridge.send<ImportResult>('import', {
    xpzFile: args.xpzFile,
    type: args.type != null ? resolveTypeKey(args.type) : '',
    name: args.name,
    fullOverwrite: args.fullOverwrite !== false,
  }, 180000);

  // Same authoritative guard as create/modify — the native GX18 import stamps the Windows user;
  // if a foreign UserId landed on the object, fail loudly before it pollutes Team Development.
  assertWriteOk(result);
  if (!result.ok) {
    throw new Error(
      `gx_import: ImportFile returned ok:false — the import did not apply.\n` +
      `Check that lastUpdate was bumped and checksum was zeroed in the XPZ.\n` +
      `Object: '${result.name}' (${args.type ?? 'unknown'}), xpzFile: ${result.xpzFile}`
    );
  }
  return JSON.stringify(result, null, 2);
}

export async function gxSetProperty(args: {
  name: string;
  type: number | string;
  property: string;
  value: string;
  confirm?: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_set_property');

  const typeKey = resolveTypeKey(args.type);

  const result = await bridge.send<SetPropertyResult>('set_property', {
    name: args.name,
    type: typeKey,
    property: args.property,
    value: args.value,
  }, 180000);

  assertWriteOk(result);
  return JSON.stringify(result, null, 2);
}

export async function gxRename(args: {
  name: string;
  type: number | string;
  newName: string;
  confirm?: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_rename');

  const typeKey = resolveTypeKey(args.type);

  const result = await bridge.send<RenameResult>('rename', {
    name: args.name,
    type: typeKey,
    newName: args.newName,
  }, 180000);

  assertWriteOk(result);
  return JSON.stringify(result, null, 2);
}

export async function gxDelete(args: {
  name: string;
  type: number | string;
  dryRun?: boolean;
  force?: boolean;
  confirm?: boolean;
}): Promise<string> {
  if (!args.dryRun) {
    requireConfirm(args.confirm, 'gx_delete');
    if (args.force !== true) {
      throw new Error(
        'gx_delete requires force: true in addition to confirm: true. ' +
        'Use dryRun:true first to preview what will be deleted, then pass both confirm:true and force:true to proceed.'
      );
    }
  }

  const typeKey = resolveTypeKey(args.type);
  if (!SUPPORTED_WRITE_TYPES.includes(typeKey)) {
    throw new Error(
      `gx_delete: unsupported type '${typeKey}'. Supported: ${SUPPORTED_WRITE_TYPES.join(', ')}.`
    );
  }

  const result = await bridge.send<import('../sdk-bridge/protocol').DeleteResult>('delete', {
    name: args.name,
    type: typeKey,
    dryRun: args.dryRun === true,
  }, 180000);

  return JSON.stringify(result, null, 2);
}

export async function gxVariable(args: {
  action: 'list' | 'add' | 'delete' | 'update';
  name: string;
  type: number | string;
  varName?: string;
  dataType?: string;
  length?: number;
  decimals?: number;
  isCollection?: boolean;
  confirm?: boolean;
}): Promise<string> {
  const typeKey = resolveTypeKey(args.type);
  if (!SUPPORTED_WRITE_TYPES.includes(typeKey)) {
    throw new Error(
      `gx_variable: unsupported type '${typeKey}'. Supported: ${SUPPORTED_WRITE_TYPES.join(', ')}.`
    );
  }

  const action = (args.action ?? 'list').toLowerCase();

  if (action === 'list') {
    const result = await bridge.send<import('../sdk-bridge/protocol').VariableListResult>('variable_list', {
      name: args.name,
      type: typeKey,
    });
    return JSON.stringify(result, null, 2);
  }

  requireConfirm(args.confirm, `gx_variable action="${action}"`);

  if (action === 'add') {
    if (!args.varName) throw new Error('gx_variable add requires varName.');
    const result = await bridge.send<import('../sdk-bridge/protocol').VariableMutateResult>('variable_add', {
      name: args.name,
      type: typeKey,
      varName: args.varName,
      dataType: args.dataType ?? 'Character',
      length: args.length ?? 0,
      decimals: args.decimals ?? 0,
      isCollection: args.isCollection === true,
    }, 180000);
    return JSON.stringify(result, null, 2);
  }

  if (action === 'delete') {
    if (!args.varName) throw new Error('gx_variable delete requires varName.');
    const result = await bridge.send<import('../sdk-bridge/protocol').VariableMutateResult>('variable_delete', {
      name: args.name,
      type: typeKey,
      varName: args.varName,
    }, 180000);
    return JSON.stringify(result, null, 2);
  }

  if (action === 'update') {
    if (!args.varName) throw new Error('gx_variable update requires varName.');
    if (args.dataType == null && args.length == null && args.decimals == null && args.isCollection == null)
      throw new Error('gx_variable update requires at least one of: dataType, length, decimals, isCollection.');
    const result = await bridge.send<import('../sdk-bridge/protocol').VariableMutateResult>('variable_update', {
      name: args.name,
      type: typeKey,
      varName: args.varName,
      dataType: args.dataType ?? null,
      length: args.length ?? -1,
      decimals: args.decimals ?? -1,
      isCollection: args.isCollection ?? null,
    }, 180000);
    return JSON.stringify(result, null, 2);
  }

  throw new Error(`gx_variable: unknown action '${args.action}'. Use list, add, delete, or update.`);
}

export async function gxClone(args: {
  type: number | string;
  name: string;
  newName: string;
  module?: string;
  confirm: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_clone');
  const r = await bridge.send<WriteResult>('clone', {
    typeKey: resolveTypeKey(args.type),
    sourceName: args.name,
    targetName: args.newName,
    module: args.module,
  }, 180_000);
  assertWriteOk(r);
  return JSON.stringify(r, null, 2);
}

export async function gxBulkModify(args: {
  type: number | string;
  names: string[];
  section: string;
  content: string;
  confirm: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_bulk_modify');
  if (!Array.isArray(args.names) || args.names.length === 0)
    throw new Error('names must be a non-empty array');

  const typeKey = resolveTypeKey(args.type);
  if (!SUPPORTED_WRITE_TYPES.includes(typeKey)) {
    throw new Error(`gx_bulk_modify: type '${typeKey}' is not writable. Writable types: ${SUPPORTED_WRITE_TYPES.join(', ')}.`);
  }
  const typeSpec = OBJECT_TYPES.find(t => t.key === typeKey);
  const validSections = typeSpec?.sections.map(s => s.key) ?? [];
  const isUcScriptSection = typeKey === 'usercontrol' && args.section.toLowerCase().startsWith('script:');
  if (validSections.length > 0 && !validSections.includes(args.section.toLowerCase()) && !isUcScriptSection) {
    throw new Error(
      `gx_bulk_modify: section '${args.section}' is not valid for type '${typeKey}'. ` +
      `Valid sections: ${validSections.join(', ')}.`
    );
  }
  const succeeded: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const name of args.names) {
    try {
      const r = await bridge.send<WriteResult>('modify', {
        name,
        type: typeKey,
        section: args.section,
        content: args.content,
      }, 180_000);
      assertWriteOk(r);
      succeeded.push(name);
    } catch (e: unknown) {
      failed.push({ name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return JSON.stringify({ succeeded, failed, total: args.names.length }, null, 2);
}
