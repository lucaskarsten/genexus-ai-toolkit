import { bridge } from '../sdk-bridge/bridge';
import { CreateResult, ModifyResult, SetPropertyResult, RenameResult, WriteResult } from '../sdk-bridge/protocol';
import { SUPPORTED_WRITE_TYPES, SECTION_FIELDS, ENTITY_TYPE_TO_KEY } from '../domain/entity-types';

// Re-exported for backward compatibility and the contract tests; defined in domain/entity-types.
export { SUPPORTED_WRITE_TYPES, SECTION_FIELDS, ENTITY_TYPE_TO_KEY };

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

  const payload: Record<string, unknown> = { type: typeKey, name: args.name, module: args.module };
  const a = args as Record<string, unknown>;
  for (const f of SECTION_FIELDS) if (a[f] !== undefined && a[f] !== null) payload[f] = a[f];

  const result = await bridge.send<CreateResult>('create', payload);

  assertWriteOk(result);
  return JSON.stringify(result, null, 2);
}

export async function gxModify(args: {
  name: string;
  type: number;
  section: string;
  content: string;
  confirm?: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_modify');

  const typeKey = ENTITY_TYPE_TO_KEY[args.type];
  if (!typeKey || !SUPPORTED_WRITE_TYPES.includes(typeKey)) {
    throw new Error(
      `Write not yet supported for EntityTypeId ${args.type}. Currently supported: ${SUPPORTED_WRITE_TYPES.join(', ')}.`
    );
  }

  const result = await bridge.send<ModifyResult>('modify', {
    name: args.name,
    type: typeKey,
    section: args.section,
    content: args.content,
  });

  assertWriteOk(result);
  return JSON.stringify(result, null, 2);
}

export async function gxSetProperty(args: {
  name: string;
  type: number;
  property: string;
  value: string;
  confirm?: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_set_property');

  const result = await bridge.send<SetPropertyResult>('set_property', {
    name: args.name,
    type: args.type,
    property: args.property,
    value: args.value,
  });

  return JSON.stringify(result, null, 2);
}

export async function gxRename(args: {
  name: string;
  type: number;
  newName: string;
  confirm?: boolean;
}): Promise<string> {
  requireConfirm(args.confirm, 'gx_rename');

  const result = await bridge.send<RenameResult>('rename', {
    name: args.name,
    type: args.type,
    newName: args.newName,
  });

  return JSON.stringify(result, null, 2);
}
