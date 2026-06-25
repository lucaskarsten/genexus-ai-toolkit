import path from 'path';
import fs from 'fs';
import { bridge } from '../sdk-bridge/bridge';
import { loadConfig, saveConfig } from '../config';
import { ValidateResult, BuildResult, SqlQueryResult, SearchResult, ExportResult, ReadXpzResult, PatchXpzResult } from '../sdk-bridge/protocol';
import { ENTITY_TYPE_TO_KEY, KEY_TO_ENTITY_TYPE, resolveTypeKey } from './writer';
import { runDoctor } from '../doctor';

export async function gxSaveConfig(args: {
  kbPath?: string;
  kbDatabase?: string;
  kbServer?: string;
  gx18Dir?: string;
}): Promise<string> {
  const current = loadConfig();
  const updated = {
    kbPath: args.kbPath ?? current.kbPath,
    kbDatabase: args.kbDatabase ?? current.kbDatabase,
    kbServer: args.kbServer ?? current.kbServer,
    gx18Dir: args.gx18Dir ?? current.gx18Dir,
    outputPath: current.outputPath,
    db: current.db,
    chat: current.chat,
  };
  saveConfig(updated);
  // Restart the worker so it picks up the new KB connection
  try { await bridge.restart(); } catch { /* non-fatal — will reconnect on next call */ }
  return JSON.stringify({
    saved: true,
    kbPath: updated.kbPath,
    kbDatabase: updated.kbDatabase,
    kbServer: updated.kbServer,
    gx18Dir: updated.gx18Dir,
  }, null, 2);
}

export async function gxValidate(args: {
  name: string;
  type: number | string;
}): Promise<string> {
  const typeKey = resolveTypeKey(args.type);
  const result = await bridge.send<ValidateResult>('validate', {
    name: args.name,
    type: typeKey,
  }, 60000);
  return JSON.stringify(result, null, 2);
}

export async function gxBuild(args: {
  name: string;
  type: number;
  confirm?: boolean;
}): Promise<string> {
  if (args.confirm !== true) {
    throw new Error('gx_build requires confirm: true. This operation compiles an object in the GeneXus KB.');
  }
  const typeKey = ENTITY_TYPE_TO_KEY[args.type] ?? String(args.type);
  const result = await bridge.send<BuildResult>('build', {
    name: args.name,
    type: typeKey,
  }, 120000);
  return JSON.stringify(result, null, 2);
}

export async function gxSearch(args: {
  pattern: string;
  type?: number;
  section?: string;
  limit?: number;
  module?: string;
  exclude?: string;
}): Promise<string> {
  if (!args.pattern) throw new Error('gx_search requires pattern.');
  const result = await bridge.send<SearchResult>('search', {
    pattern: args.pattern,
    type: args.type ?? 0,
    section: args.section ?? '',
    limit: args.limit ?? 20,
    module: args.module,
    exclude: args.exclude,
  }, 60000);
  return JSON.stringify(result, null, 2);
}

export async function gxDoctor(): Promise<string> {
  const report = await runDoctor();
  return JSON.stringify(report, null, 2);
}

export async function gxSql(args: {
  query: string;
  readOnly?: boolean;
  maxRows?: number;
  confirm?: boolean;
}): Promise<string> {
  const readOnly = args.readOnly !== false;
  if (!readOnly && args.confirm !== true) {
    throw new Error('gx_sql with readOnly:false requires confirm: true. This operation modifies the KB database.');
  }
  const maxRows = Math.min(Math.max(args.maxRows ?? 1000, 1), 5000);
  const result = await bridge.send<SqlQueryResult>('sql_query', {
    query: args.query,
    readOnly,
    maxRows,
  });
  return JSON.stringify(result, null, 2);
}

export async function gxReload(): Promise<string> {
  try {
    await bridge.restart();
    return JSON.stringify({ ok: true, message: 'Worker restarted. KB reopened fresh.' });
  } catch (e) {
    const msg = String(e);
    // Worker exits during restart — expected behavior; bridge auto-recovers on next call.
    if (msg.includes('Worker exited') || msg.includes('Worker restart')) {
      return JSON.stringify({
        ok: true,
        message: 'Worker is restarting (exit detected). KB will reopen on the next tool call (~30s cold-start). Call gx_whoami to confirm readiness.',
      });
    }
    return JSON.stringify({ ok: false, error: msg });
  }
}

