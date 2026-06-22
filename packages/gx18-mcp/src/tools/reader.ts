import { bridge } from '../sdk-bridge/bridge';
import { EntityDetail, ReadSourceResult, ReadStructureResult } from '../sdk-bridge/protocol';
import { SECTION_TYPE, defaultSection } from '../domain/entity-types';

// Re-exported for backward compatibility and the contract tests; defined in domain/entity-types.
export { SECTION_TYPE, defaultSection };

export async function gxRead(args: {
  name: string;
  type: number;
  section?: string;
}): Promise<string> {
  const detail = await bridge.send<EntityDetail>('get', {
    name: args.name,
    type: args.type,
  });

  const section = args.section ?? defaultSection(args.type);
  const targetTypeId = SECTION_TYPE[section];
  if (!targetTypeId) {
    throw new Error(
      `Unknown section: '${section}'. Valid values: source, events, rules, layout, variables`
    );
  }

  const component = detail.components.find(c => c.entityTypeId === targetTypeId);
  if (!component) {
    throw new Error(
      `Section '${section}' (entityTypeId=${targetTypeId}) not found in ${args.name}. ` +
      `Available components: ${detail.components.map(c => `${c.typeName}(${c.entityTypeId})`).join(', ')}`
    );
  }

  const result = await bridge.send<ReadSourceResult>('read_source', {
    entityTypeId: component.entityTypeId,
    entityId: component.entityId,
  });

  return result.text || '(empty)';
}

export async function gxProperties(args: {
  name: string;
  type: number;
}): Promise<string> {
  const result = await bridge.send<Record<string, string>>('read_properties', {
    name: args.name,
    type: args.type,
  });
  return JSON.stringify(result, null, 2);
}

export async function gxStructure(args: {
  name: string;
}): Promise<string> {
  const result = await bridge.send<ReadStructureResult>('read_structure', {
    name: args.name,
  });
  return JSON.stringify(result, null, 2);
}
