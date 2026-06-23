/**
 * Round-trip test: export → (optional patch) → import → verify
 *
 * Para patch completo de CDATA no .xpz (AfterShow/Methods de UC), o processo manual é:
 *   1. ZipFile.OpenRead(xpzFile) — [System.IO.Compression.ZipFile] em PowerShell
 *   2. Ler o único entry XML
 *   3. Substituir o corpo entre <Script Name="AfterShow">...</Script>
 *   4. Re-zipar com BOM UTF-8 + CRLF
 *   5. gx_import(xpzFile, fullOverwrite:true)
 * Este teste verifica o round-trip básico (export → import sem patch) como smoke test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callBridge, cleanup, testName, SPIKE_AVAILABLE } from '../helpers';
import fs from 'fs';

describe.skipIf(!SPIKE_AVAILABLE)('tools: export-import round-trip', () => {
  let objName: string;
  const xpzFile = `C:\\tmp\\IntTestRoundTrip_${Date.now()}.xpz`;

  beforeAll(async () => {
    objName = testName('RoundTrip');
    await callBridge('create', {
      typeKey: 'procedure',
      name: objName,
      sections: {
        source: '// round-trip test v1',
      },
    });
  });

  afterAll(async () => {
    await cleanup(objName, 'procedure');
    if (fs.existsSync(xpzFile)) {
      try { fs.unlinkSync(xpzFile); } catch { /* ignore */ }
    }
  });

  it('export — gera .xpz em C:\\tmp\\', async () => {
    const r = await callBridge<any>('export', {
      typeKey: 'procedure',
      name: objName,
      outputFile: xpzFile,
    });
    expect(r.ok).toBe(true);
    expect(r.fileExists).toBe(true);
    expect(r.bytes).toBeGreaterThan(100);
    expect(fs.existsSync(xpzFile)).toBe(true);
  });

  it('import — reimporta o .xpz sem patch (fullOverwrite)', async () => {
    // Importar de volta o mesmo XPZ — deve retornar userIdOk=true
    const r = await callBridge<any>('import', {
      xpzFile,
      typeKey: 'procedure',
      name: objName,
      fullOverwrite: true,
    });
    expect(r.userIdOk).toBe(true);
  });

  it('find após import — objeto ainda existe', async () => {
    const rows = await callBridge<any[]>('find', { pattern: objName });
    expect(rows.some((x: any) => x.name === objName)).toBe(true);
  });

  it('history após import — tem ao menos 1 versão', async () => {
    const r = await callBridge<any>('history', {
      name: objName,
      typeKey: 'procedure',
    });
    const versions: any[] = Array.isArray(r) ? r : (r.versions ?? r.history ?? []);
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });
});
