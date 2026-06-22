import path from 'path';
import { bridge } from '../sdk-bridge/bridge';
import { loadConfig } from '../config';
import { ValidateResult, BuildResult, SqlQueryResult } from '../sdk-bridge/protocol';
import { ENTITY_TYPE_TO_KEY } from './writer';

export async function gxValidate(args: {
  name: string;
  type: number;
}): Promise<string> {
  const result = await bridge.send<ValidateResult>('validate', {
    name: args.name,
    type: args.type,
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
  const result = await bridge.send<BuildResult>('build', {
    name: args.name,
    type: args.type,
  }, 120000);
  return JSON.stringify(result, null, 2);
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
