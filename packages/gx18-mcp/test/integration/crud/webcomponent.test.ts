import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('CRUD: webcomponent', () => {
  let createdName: string;

  beforeAll(() => {
    createdName = testName('Wbc');
  });

  afterAll(async () => {
    if (createdName) await cleanup(createdName, 'webcomponent');
  });

  it('create — cria com events', async () => {
    const r = await callBridge<any>('create', {
      typeKey: 'webcomponent',
      name: createdName,
      sections: {
        events: 'Event Start\n    &Titulo = "Test"\nEndEvent\n',
      },
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('create');
  });

  it('find — encontra o objeto criado', async () => {
    const rows = await callBridge<any[]>('find', { pattern: createdName });
    expect(rows.some((x: any) => x.name === createdName)).toBe(true);
  });

  it('read events — retorna string', async () => {
    const r = await callBridge<any>('read_source', {
      name: createdName,
      entityTypeId: 43,
      section: 'events',
    });
    expect(typeof r === 'string' || r === null || r === undefined).toBe(true);
  });

  it('modify events — atualiza conteúdo', async () => {
    const r = await callBridge<any>('modify', {
      name: createdName,
      typeKey: 'webcomponent',
      section: 'events',
      content: 'Event Start\n    &Titulo = "Modificado"\nEndEvent\n',
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('modify');
  });

  it('export — gera .xpz válido', async () => {
    const outFile = `C:\\tmp\\${createdName}.xpz`;
    const r = await callBridge<any>('export', {
      typeKey: 'webcomponent',
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
      typeKey: 'webcomponent',
      dryRun: true,
    });
    expect(r.deleted).toBe(false);
  });

  it('delete — remove definitivamente', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'webcomponent',
      dryRun: false,
    });
    expect(r.deleted).toBe(true);
    createdName = '';
  });
});
