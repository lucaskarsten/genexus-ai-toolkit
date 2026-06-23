import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('tools: rename', () => {
  let oldName: string;
  let newName: string;

  beforeAll(async () => {
    oldName = testName('RenOld');
    newName = testName('RenNew');
    await callBridge('create', {
      typeKey: 'procedure',
      name: oldName,
      sections: {
        source: '// rename test',
      },
    });
  });

  afterAll(async () => {
    // cleanup both names — only one will exist after rename
    await cleanup(oldName, 'procedure');
    await cleanup(newName, 'procedure');
  });

  it('rename — renomeia o objeto', async () => {
    const r = await callBridge<any>('rename', {
      name: oldName,
      typeKey: 'procedure',
      newName: newName,
    });
    expect(r.ok ?? r.userIdOk ?? true).toBeTruthy();
  });

  it('find newName — encontra o objeto renomeado', async () => {
    const rows = await callBridge<any[]>('find', { pattern: newName });
    expect(rows.some((x: any) => x.name === newName)).toBe(true);
  });

  it('find oldName — não encontra mais o nome antigo', async () => {
    const rows = await callBridge<any[]>('find', { pattern: oldName });
    expect(rows.some((x: any) => x.name === oldName)).toBe(false);
    // Reset para evitar cleanup no afterAll de um objeto que não existe mais
    oldName = '';
  });
});
