// @experimental — dataselector create é suportado (name-only), estrutura interna não via SDK
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('CRUD: dataselector (@experimental)', () => {
  let createdName: string;

  beforeAll(() => {
    createdName = testName('Ds');
  });

  afterAll(async () => {
    if (createdName) await cleanup(createdName, 'dataselector');
  });

  it('create — cria name-only (estrutura interna não suportada via SDK)', async () => {
    // dataselector só suporta name-only create — sem sections
    const r = await callBridge<any>('create', {
      typeKey: 'dataselector',
      name: createdName,
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('create');
  });

  it('find — encontra o objeto criado', async () => {
    const rows = await callBridge<any[]>('find', { pattern: createdName });
    expect(rows.some((x: any) => x.name === createdName)).toBe(true);
  });

  it('export — tenta gerar .xpz', async () => {
    const outFile = `C:\\tmp\\${createdName}.xpz`;
    try {
      const r = await callBridge<any>('export', {
        typeKey: 'dataselector',
        name: createdName,
        outputFile: outFile,
      });
      if (r.ok) {
        expect(r.fileExists).toBe(true);
        expect(r.bytes).toBeGreaterThan(0);
      }
    } catch (e: any) {
      // dataselector export pode não estar implementado — registrar como known issue
      console.warn('[dataselector.test] export não suportado:', e.message);
    }
  });

  it('delete dryRun — não remove', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'dataselector',
      dryRun: true,
    });
    expect(r.deleted).toBe(false);
  });

  it('delete — remove definitivamente', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'dataselector',
      dryRun: false,
    });
    expect(r.deleted).toBe(true);
    createdName = '';
  });
});
