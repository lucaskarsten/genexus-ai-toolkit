import { loadConfig } from '../config';
import { bridge } from '../sdk-bridge/bridge';

export async function gxDbConnections(): Promise<string> {
  const config = loadConfig();
  const list: object[] = [
    {
      name: 'kb',
      type: 'sqlserver',
      description: 'GeneXus KB database (Windows Integrated Security)',
      server: config.kbServer,
      database: config.kbDatabase,
      auth: 'integrated',
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
    });
  }

  return JSON.stringify(list, null, 2);
}

export async function gxDbQuery(args: {
  connection: string;
  query: string;
  readOnly?: boolean;
  limit?: number;
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
    // Oracle — route through C# bridge using ODP.NET Managed (supports NNE)
    const result = await bridge.send<{ rows: object[]; count: number }>(
      'oracle_query',
      { query, readOnly, limit },
      120000,  // 2-minute timeout for potentially slow Oracle queries
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
