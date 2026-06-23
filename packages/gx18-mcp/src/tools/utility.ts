import path from 'path';
import { bridge } from '../sdk-bridge/bridge';
import { loadConfig, saveConfig } from '../config';
import { ValidateResult, BuildResult, SqlQueryResult, SearchResult } from '../sdk-bridge/protocol';
import { ENTITY_TYPE_TO_KEY } from './writer';
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
  type: number;
}): Promise<string> {
  const typeKey = ENTITY_TYPE_TO_KEY[args.type];
  if (!typeKey) {
    throw new Error(
      `gx_validate: unknown EntityTypeId ${args.type}. Known: ${Object.keys(ENTITY_TYPE_TO_KEY).join(', ')}.`
    );
  }
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
}): Promise<string> {
  if (!args.pattern) throw new Error('gx_search requires pattern.');
  const result = await bridge.send<SearchResult>('search', {
    pattern: args.pattern,
    type: args.type ?? 0,
    section: args.section ?? '',
    limit: args.limit ?? 20,
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
  confirm?: boolean;
}): Promise<string> {
  const readOnly = args.readOnly !== false;
  if (!readOnly && args.confirm !== true) {
    throw new Error('gx_sql with readOnly:false requires confirm: true. This operation modifies the KB database.');
  }
  const result = await bridge.send<SqlQueryResult>('sql_query', {
    query: args.query,
    readOnly,
  });
  return JSON.stringify(result, null, 2);
}

export async function gxReload(): Promise<string> {
  try {
    await bridge.restart();
    return JSON.stringify({ ok: true, message: 'Worker restarted. KB reopened fresh.' });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) });
  }
}

export async function gxExport(args: {
  name: string;
  type: number;
  outputDir?: string;
}): Promise<string> {
  const typeKey = ENTITY_TYPE_TO_KEY[args.type];
  if (!typeKey) {
    throw new Error(`Unknown EntityTypeId ${args.type} for export. Known: ${Object.keys(ENTITY_TYPE_TO_KEY).join(', ')}.`);
  }
  const outputDir = args.outputDir || loadConfig().outputPath;
  const outputFile = path.resolve(outputDir, `${args.name}.xpz`);

  // export_xpz exports via the Knowledge Manager service — a real, importable .xpz archive.
  const result = await bridge.send<{ ok: boolean; outputFile: string; bytes: number; fileExists: boolean }>(
    'export_xpz',
    { type: typeKey, name: args.name, outputFile },
    120000,
  );
  return JSON.stringify(result, null, 2);
}