export async function gxExport(args: {
  name?: string;
  names?: string[];
  type: number | string;
  outputDir?: string;
}): Promise<string> {
  // Accept both numeric EntityTypeId and string type name ("procedure", "usercontrol", etc.)
  let typeNum: number;
  if (typeof args.type === 'string') {
    typeNum = KEY_TO_ENTITY_TYPE[args.type.toLowerCase()] ?? 0;
    if (!typeNum)
      throw new Error(
        `gx_export: unknown type name "${args.type}". ` +
        `Use number (34=procedure, 147=usercontrol, 43=webpanel, 161=dso…) ` +
        `or a known name: ${Object.keys(KEY_TO_ENTITY_TYPE).join(', ')}.`
      );
  } else {
    typeNum = args.type;
  }
  const typeKey = ENTITY_TYPE_TO_KEY[typeNum];
  if (!typeKey) {
    throw new Error(`Unknown EntityTypeId ${typeNum} for export. Known: ${Object.keys(ENTITY_TYPE_TO_KEY).join(', ')}.`);
  }

  // Normalise: support both single name and names array.
  const nameList: string[] = args.names?.length
    ? args.names
    : args.name
      ? [args.name]
      : [];
  if (nameList.length === 0) {
    throw new Error('gx_export requires name or names (array of object names to export).');
  }

  const outputDir = args.outputDir || loadConfig().outputPath;
  const baseName = nameList.length === 1 ? nameList[0] : `${nameList[0]}_and_${nameList.length - 1}_more`;
  const outputFile = path.resolve(outputDir, `${baseName}.xpz`);

  fs.mkdirSync(outputDir, { recursive: true });

  const payload: Record<string, unknown> = { type: typeKey, outputFile };
  if (nameList.length === 1) {
    payload['name'] = nameList[0];
  } else {
    payload['names'] = nameList;
  }

  // export_xpz exports via the Knowledge Manager service — a real, importable .xpz archive.
  // Auto-retry on NullReference: cold-start quirk where first export after worker restart always fails.
  let result: ExportResult;
  try {
    result = await bridge.send<ExportResult>('export_xpz', payload, 180000);
  } catch (e) {
    if (String(e).toLowerCase().includes('nullreference')) {
      process.stderr.write('[gx18-mcp] gx_export: cold-start NullReference — retrying automatically...\n');
      result = await bridge.send<ExportResult>('export_xpz', payload, 180000);
    } else throw e;
  }
  return JSON.stringify(result, null, 2);
}

export async function gxReadXpz(args: {
  xpzFile: string;
  scriptName?: string;
  partFilter?: string;
}): Promise<string> {
  if (!args.xpzFile) throw new Error('gx_read_xpz requires xpzFile.');
  if (!fs.existsSync(args.xpzFile)) {
    throw new Error(`gx_read_xpz: file not found: ${args.xpzFile}`);
  }
  const result = await bridge.send<ReadXpzResult>('read_xpz', {
    xpzFile: args.xpzFile,
    scriptName: args.scriptName ?? null,
    partFilter: args.partFilter ?? null,
  }, 30000);
  return JSON.stringify(result, null, 2);
}

export async function gxPatchXpz(args: {
  xpzFile: string;
  scriptName?: string;
  content?: string;
  patches?: Array<{ scriptName: string; content: string }>;
  outputFile?: string;
}): Promise<string> {
  if (!args.xpzFile) throw new Error('gx_patch_xpz requires xpzFile.');
  if (!fs.existsSync(args.xpzFile)) {
    throw new Error(`gx_patch_xpz: xpzFile not found: ${args.xpzFile}`);
  }

  // Accept either single scriptName/content or a patches array.
  const hasPatches = Array.isArray(args.patches) && args.patches.length > 0;
  const hasSingle = args.scriptName != null;
  if (!hasPatches && !hasSingle) {
    throw new Error('gx_patch_xpz requires either scriptName+content (single patch) or patches (array of {scriptName, content}).');
  }
  if (hasSingle && args.content == null) {
    throw new Error('gx_patch_xpz requires content when scriptName is provided (pass empty string to clear).');
  }

  if (args.outputFile) {
    fs.mkdirSync(path.dirname(args.outputFile), { recursive: true });
  }

  const payload: Record<string, unknown> = {
    xpzFile: args.xpzFile,
    outputFile: args.outputFile ?? null,
  };

  if (hasPatches) {
    payload['patches'] = args.patches;
  } else {
    payload['scriptName'] = args.scriptName;
    payload['content'] = args.content;
  }

  const result = await bridge.send<PatchXpzResult>('patch_xpz', payload, 30000);
  return JSON.stringify(result, null, 2);
}
