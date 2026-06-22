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

// Section name -> sub-component EntityTypeId, for gx_read.
export const SECTION_TYPE: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const [k, v] of Object.entries(spec.read.componentTypeBySection)) m[k] = v as number;
  return m;
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
