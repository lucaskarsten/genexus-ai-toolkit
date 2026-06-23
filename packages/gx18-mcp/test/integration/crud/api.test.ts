import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('CRUD: api', () => {
  let createdName: string;

  beforeAll(() => {
    createdName = testName('Api');
  });

  afterAll(async () => {
    if (createdName) await cleanup(createdName, 'api');
  });

  it('create — cria com source', async () => {
    const r = await callBridge<any>('create', {
      typeKey: 'api',
      name: createdName,
      sections: {
        source: "// API de teste\nService 'GetTest'\n    Verb: Get\n    Path: '/test'\nEndService",
      },
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('create');
  });

  it('find — encontra o objeto criado', async () => {
    const rows = await callBridge<any[]>('find', { pattern: createdName });
    expect(rows.some((x: any) => x.name === createdName)).toBe(true);
  });

  it('modify source — atualiza conteúdo', async () => {
    const r = await callBridge<any>('modify', {
      name: createdName,
      typeKey: 'api',
      section: 'source',
      content: "// API modificada\nService 'GetTest'\n    Verb: Get\n    Path: '/test-modified'\nEndService",
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('modify');
  });

  it('export — gera .xpz válido', async () => {
    const outFile = `C:\\tmp\\${createdName}.xpz`;
    const r = await callBridge<any>('export', {
      typeKey: 'api',
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
      typeKey: 'api',
      dryRun: true,
    });
    expect(r.deleted).toBe(false);
  });

  it('delete — remove definitivamente', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'api',
      dryRun: false,
    });
    expect(r.deleted).toBe(true);
    createdName = '';
  });
});
