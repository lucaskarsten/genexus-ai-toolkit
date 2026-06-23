import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';
import fs from 'fs';

describe.skipIf(!SPIKE_AVAILABLE)('CRUD: usercontrol', () => {
  let createdName: string;
  let exportedFile: string;

  beforeAll(() => {
    createdName = testName('Uc');
    exportedFile = `C:\\tmp\\${createdName}.xpz`;
  });

  afterAll(async () => {
    if (createdName) await cleanup(createdName, 'usercontrol');
    if (exportedFile && fs.existsSync(exportedFile)) {
      try { fs.unlinkSync(exportedFile); } catch { /* ignore */ }
    }
  });

  it('create — cria com template e properties', async () => {
    const r = await callBridge<any>('create', {
      typeKey: 'usercontrol',
      name: createdName,
      sections: {
        template: `<div data-ucid="{{ucid}}">UC de teste ${createdName}</div>`,
        properties: '<Properties></Properties>',
      },
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('create');
  });

  it('find — encontra o objeto criado', async () => {
    const rows = await callBridge<any[]>('find', { pattern: createdName });
    expect(rows.some((x: any) => x.name === createdName)).toBe(true);
  });

  it('modify template — atualiza conteúdo', async () => {
    const r = await callBridge<any>('modify', {
      name: createdName,
      typeKey: 'usercontrol',
      section: 'template',
      content: `<div data-ucid="{{ucid}}" class="modified">UC modificado</div>`,
    });
    expect(r.userIdOk).toBe(true);
    expect(r.op).toBe('modify');
  });

  it('export — gera .xpz válido com conteúdo do UC', async () => {
    const r = await callBridge<any>('export', {
      typeKey: 'usercontrol',
      name: createdName,
      outputFile: exportedFile,
    });
    expect(r.ok).toBe(true);
    expect(r.fileExists).toBe(true);
    expect(r.bytes).toBeGreaterThan(100);
    // Verificar que o arquivo existe no disco
    expect(fs.existsSync(exportedFile)).toBe(true);
  });

  it('delete dryRun — não remove', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'usercontrol',
      dryRun: true,
    });
    expect(r.deleted).toBe(false);
  });

  it('delete — remove definitivamente', async () => {
    const r = await callBridge<any>('delete', {
      name: createdName,
      typeKey: 'usercontrol',
      dryRun: false,
    });
    expect(r.deleted).toBe(true);
    createdName = '';
  });
});
