// Domain: GeneXus object-type registry — derived entirely from the canonical spec
// (spec/entity-types.json), the single source of truth shared with the C# worker.
// Pure module, no IO. Locked to legacy behavior by test/contract/registry.test.ts.
import spec from '../../spec/entity-types.json';

export type SectionKind = 'source' | 'editable' | 'structure';

export interface SectionSpec {
  key: string;
  part: string;
  kind: SectionKind;
}

export interface ObjectTypeSpec {
  key: string;
  entityTypeId: number;
  displayName: string;
  sdkAssembly: string;
  sdkType: string;
  writeSupported: boolean;
  structured: boolean;
  isComponent: boolean;
  sections: SectionSpec[];
}

export const OBJECT_TYPES: ObjectTypeSpec[] = spec.objectTypes as unknown as ObjectTypeSpec[];

// Type keys the worker's write path understands.
export const SUPPORTED_WRITE_TYPES: string[] = OBJECT_TYPES.filter(o => o.writeSupported).map(o => o.key);

// Union of every section key — the fields gx_create may forward to the worker.
export const SECTION_FIELDS: string[] = (() => {
  const set = new Set<string>();
  for (const o of OBJECT_TYPES) for (const s of o.sections) set.add(s.key);
  return [...set];
})();

// EntityTypeId -> typeKey accepted by gx_modify (numeric type param).
export const ENTITY_TYPE_TO_KEY: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(spec.modify.entityTypeToKey)) m[Number(k)] = v as string;
  return m;
})();

// typeKey -> EntityTypeId (reverse of ENTITY_TYPE_TO_KEY).
export const KEY_TO_ENTITY_TYPE: Record<string, number> = Object.fromEntries(
  Object.entries(ENTITY_TYPE_TO_KEY).map(([num, key]) => [key, Number(num)])
);

/**
 * Resolve a `type` parameter that is either a numeric EntityTypeId or a string key name.
 * Returns the lowercase string key used by the worker (e.g. "procedure", "usercontrol").
 * Throws a clear, actionable error if not recognised.
 *
 * Both forms are always valid — models that learn the type from gx_find (number) or from
 * gx_import (string) should not need to convert.
 */
export function resolveTypeKey(type: number | string): string {
  if (typeof type === 'string') {
    const key = type.toLowerCase();
    if (key in KEY_TO_ENTITY_TYPE) return key;
    // Also accept aliases that share an EntityTypeId with another key (e.g. "webcomponent" → 43,
    // same EntityTypeId as "webpanel") — the worker's Spec() handles these correctly.
    if (OBJECT_TYPES.find(o => o.key === key && o.writeSupported)) return key;
    const known = Object.keys(KEY_TO_ENTITY_TYPE).join(', ');
    throw new Error(
      `Unknown type name "${type}". Use a numeric EntityTypeId (e.g. 34=procedure, 147=usercontrol) ` +
      `or one of: ${known}.`
    );
  }
  const key = ENTITY_TYPE_TO_KEY[type];
  if (!key) {
    const known = Object.entries(ENTITY_TYPE_TO_KEY).map(([n, k]) => `${k}=${n}`).join(', ');
    throw new Error(`Unknown EntityTypeId ${type}. Known: ${known}.`);
  }
  return key;
}

// Section name -> sub-component EntityTypeId, for gx_read.
export const SECTION_TYPE: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const [k, v] of Object.entries(spec.read.componentTypeBySection)) m[k] = v as number;
  return m;
})();

// Per-type overrides: objectTypeId -> { sectionName -> componentEntityTypeId }
const SECTION_TYPE_PER_TYPE: Record<number, Record<string, number>> = (() => {
  const m: Record<number, Record<string, number>> = {};
  const perType = (spec.read as Record<string, unknown>).componentTypeBySectionPerType as Record<string, Record<string, number>> | undefined;
  if (perType) {
    for (const [k, v] of Object.entries(perType)) m[Number(k)] = v;
  }
  return m;
})();

// Resolve section name to component EntityTypeId, with per-type override support.
export function sectionType(objectTypeId: number, section: string): number | undefined {
  return SECTION_TYPE_PER_TYPE[objectTypeId]?.[section] ?? SECTION_TYPE[section];
}

// Valid section names (global + all per-type keys).
export const ALL_SECTION_NAMES: string[] = (() => {
  const names = new Set(Object.keys(SECTION_TYPE));
  for (const v of Object.values(SECTION_TYPE_PER_TYPE)) for (const k of Object.keys(v)) names.add(k);
  return [...names].sort();
})();

const DEFAULT_SECTION_BY_TYPE: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [k, v] of Object.entries(spec.read.defaultSectionByType)) m[Number(k)] = v as string;
  return m;
})();

const FALLBACK_SECTION: string = spec.read.fallbackSection;

export function defaultSection(type: number): string {
  return DEFAULT_SECTION_BY_TYPE[type] ?? FALLBACK_SECTION;
}
