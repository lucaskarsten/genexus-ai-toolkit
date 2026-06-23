import { bridge } from '../sdk-bridge/bridge';

export async function gxStats(args: { module?: string }): Promise<string> {
  const r = await bridge.send('stats', { module: args.module });
  return JSON.stringify(r, null, 2);
}

export async function gxModules(_args: Record<string, never>): Promise<string> {
  const r = await bridge.send('modules', {});
  return JSON.stringify(r, null, 2);
}

export async function gxDiff(args: {
  name: string;
  type: number;
  section?: string;
  versionA?: number;
  versionB?: number;
}): Promise<string> {
  const r = await bridge.send('diff', {
    name: args.name,
    entityTypeId: args.type,
    section: args.section,
    versionA: args.versionA ?? 0,
    versionB: args.versionB ?? 0,
  });
  return JSON.stringify(r, null, 2);
}

export async function gxDeadCode(args: {
  type?: number;
  module?: string;
  limit?: number;
}): Promise<string> {
  const r = await bridge.send('dead_code', {
    entityTypeId: args.type ?? 34,
    module: args.module,
    limit: args.limit ?? 50,
  });
  return JSON.stringify(r, null, 2);
}

export async function gxImpact(args: {
  name: string;
  type?: number;
  depth?: number;
}): Promise<string> {
  const r = await bridge.send('impact', {
    name: args.name,
    entityTypeId: args.type ?? 0,
    depth: args.depth ?? 2,
  });
  return JSON.stringify(r, null, 2);
}

export async function gxCompare(args: {
  name: string;
  type: number;
  targetDb: string;
  section?: string;
}): Promise<string> {
  const r = await bridge.send('compare', {
    name: args.name,
    entityTypeId: args.type,
    targetDb: args.targetDb,
    section: args.section,
  });
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
  });
  return JSON.stringify(r, null, 2);
}
