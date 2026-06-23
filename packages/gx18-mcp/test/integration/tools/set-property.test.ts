import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('tools: set_property', () => {
  let objName: string;

  beforeAll(async () => {
    objName = testName('SetProp');
    await callBridge('create', {
      typeKey: 'procedure',
      name: objName,
      sections: {
        source: '// set_property test',
      },
    });
  });

  afterAll(async () => {
    await cleanup(objName, 'procedure');
  });

  it('set_property Description — atualiza descrição', async () => {
    const r = await callBridge<any>('set_property', {
      name: objName,
      typeKey: 'procedure',
      property: 'Description',
      value: 'Desc de teste via set_property',
    });
    expect(r.userIdOk).toBe(true);
  });

  it('find — objeto ainda encontrado após set_property', async () => {
    const rows = await callBridge<any[]>('find', { pattern: objName });
    expect(rows.some((x: any) => x.name === objName)).toBe(true);
  });
});
