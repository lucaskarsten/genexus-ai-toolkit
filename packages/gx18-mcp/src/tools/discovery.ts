import { bridge } from '../sdk-bridge/bridge';
import { EntityInfo, EntityDetail, AnalyzeResult, HistoryResult } from '../sdk-bridge/protocol';

export async function gxFind(args: {
  pattern: string;
  type?: number | number[];
  limit?: number;
  module?: string;
  exclude?: string;
}): Promise<string> {
  if (args.limit !== undefined && (args.limit <= 0 || args.limit > 5000)) {
    throw new Error('gx_find: limit must be between 1 and 5000.');
  }
  const results = await bridge.send<EntityInfo[]>('find', {
    pattern: args.pattern,
    type: args.type,
    limit: args.limit ?? 50,
    module: args.module,
    exclude: args.exclude,
  });
  return JSON.stringify(results, null, 2);
}

export async function gxList(args: {
  type: number;
  module?: string;
  limit?: number;
  offset?: number;
  exclude?: string;
}): Promise<string> {
  const results = await bridge.send<EntityInfo[]>('list', {
    type: args.type,
    module: args.module,
    limit: args.limit ?? 100,
    offset: args.offset ?? 0,
    exclude: args.exclude,
  });
  return JSON.stringify(results, null, 2);
}

export async function gxGet(args: {
  name: string;
  type: number;
}): Promise<string> {
  const result = await bridge.send<EntityDetail>('get', {
    name: args.name,
    type: args.type,
  });
  return JSON.stringify(result, null, 2);
}

export async function gxAnalyze(args: {
  name: string;
  type: number;
  action?: 'usedby' | 'uses' | 'dependencies';
  limit?: number;
  exclude?: string;
}): Promise<string> {
  if (!args.name) throw new Error('gx_analyze requires name.');
  const result = await bridge.send<AnalyzeResult>('analyze', {
    name: args.name,
    type: args.type,
    action: args.action ?? 'usedby',
    limit: args.limit ?? 50,
    exclude: args.exclude,
  }, 60000);
  return JSON.stringify(result, null, 2);
}

export async function gxWhereUsed(args: {
  name: string;
  type: number;
  limit?: number;
  exclude?: string;
}): Promise<string> {
  return gxAnalyze({ ...args, action: 'usedby' });
}

export async function gxHistory(args: {
  name: string;
  type: number;
  limit?: number;
}): Promise<string> {
  if (!args.name) throw new Error('gx_history requires name.');
  const result = await bridge.send<HistoryResult>('history', {
    name: args.name,
    type: args.type,
    limit: args.limit ?? 10,
  });
  return JSON.stringify(result, null, 2);
}
