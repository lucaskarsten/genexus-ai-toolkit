import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('tools: variable list/add/delete', () => {
  let procName: string;

  beforeAll(async () => {
    procName = testName('VarPrc');
    await callBridge('create', {
      typeKey: 'procedure',
      name: procName,
      sections: {
        rules: 'Parm(in:&Dummy);',
        source: '// variable test proc',
      },
    });
  });

  afterAll(async () => {
    await cleanup(procName, 'procedure');
  });

  it('variable_list — retorna lista inicial de variáveis', async () => {
    const r = await callBridge<any>('variable_list', {
      name: procName,
      typeKey: 'procedure',
    });
    expect(Array.isArray(r)).toBe(true);
  });

  it('variable_add — adiciona variável TestVar', async () => {
    const r = await callBridge<any>('variable_add', {
      name: procName,
      typeKey: 'procedure',
      varName: 'TestVar',
      dataType: 'varchar',
      length: 60,
    });
    expect(r.ok ?? r.userIdOk ?? true).toBeTruthy();
  });

  it('variable_list — TestVar aparece na lista', async () => {
    const r = await callBridge<any[]>('variable_list', {
      name: procName,
      typeKey: 'procedure',
    });
    expect(Array.isArray(r)).toBe(true);
    const found = r.some((v: any) =>
      (v.name ?? v.Name ?? '').toLowerCase() === 'testvar'
    );
    expect(found).toBe(true);
  });

  it('variable_delete — remove TestVar', async () => {
    const r = await callBridge<any>('variable_delete', {
      name: procName,
      typeKey: 'procedure',
      varName: 'TestVar',
    });
    expect(r.ok ?? r.userIdOk ?? true).toBeTruthy();
  });

  it('variable_list — TestVar não está mais na lista', async () => {
    const r = await callBridge<any[]>('variable_list', {
      name: procName,
      typeKey: 'procedure',
    });
    expect(Array.isArray(r)).toBe(true);
    const found = r.some((v: any) =>
      (v.name ?? v.Name ?? '').toLowerCase() === 'testvar'
    );
    expect(found).toBe(false);
  });
});
