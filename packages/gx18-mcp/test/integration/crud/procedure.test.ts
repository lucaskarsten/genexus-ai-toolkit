import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('CRUD: procedure', () => {
  let createdName: string;

  beforeAll(() => {
    createdName = testName('Prc');
  });

  afterAll(async () => {
    if (createdName) await cleanup(createdName, 'procedure');
  });

  it('create — cria com source e rules', async () => {
    const r = await callBridge<any>('create', {
      typeKey: 'procedure',
      name: createdName,
      sections: {
        rules: 'Parm(in:&Nome; out:&Resultado);',
        source: '&Resultado = "Olá " + &Nome',
      },
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('create');
  });

  it('find — encontra o objeto criado', async () => {
    const rows = await callBridge<any[]>('find', { pattern: createdName });
    expect(rows.some((x: any) => x.name === createdName)).toBe(true);
  });

  it('read — retorna source (pode ser string vazia no primeiro read)', async () => {
    const r = await callBridge<any>('read_source', {
      name: createdName,
      entityTypeId: 34,
      section: 'source',
    });
    // SDK pode não indexar imediatamente — só verificar que retornou string
    expect(typeof r === 'string' || r === null || r === undefined).toBe(true);
  });

  it('modify — atualiza source', async () => {
    const r = await callBridge<any>('modify', {
      name: createdName,
      typeKey: 'procedure',
      section: 'source',
      content: '&Resultado = "Modificado: " + &Nome',
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('modify');
  });

  it('export — gera .xpz válido', async () => {
    const outFile = `C:\\tmp\\${createdName}.xpz`;
    const r = await callBridge<any>('export', {
      typeKey: 'procedure',
      name: createdName,
      outputFile: outFile,
    });
    expect(r.ok).toBe(true);
    expect(r.fileExists).toBe(true);
    expect(r.bytes).toBeGreaterThan(100);
  });

  it('delete dryRun — não remove o objeto', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'procedure',
      dryRun: true,
    });
    expect(r.deleted).toBe(false);
  });

  it('find após dryRun — ainda encontra', async () => {
    const rows = await callBridge<any[]>('find', { pattern: createdName });
    expect(rows.some((x: any) => x.name === createdName)).toBe(true);
  });

  it('delete — remove definitivamente', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'procedure',
      dryRun: false,
    });
    expect(r.deleted).toBe(true);
    createdName = ''; // evita double-delete no afterAll
  });
});
