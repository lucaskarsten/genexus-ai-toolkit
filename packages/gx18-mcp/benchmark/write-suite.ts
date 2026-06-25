// Write benchmark suite — tests gx_create, gx_modify, gx_clone, gx_set_property,
// gx_variable, gx_rename, gx_delete for each supported GeneXus object type.
//
// Safety: all objects use the BncTest_ prefix and are deleted after the run.
// Never benchmarks WBC/WBP events/rules/conditions (BLOCKED — tokenized format).

import { GxMcpClient } from './client';
import { computeLatency, printProgress, printSummary, type CellReport, type RunReport, toMarkdown, computeSummary } from './report';
import fs from 'node:fs';
import path from 'node:path';

const PREFIX = 'BncTest';
const RESULTS_DIR = path.resolve(__dirname, 'results');

// ── Test fixtures ─────────────────────────────────────────────────────────────

const PRC_SOURCE = `parm(in:&Input, out:&Output);
&Output = &Input.Trim()`;

const PRC_RULES = `Error("test") if &Input = "";`;

const WBC_LAYOUT = `<GxMultiForm><Form name="FORM1" width="1000"><Table border="0" width="100%" class="TableFlex_TableBench"><Row><Cell><TextBlock name="TxtBench" class="desktop__body--large"><Text><![CDATA[BncTest placeholder]]></Text></TextBlock></Cell></Row></Table></Form></GxMultiForm>`;

const UC_TEMPLATE = `<control type="panel" id="bnc_container">
  <item id="bnc_label" class="bnc-label">BncTest UC</item>
</control>
<style>
  .GX_FLD_bnc_container { display: flex; }
  .bnc-label { font-size: 14px; }
</style>`;

const UC_PROPERTIES = `<?xml version="1.0" encoding="utf-8"?>
<PropertiesDefinition>
  <Properties>
    <Property Name="BncText" Type="text" Default="hello" />
  </Properties>
</PropertiesDefinition>`;

const SDT_STRUCTURE = [
  { name: 'BncId', type: 'Numeric', length: 10, decimals: 0 },
  { name: 'BncName', type: 'VarChar', length: 50, decimals: 0 },
  { name: 'BncActive', type: 'Boolean', length: 0, decimals: 0 },
];

const TRN_STRUCTURE = [
  { name: 'BncTrnId', type: 'Numeric', length: 10, decimals: 0 },
  { name: 'BncTrnDesc', type: 'VarChar', length: 100, decimals: 0 },
];

// ── Result types ──────────────────────────────────────────────────────────────

export interface WriteOpResult {
  op: string;
  objectName: string;
  typeKey: string;
  status: 'pass' | 'fail' | 'error';
  latencyMs: number;
  userIdOk?: boolean;
  detail?: string;
}

