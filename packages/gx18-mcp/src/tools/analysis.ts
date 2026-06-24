import { bridge } from '../sdk-bridge/bridge';

const ANALYSIS_TIMEOUT = 60_000;
const DEAD_CODE_LIMIT_MAX = 500;

export async function gxStats(args: { module?: string }): Promise<string> {
  const r = await bridge.send('stats', { module: args.module }, ANALYSIS_TIMEOUT);
  return JSON.stringify(r, null, 2);
}

export async function gxModules(_args: Record<string, never>): Promise<string> {
  const r = await bridge.send('modules', {}, ANALYSIS_TIMEOUT);
  return JSON.stringify(r, null, 2);
}

export async function gxDiff(args: {
  name: string;
  type: number;
  section?: string;
  versionA?: number;
  versionB?: number;
}): Promise<string> {
  if (!args.name) throw new Error('gx_diff requires name.');
  const r = await bridge.send('diff', {
    name: args.name,
    entityTypeId: args.type,
    section: args.section,
    versionA: args.versionA ?? 0,
    versionB: args.versionB ?? 0,
  }, ANALYSIS_TIMEOUT);
  return JSON.stringify(r, null, 2);
}

export async function gxDeadCode(args: {
  type?: number;
  module?: string;
  limit?: number;
  exclude?: string;
}): Promise<string> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), DEAD_CODE_LIMIT_MAX);
  const r = await bridge.send('dead_code', {
    entityTypeId: args.type ?? 34,
    module: args.module,
    limit,
    exclude: args.exclude,
  }, ANALYSIS_TIMEOUT);
  return JSON.stringify(r, null, 2);
}

export async function gxImpact(args: {
  name: string;
  type?: number;
  depth?: number;
}): Promise<string> {
  if (!args.name) throw new Error('gx_impact requires name.');
  const r = await bridge.send('impact', {
    name: args.name,
    entityTypeId: args.type ?? 0,
    depth: args.depth ?? 2,
  }, ANALYSIS_TIMEOUT);
  return JSON.stringify(r, null, 2);
}

export async function gxCompare(args: {
  name: string;
  type: number;
  targetDb: string;
  section?: string;
}): Promise<string> {
  if (!args.name) throw new Error('gx_compare requires name.');
  if (!args.targetDb) throw new Error('gx_compare requires targetDb (SQL Server database name of the KB to compare against).');
  const r = await bridge.send('compare', {
    name: args.name,
    entityTypeId: args.type,
    targetDb: args.targetDb,
    section: args.section,
  }, ANALYSIS_TIMEOUT);
  return JSON.stringify(r, null, 2);
}

export async function gxLint(args: {
  type?: number;
  module?: string;
  severity?: string;
}): Promise<string> {
  const r = await bridge.send('lint', {
    entityTypeId: args.type ?? 147,
    module: args.module,
    severity: args.severity,
  }, ANALYSIS_TIMEOUT);
  return JSON.stringify(r, null, 2);
}
