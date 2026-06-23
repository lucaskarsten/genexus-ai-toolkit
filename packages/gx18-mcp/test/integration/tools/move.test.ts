import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('tools: move', () => {
  let objName: string;

  beforeAll(async () => {
    objName = testName('MoveObj');
    await callBridge('create', {
      typeKey: 'procedure',
      name: objName,
      sections: {
        source: '// move test',
      },
    });
  });

  afterAll(async () => {
    await cleanup(objName, 'procedure');
  });

  it('move — move objeto para módulo root (sem targetModule = root)', async () => {
    // Mover para o módulo root (ou mantê-lo no root)
    const r = await callBridge<any>('move', {
      name: objName,
      typeKey: 'procedure',
    });
    // move pode retornar ok, userIdOk, ou simplesmente não lançar erro
    expect(r).toBeDefined();
  });

  it('find — objeto ainda existe após move', async () => {
    const rows = await callBridge<any[]>('find', { pattern: objName });
    expect(rows.some((x: any) => x.name === objName)).toBe(true);
  });
});
