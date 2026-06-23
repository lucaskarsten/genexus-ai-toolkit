import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';

describe.skipIf(!SPIKE_AVAILABLE)('tools: analyze', () => {
  let tempName: string;
  let usedTemp = false;

  beforeAll(async () => {
    // Tentar usar objeto conhecido na KB spike
    // Se não existir, criamos um temporário
    const rows = await callBridge<any[]>('find', { pattern: 'PrcNucIncrementaContagem' }).catch(() => []);
    if (rows.length === 0) {
      tempName = testName('AnalizePrc');
      await callBridge('create', {
        typeKey: 'procedure',
        name: tempName,
        sections: { source: '// analyze test' },
      });
      usedTemp = true;
    }
  });

  afterAll(async () => {
    if (usedTemp && tempName) await cleanup(tempName, 'procedure');
  });

  it('analyze — retorna shape válido para objeto existente', async () => {
    const targetName = usedTemp ? tempName : 'PrcNucIncrementaContagem';
    const r = await callBridge<any>('analyze', {
      name: targetName,
      typeKey: 'procedure',
    });
    // Verificar que o resultado tem shape mínimo esperado
    expect(r).toBeDefined();
    expect(typeof r).toBe('object');
    // analyze pode retornar { usedBy, uses } ou shape próprio — verificar que tem ao menos uma chave
    expect(Object.keys(r).length).toBeGreaterThan(0);
  });
});
