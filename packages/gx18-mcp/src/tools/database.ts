import { loadConfig } from '../config';
import { bridge } from '../sdk-bridge/bridge';
import { MoveResult } from '../sdk-bridge/protocol';

export async function gxDbConnections(): Promise<string> {
  const config = loadConfig();

  let kbPing = false;
  let oraclePing = false;
  try {
    const ping = await bridge.send<{ kbOk: boolean; oracleOk: boolean }>('db_connections', {}, 15000);
    kbPing = !!ping.kbOk;
    oraclePing = !!ping.oracleOk;
  } catch { /* non-fatal — still list connections even if ping fails */ }

  const list: object[] = [
    {
      name: 'kb',
      type: 'sqlserver',
      description: 'GeneXus KB database (Windows Integrated Security)',
      server: config.kbServer,
      database: config.kbDatabase,
      auth: 'integrated',
      ping: kbPing,
    },
  ];

  if (config.db.oracle) {
    const o = config.db.oracle;
    list.push({
      name: 'oracle',
      type: 'oracle',
      description: 'Oracle database (ODP.NET Managed, supports NNE)',
      host: o.host,
      port: o.port,
      service: o.service,
      user: o.user,
      ping: oraclePing,
    });
  }

  return JSON.stringify(list, null, 2);
}

export async function gxDbQuery(args: {
  connection: string;
  query: string;
  readOnly?: boolean;
  limit?: number;
  params?: Record<string, string | number>;
  confirm?: boolean;
}): Promise<string> {
  const { connection, query } = args;
  const readOnly = args.readOnly !== false;
  const limit = Math.min(args.limit ?? 100, 1000);

  if (!readOnly && args.confirm !== true) {
    throw new Error('gx_db_query with readOnly:false requires confirm:true');
  }

  if (connection === 'kb') {
    // KB SQL Server — route through C# bridge (Windows Integrated Security)
    const result = await bridge.send<{ rows: object[]; count: number }>(
      'sql_query',
      { query, readOnly },
      60000,
    );
    const rows = (result.rows ?? []).slice(0, limit);
    return JSON.stringify(
      { connection: 'kb', rows, count: rows.length, truncated: result.count > limit },
      null,
      2,
    );
  }

  if (connection === 'oracle') {
    // Oracle — route through C# bridge using ODP.NET Managed (supports NNE).
    // Pass named params to prevent SQL injection via string concatenation.
    const result = await bridge.send<{ rows: object[]; count: number }>(
      'oracle_query',
      { query, readOnly, limit, params: args.params ?? null },
      120000,
    );
    return JSON.stringify(
      { connection: 'oracle', rows: result.rows ?? [], count: result.count, truncated: result.count === limit },
      null,
      2,
    );
  }

  const config = loadConfig();
  const available = ['kb', ...(config.db.oracle ? ['oracle'] : [])];
  throw new Error(`Unknown connection: "${connection}". Available: ${available.join(', ')}`);
}

export async function gxMove(args: {
  name: string;
  type: number;
  targetModule: string;
  confirm?: boolean;
}): Promise<string> {
  if (!args.name) throw new Error('gx_move requires name.');
  if (!args.targetModule) throw new Error('gx_move requires targetModule.');
  if (args.confirm !== true) {
    throw new Error('gx_move requires confirm: true. This operation modifies ModelEntityVersion in the KB database.');
  }
  const result = await bridge.send<MoveResult>('move', {
    name: args.name,
    type: args.type,
    targetModule: args.targetModule,
  });
  return JSON.stringify(result, null, 2);
}
