import { describe, it, expect } from 'vitest';
import spec from '../../spec/entity-types.json';
import { SUPPORTED_WRITE_TYPES, SECTION_FIELDS, ENTITY_TYPE_TO_KEY } from '../../src/tools/writer';
import { SECTION_TYPE, defaultSection } from '../../src/tools/reader';

// Characterization: locks the current TS registry to spec/entity-types.json.
// Once green, Step 2 refactors the code to DERIVE from the spec; these tests guarantee no drift.
describe('entity-types spec <-> TS registry parity (characterization)', () => {
  const objectTypes = spec.objectTypes;

  it('SUPPORTED_WRITE_TYPES == objectTypes flagged writeSupported', () => {
    const fromSpec = objectTypes.filter(o => o.writeSupported).map(o => o.key);
    expect([...SUPPORTED_WRITE_TYPES].sort()).toEqual([...fromSpec].sort());
  });

  it('SECTION_FIELDS == union of every section key in the spec', () => {
    const union = new Set<string>();
    for (const o of objectTypes) for (const s of o.sections) union.add(s.key);
    expect([...SECTION_FIELDS].sort()).toEqual([...union].sort());
  });

  it('ENTITY_TYPE_TO_KEY == spec.modify.entityTypeToKey', () => {
    const fromSpec: Record<number, string> = {};
    for (const [k, v] of Object.entries(spec.modify.entityTypeToKey)) fromSpec[Number(k)] = v;
    expect(ENTITY_TYPE_TO_KEY).toEqual(fromSpec);
  });

  it('every gx_modify target resolves to a real objectType key', () => {
    const keys = new Set(objectTypes.map(o => o.key));
    for (const v of Object.values(spec.modify.entityTypeToKey)) expect(keys.has(v)).toBe(true);
  });

  it('reader SECTION_TYPE == spec.read.componentTypeBySection', () => {
    const fromSpec: Record<string, number> = {};
    for (const [k, v] of Object.entries(spec.read.componentTypeBySection)) fromSpec[k] = v;
    expect(SECTION_TYPE).toEqual(fromSpec);
  });

  it('reader defaultSection matches spec.read.defaultSectionByType + fallback', () => {
    const byType = spec.read.defaultSectionByType as Record<string, string>;
    for (const [k, v] of Object.entries(byType)) expect(defaultSection(Number(k))).toBe(v);
    expect(defaultSection(99999)).toBe(spec.read.fallbackSection);
  });

  // Literal anchors: re-tie the spec to known-correct SDK values so a wrong spec edit
  // can't pass (the rest of the suite only checks spec-derived == spec).
  it('spec encodes the known SDK literals', () => {
    const byKey = Object.fromEntries(objectTypes.map(o => [o.key, o]));
    expect(byKey['procedure'].entityTypeId).toBe(34);
    expect(byKey['procedure'].sdkType).toBe('Artech.Genexus.Common.Objects.Procedure');
    expect(byKey['webpanel'].entityTypeId).toBe(43);
    expect(byKey['transaction'].entityTypeId).toBe(39);
    expect(byKey['transaction'].structured).toBe(true);
    expect(byKey['sdt'].entityTypeId).toBe(36);
    expect(byKey['usercontrol'].entityTypeId).toBe(147);
    expect(byKey['dso'].entityTypeId).toBe(161);
    expect(byKey['api'].entityTypeId).toBe(86);
    expect(byKey['dataselector'].entityTypeId).toBe(88);

    const procSource = byKey['procedure'].sections.find(s => s.key === 'source');
    expect(procSource?.part).toBe('ProcedurePart');
    expect(procSource?.kind).toBe('source');
    const wpLayout = byKey['webpanel'].sections.find(s => s.key === 'layout');
    expect(wpLayout?.part).toBe('WebForm');
    expect(wpLayout?.kind).toBe('editable');
  });
});