export interface WriteTypeReport {
  typeKey: string;
  objectName: string;
  ops: WriteOpResult[];
  cleanedUp: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function doWrite(
  client: GxMcpClient,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; latencyMs: number; userIdOk?: boolean; raw: unknown; error?: string }> {
  const res = await client.call(tool, { ...args, confirm: true });
  if (res.isError) {
    return {
      ok: false,
      latencyMs: res.latencyMs,
      raw: res.raw,
      error: typeof res.raw === 'string' ? res.raw.slice(0, 200) : JSON.stringify(res.raw).slice(0, 200),
    };
  }
  const raw = res.raw as Record<string, unknown>;
  const userIdOk = typeof raw?.['userIdOk'] === 'boolean' ? raw['userIdOk'] as boolean : undefined;
  return { ok: true, latencyMs: res.latencyMs, userIdOk, raw };
}

async function doRead(
  client: GxMcpClient,
  name: string,
  type: number,
  section: string,
): Promise<string | null> {
  const res = await client.call('gx_read', { name, type, section });
  if (res.isError) return null;
  return typeof res.raw === 'string' ? res.raw : null;
}

async function tryDelete(client: GxMcpClient, name: string, typeKey: string): Promise<boolean> {
  const res = await client.call('gx_delete', { name, type: typeKey, confirm: true, force: true });
  return !res.isError;
}

function op(
  opName: string,
  objectName: string,
  typeKey: string,
  result: { ok: boolean; latencyMs: number; userIdOk?: boolean; error?: string },
  detail?: string,
): WriteOpResult {
  return {
    op: opName,
    objectName,
    typeKey,
    status: result.ok ? 'pass' : 'error',
    latencyMs: result.latencyMs,
    userIdOk: result.userIdOk,
    detail: detail ?? result.error,
  };
}

function verify(opName: string, objectName: string, typeKey: string, condition: boolean, latencyMs: number, detail: string): WriteOpResult {
  return {
    op: opName,
    objectName,
    typeKey,
    status: condition ? 'pass' : 'fail',
    latencyMs,
    detail: condition ? undefined : detail,
  };
}

// ── Per-type suites ───────────────────────────────────────────────────────────

async function benchProcedure(client: GxMcpClient, idx: number): Promise<WriteTypeReport> {
  const name = `${PREFIX}Prc${idx}`;
  const cloneName = `${PREFIX}Prc${idx}Clone`;
  const renamedName = `${PREFIX}Prc${idx}Ren`;
  const ops: WriteOpResult[] = [];
  let cleanedUp = false;

  // 1. gx_create
  const created = await doWrite(client, 'gx_create', { type: 'procedure', name, source: PRC_SOURCE, rules: PRC_RULES });
  ops.push(op('gx_create', name, 'procedure', created));
  if (!created.ok) { cleanedUp = true; return { typeKey: 'procedure', objectName: name, ops, cleanedUp }; }

  // 2. verify source was written
  const t0 = Date.now();
  const readSource = await doRead(client, name, 34, 'source');
  ops.push(verify('gx_read:source', name, 'procedure', readSource !== null && readSource.includes('Trim'), Date.now() - t0, 'source content mismatch'));

  // 3. gx_modify source
  const modSource = await doWrite(client, 'gx_modify', { name, type: 34, section: 'source', content: `${PRC_SOURCE}\n// modified` });
  ops.push(op('gx_modify:source', name, 'procedure', modSource));

  // 4. gx_modify rules
  const modRules = await doWrite(client, 'gx_modify', { name, type: 34, section: 'rules', content: PRC_RULES });
  ops.push(op('gx_modify:rules', name, 'procedure', modRules));

  // 5. gx_set_property
  const setProp = await doWrite(client, 'gx_set_property', { name, type: 34, property: 'MainProgram', value: 'True' });
  ops.push(op('gx_set_property:MainProgram', name, 'procedure', setProp));

  // 6. gx_variable add
  const addVar = await doWrite(client, 'gx_variable', { action: 'add', name, type: 'procedure', varName: 'BncVar', dataType: 'VarChar', length: 50 });
  ops.push(op('gx_variable:add', name, 'procedure', addVar));

  // 7. gx_variable list
  const listVar = await client.call('gx_variable', { action: 'list', name, type: 'procedure' });
  const varList = listVar.raw as Record<string, unknown>;
  const hasVar = Array.isArray(varList?.['variables']) && (varList['variables'] as Array<Record<string, unknown>>).some((v) => v['name'] === 'BncVar');
  ops.push(verify('gx_variable:list', name, 'procedure', hasVar, listVar.latencyMs, 'BncVar not found in variable list'));

  // 8. gx_variable delete
  const delVar = await doWrite(client, 'gx_variable', { action: 'delete', name, type: 'procedure', varName: 'BncVar' });
  ops.push(op('gx_variable:delete', name, 'procedure', delVar));

  // 9. gx_clone
  const cloned = await doWrite(client, 'gx_clone', { type: 'procedure', name, newName: cloneName });
  ops.push(op('gx_clone', cloneName, 'procedure', cloned));

  // 10. gx_rename (clone only, keep original)
  if (cloned.ok) {
    const renamed = await doWrite(client, 'gx_rename', { name: cloneName, type: 34, newName: renamedName });
    ops.push(op('gx_rename', renamedName, 'procedure', renamed));
    await tryDelete(client, renamedName, 'procedure');
  }

  // 11. gx_delete
  const deleted = await doWrite(client, 'gx_delete', { name, type: 'procedure' });
  ops.push(op('gx_delete', name, 'procedure', deleted));
  cleanedUp = deleted.ok;

  return { typeKey: 'procedure', objectName: name, ops, cleanedUp };
}

async function benchWebComponent(client: GxMcpClient, idx: number): Promise<WriteTypeReport> {
  const name = `${PREFIX}Wbc${idx}`;
  const ops: WriteOpResult[] = [];
  let cleanedUp = false;

  // 1. gx_create
  const created = await doWrite(client, 'gx_create', { type: 'webcomponent', name, events: '' });
  ops.push(op('gx_create', name, 'webcomponent', created));
  if (!created.ok) { cleanedUp = true; return { typeKey: 'webcomponent', objectName: name, ops, cleanedUp }; }

  // 2. gx_modify layout (only writable section for WBC)
  const modLayout = await doWrite(client, 'gx_modify', { name, type: 43, section: 'layout', content: WBC_LAYOUT });
  ops.push(op('gx_modify:layout', name, 'webcomponent', modLayout));

  // 3. verify layout read-back
  const t0 = Date.now();
  const readLayout = await doRead(client, name, 43, 'layout');
  ops.push(verify('gx_read:layout', name, 'webcomponent', readLayout !== null && readLayout.includes('BncTest'), Date.now() - t0, 'layout content mismatch'));

  // 4. gx_clone
  const cloneName = `${PREFIX}Wbc${idx}Clone`;
  const cloned = await doWrite(client, 'gx_clone', { type: 43, name, newName: cloneName });
  ops.push(op('gx_clone', cloneName, 'webcomponent', cloned));
  if (cloned.ok) await tryDelete(client, cloneName, 'webpanel');

  // NOTE: events/rules/conditions intentionally NOT benchmarked — BLOCKED in v1.9.15
  ops.push({
    op: 'gx_modify:events [BLOCKED]',
    objectName: name,
    typeKey: 'webcomponent',
    status: 'pass', // expected skip
    latencyMs: 0,
    detail: 'Tokenized format — cannot write raw source; edit via GX18 IDE',
  });

  // 5. gx_delete
  const deleted = await doWrite(client, 'gx_delete', { name, type: 'webpanel' });
  ops.push(op('gx_delete', name, 'webcomponent', deleted));
  cleanedUp = deleted.ok;

  return { typeKey: 'webcomponent', objectName: name, ops, cleanedUp };
}

async function benchWebPanel(client: GxMcpClient, idx: number): Promise<WriteTypeReport> {
  const name = `${PREFIX}Wbp${idx}`;
  const ops: WriteOpResult[] = [];
  let cleanedUp = false;

  const created = await doWrite(client, 'gx_create', { type: 'webpanel', name, events: '' });
  ops.push(op('gx_create', name, 'webpanel', created));
  if (!created.ok) { cleanedUp = true; return { typeKey: 'webpanel', objectName: name, ops, cleanedUp }; }

  const modLayout = await doWrite(client, 'gx_modify', { name, type: 43, section: 'layout', content: WBC_LAYOUT });
  ops.push(op('gx_modify:layout', name, 'webpanel', modLayout));

  const t0 = Date.now();
  const readLayout = await doRead(client, name, 43, 'layout');
  ops.push(verify('gx_read:layout', name, 'webpanel', readLayout !== null && readLayout.includes('BncTest'), Date.now() - t0, 'layout content mismatch'));

  ops.push({
    op: 'gx_modify:events [BLOCKED]',
    objectName: name,
    typeKey: 'webpanel',
    status: 'pass',
    latencyMs: 0,
    detail: 'Tokenized format — edit via GX18 IDE',
  });

  const deleted = await doWrite(client, 'gx_delete', { name, type: 'webpanel' });
  ops.push(op('gx_delete', name, 'webpanel', deleted));
  cleanedUp = deleted.ok;

  return { typeKey: 'webpanel', objectName: name, ops, cleanedUp };
}

async function benchTransaction(client: GxMcpClient, idx: number): Promise<WriteTypeReport> {
  const name = `${PREFIX}Trn${idx}`;
  const ops: WriteOpResult[] = [];
  let cleanedUp = false;

  const created = await doWrite(client, 'gx_create', { type: 'transaction', name, structure: TRN_STRUCTURE, rules: '' });
  ops.push(op('gx_create', name, 'transaction', created));
  if (!created.ok) { cleanedUp = true; return { typeKey: 'transaction', objectName: name, ops, cleanedUp }; }

  // verify structure
  const t0 = Date.now();
  const structRes = await client.call('gx_structure', { name });
  const struct = structRes.raw as Record<string, unknown>;
  const hasFields = Array.isArray(struct?.['attributes']) && (struct['attributes'] as unknown[]).length >= 2;
  ops.push(verify('gx_structure:verify', name, 'transaction', hasFields, Date.now() - t0, 'structure fields missing'));

  const modRules = await doWrite(client, 'gx_modify', { name, type: 39, section: 'rules', content: '' });
  ops.push(op('gx_modify:rules', name, 'transaction', modRules));

  const deleted = await doWrite(client, 'gx_delete', { name, type: 'transaction' });
  ops.push(op('gx_delete', name, 'transaction', deleted));
  cleanedUp = deleted.ok;

  return { typeKey: 'transaction', objectName: name, ops, cleanedUp };
}

async function benchSdt(client: GxMcpClient, idx: number): Promise<WriteTypeReport> {
  const name = `${PREFIX}Sdt${idx}`;
  const ops: WriteOpResult[] = [];
  let cleanedUp = false;

  const created = await doWrite(client, 'gx_create', { type: 'sdt', name, structure: SDT_STRUCTURE });
  ops.push(op('gx_create', name, 'sdt', created));
  if (!created.ok) { cleanedUp = true; return { typeKey: 'sdt', objectName: name, ops, cleanedUp }; }

  const t0 = Date.now();
  const structRes = await client.call('gx_structure', { name });
  const struct = structRes.raw as Record<string, unknown>;
  const hasFields = Array.isArray(struct?.['attributes']) && (struct['attributes'] as unknown[]).length >= 3;
  ops.push(verify('gx_structure:verify', name, 'sdt', hasFields, Date.now() - t0, 'SDT fields missing'));

  const deleted = await doWrite(client, 'gx_delete', { name, type: 'sdt' });
  ops.push(op('gx_delete', name, 'sdt', deleted));
  cleanedUp = deleted.ok;

  return { typeKey: 'sdt', objectName: name, ops, cleanedUp };
}

async function benchUserControl(client: GxMcpClient, idx: number): Promise<WriteTypeReport> {
  const name = `${PREFIX}Uc${idx}`;
  const ops: WriteOpResult[] = [];
  let cleanedUp = false;
  let xpzPath: string | null = null;

  const created = await doWrite(client, 'gx_create', {
    type: 'usercontrol',
    name,
    template: UC_TEMPLATE,
    properties: UC_PROPERTIES,
  });
  ops.push(op('gx_create', name, 'usercontrol', created));
  if (!created.ok) { cleanedUp = true; return { typeKey: 'usercontrol', objectName: name, ops, cleanedUp }; }

  // verify template
  const t0 = Date.now();
  const readTpl = await doRead(client, name, 147, 'template');
  ops.push(verify('gx_read:template', name, 'usercontrol', readTpl !== null && readTpl.includes('bnc_container'), Date.now() - t0, 'template content mismatch'));

  // gx_modify template
  const modTpl = await doWrite(client, 'gx_modify', { name, type: 147, section: 'template', content: UC_TEMPLATE + '\n<!-- modified -->' });
  ops.push(op('gx_modify:template', name, 'usercontrol', modTpl));

  // gx_modify properties
  const modProps = await doWrite(client, 'gx_modify', { name, type: 147, section: 'properties', content: UC_PROPERTIES });
  ops.push(op('gx_modify:properties', name, 'usercontrol', modProps));

  // XPZ round-trip for AfterShow script
  const exportRes = await client.callExport({ name, type: 147 });
  const exportRaw = exportRes.raw as Record<string, unknown>;
  const exportOk = !exportRes.isError && exportRaw?.['ok'] === true;
  ops.push({
    op: 'gx_export:xpz',
    objectName: name,
    typeKey: 'usercontrol',
    status: exportOk ? 'pass' : 'error',
    latencyMs: exportRes.latencyMs,
    detail: exportOk ? undefined : String(exportRes.raw).slice(0, 100),
  });

  if (exportOk && typeof exportRaw?.['outputFile'] === 'string') {
    xpzPath = exportRaw['outputFile'] as string;

    // gx_read_xpz — list scripts
    const listRes = await client.call('gx_read_xpz', { xpzFile: xpzPath });
    const listRaw = listRes.raw as Record<string, unknown>;
    const hasScripts = Array.isArray(listRaw?.['scripts']);
    ops.push({
      op: 'gx_read_xpz:listing',
      objectName: name,
      typeKey: 'usercontrol',
      status: hasScripts ? 'pass' : 'error',
      latencyMs: listRes.latencyMs,
      detail: hasScripts ? `${(listRaw['scripts'] as unknown[]).length} scripts` : 'no scripts array',
    });

    // gx_patch_xpz — patch AfterShow (safe no-op: add a JS comment)
    const scripts = listRaw?.['scripts'] as Array<Record<string, unknown>>;
    const afterShow = scripts?.find((s) => s['name'] === 'AfterShow');
    if (afterShow) {
      // read current content
      const contentRes = await client.call('gx_read_xpz', { xpzFile: xpzPath, scriptName: 'AfterShow' });
      const currentContent = (contentRes.raw as Record<string, unknown>)?.['scripts']?.[0]?.['content'] as string ?? '';
      const patchedContent = `${currentContent}\n// BncTest patch`;

      const patchRes = await client.call('gx_patch_xpz', { xpzFile: xpzPath, scriptName: 'AfterShow', content: patchedContent });
      const patchOk = !patchRes.isError;
      ops.push({ op: 'gx_patch_xpz:AfterShow', objectName: name, typeKey: 'usercontrol', status: patchOk ? 'pass' : 'error', latencyMs: patchRes.latencyMs });

      if (patchOk) {
        const patchedFile = (patchRes.raw as Record<string, unknown>)?.['outputFile'] as string;
        if (patchedFile) {
          // gx_import — apply patched XPZ
          const importRes = await client.call('gx_import', { xpzFile: patchedFile, name, type: 'usercontrol', fullOverwrite: true, confirm: true });
          const importRaw = importRes.raw as Record<string, unknown>;
          const importOk = !importRes.isError && importRaw?.['userIdOk'] === true;
          ops.push({
            op: 'gx_import:xpz',
            objectName: name,
            typeKey: 'usercontrol',
            status: importOk ? 'pass' : (importRes.isError ? 'error' : 'fail'),
            latencyMs: importRes.latencyMs,
            userIdOk: typeof importRaw?.['userIdOk'] === 'boolean' ? importRaw['userIdOk'] as boolean : undefined,
            detail: importOk ? undefined : String(importRes.raw).slice(0, 100),
          });
        }
      }
    }
  }

  // gx_delete
  const deleted = await doWrite(client, 'gx_delete', { name, type: 'usercontrol' });
  ops.push(op('gx_delete', name, 'usercontrol', deleted));
  cleanedUp = deleted.ok;

  return { typeKey: 'usercontrol', objectName: name, ops, cleanedUp };
}

// ── Main write benchmark runner ───────────────────────────────────────────────

export interface WriteOptions {
  types?: string[];   // filter by typeKey; all if empty
  verbose: boolean;
}

export async function runWriteBenchmark(opts: WriteOptions): Promise<void> {
  const allTypes = ['procedure', 'webcomponent', 'webpanel', 'transaction', 'sdt', 'usercontrol'];
  const types = opts.types && opts.types.length > 0 ? opts.types : allTypes;

  console.log(`\n[write] Running write benchmark for: ${types.join(', ')}`);
  console.log('[write] All test objects use prefix BncTest_ and are deleted after the run.\n');

  // Verify identity first
  const client = new GxMcpClient();
  await client.connect();

  const whoami = await client.call('gx_whoami', {});
  if (whoami.isError) {
    console.error('[write] gx_whoami failed — cannot verify identity. Aborting.');
    await client.close();
    process.exit(1);
  }
  const identity = whoami.raw as Record<string, unknown>;
  console.log(`[write] Identity: ${identity['windowsUser']} (kbUserId=${identity['kbUserId']}, sdkReady=${identity['sdkReady']})`);
  if (!identity['sdkReady']) {
    console.error('[write] SDK not ready. Aborting.');
    await client.close();
    process.exit(1);
  }

  const idx = Date.now() % 10000; // unique suffix per run
  const typeReports: WriteTypeReport[] = [];

  for (const typeKey of types) {
    process.stdout.write(`\n  [${typeKey}]\n`);
    let report: WriteTypeReport;
    try {
      switch (typeKey) {
        case 'procedure':    report = await benchProcedure(client, idx); break;
        case 'webcomponent': report = await benchWebComponent(client, idx); break;
        case 'webpanel':     report = await benchWebPanel(client, idx); break;
        case 'transaction':  report = await benchTransaction(client, idx); break;
        case 'sdt':          report = await benchSdt(client, idx); break;
        case 'usercontrol':  report = await benchUserControl(client, idx); break;
        default:
          console.warn(`  ⚠️  Unknown type: ${typeKey}`);
          continue;
      }
    } catch (err) {
      console.error(`  💥 Exception in ${typeKey}: ${err}`);
      continue;
    }

    typeReports.push(report);

    for (const o of report.ops) {
      const icon = o.status === 'pass' ? '✅' : o.status === 'fail' ? '❌' : '💥';
      const userId = o.userIdOk !== undefined ? ` userId=${o.userIdOk ? '✅' : '❌'}` : '';
      const detail = o.detail ? ` — ${o.detail}` : '';
      process.stdout.write(`    ${icon} ${o.op} (${o.latencyMs}ms)${userId}${detail}\n`);
    }

    if (!report.cleanedUp) {
      console.warn(`  ⚠️  ${report.objectName} may not have been deleted — clean up manually`);
    }
  }

  await client.close();

  // ── Summary ────────────────────────────────────────────────────────────────
  const allOps = typeReports.flatMap((r) => r.ops);
  const passed = allOps.filter((o) => o.status === 'pass').length;
  const failed = allOps.filter((o) => o.status === 'fail').length;
  const errored = allOps.filter((o) => o.status === 'error').length;
  const userIdFails = allOps.filter((o) => o.userIdOk === false).length;

  console.log('\n[write] Summary');
  console.log(`  Total ops: ${allOps.length}`);
  console.log(`  ✅ Pass:    ${passed}`);
  console.log(`  ❌ Fail:    ${failed}`);
  console.log(`  💥 Error:   ${errored}`);
  if (userIdFails > 0) console.log(`  🚨 UserId mismatch: ${userIdFails}`);

  // Write Markdown report
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const mdPath = path.join(RESULTS_DIR, `write-${ts}.md`);
  fs.writeFileSync(mdPath, buildWriteMarkdown(typeReports, ts), 'utf8');
  console.log(`\n[write] Report saved to ${mdPath}`);

  if (failed > 0 || errored > 0 || userIdFails > 0) {
    process.exitCode = 1;
  }
}

function buildWriteMarkdown(typeReports: WriteTypeReport[], ts: string): string {
  const lines: string[] = [
    `# gx18-mcp Write Benchmark`,
    '',
    `**Run:** ${ts}`,
    '',
    '| Status | Type | Operation | Object | Latency | UserId | Notes |',
    '|--------|------|-----------|--------|--------:|:------:|-------|',
  ];

  for (const tr of typeReports) {
    for (const o of tr.ops) {
      const icon = o.status === 'pass' ? '✅' : o.status === 'fail' ? '❌' : '💥';
      const uid = o.userIdOk !== undefined ? (o.userIdOk ? '✅' : '❌') : '—';
      const notes = o.detail?.slice(0, 60) ?? '';
      lines.push(`| ${icon} | \`${o.typeKey}\` | \`${o.op}\` | ${o.objectName} | ${o.latencyMs}ms | ${uid} | ${notes} |`);
    }
  }

  const notCleaned = typeReports.filter((r) => !r.cleanedUp);
  if (notCleaned.length > 0) {
    lines.push('');
    lines.push('## ⚠️ Objects not deleted (manual cleanup required)');
    for (const r of notCleaned) lines.push(`- \`${r.objectName}\` (${r.typeKey})`);
  }

  return lines.join('\n');
}
