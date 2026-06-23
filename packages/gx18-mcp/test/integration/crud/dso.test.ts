import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('CRUD: dso', () => {
  let createdName: string;

  beforeAll(() => {
    createdName = testName('Dso');
  });

  afterAll(async () => {
    if (createdName) await cleanup(createdName, 'dso');
  });

  it('create — cria com tokens e styles', async () => {
    // PITFALL: styles header DEVE usar @import com nome amigável (NÃO GUID)
    // O SDK resolve o GUID no save. Usar "DsoBase" como import.
    const r = await callBridge<any>('create', {
      typeKey: 'dso',
      name: createdName,
      sections: {
        tokens: `@token ${createdName}-color: #ffffff;`,
        styles: `@import DsoBase;\n\n${createdName} { color: token(${createdName}-color); }`,
      },
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('create');
  });

  it('find — encontra o objeto criado', async () => {
    const rows = await callBridge<any[]>('find', { pattern: createdName });
    expect(rows.some((x: any) => x.name === createdName)).toBe(true);
  });

  it('modify styles — atualiza conteúdo', async () => {
    const r = await callBridge<any>('modify', {
      name: createdName,
      typeKey: 'dso',
      section: 'styles',
      content: `@import DsoBase;\n\n${createdName} { color: #000000; }`,
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('modify');
  });

  it('export — gera .xpz válido', async () => {
    const outFile = `C:\\tmp\\${createdName}.xpz`;
    const r = await callBridge<any>('export', {
      typeKey: 'dso',
      name: createdName,
      outputFile: outFile,
    });
    expect(r.ok).toBe(true);
    expect(r.fileExists).toBe(true);
    expect(r.bytes).toBeGreaterThan(100);
  });

  it('delete dryRun — não remove', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'dso',
      dryRun: true,
    });
    expect(r.deleted).toBe(false);
  });

  it('delete — remove definitivamente', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'dso',
      dryRun: false,
    });
    expect(r.deleted).toBe(true);
    createdName = '';
  });
});
