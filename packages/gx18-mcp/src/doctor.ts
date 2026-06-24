import fs from 'fs';
import { loadConfig } from './config';
import { bridge } from './sdk-bridge/bridge';

// Structured health check shared by the CLI `doctor` command and the web UI's
// POST /api/doctor. IMPORTANT: runDoctor() must NOT shut down the bridge — in the
// long-lived UI server a shutdown would kill an in-flight write in another tab.
// The CLI shuts the worker down itself after rendering the report.

export interface DoctorCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  ok: boolean;
}

export async function runDoctor(): Promise<DoctorReport> {
  const config = loadConfig();
  const checks: DoctorCheck[] = [];

  // 1. Worker exe
  if (fs.existsSync(config.workerExe)) {
    checks.push({ name: 'Worker exe', status: 'ok', detail: config.workerExe });
  } else {
    checks.push({
      name: 'Worker exe',
      status: 'fail',
      detail: `Not found: ${config.workerExe} — run: npm run build:worker`,
    });
  }

  // 2. GX18 install dir
  if (fs.existsSync(config.gx18Dir)) {
    checks.push({ name: 'GX18 dir', status: 'ok', detail: config.gx18Dir });
  } else {
    checks.push({ name: 'GX18 dir', status: 'warn', detail: `Not found: ${config.gx18Dir}` });
  }

  // 3. KB path
  if (config.kbPath && fs.existsSync(config.kbPath)) {
    checks.push({ name: 'KB path', status: 'ok', detail: config.kbPath });
  } else {
    checks.push({ name: 'KB path', status: 'warn', detail: `Not set or missing: ${config.kbPath}` });
  }

  // 4. Ping worker (+ EntityVersion count when SQL is ready)
  // Only ping if the worker is already running — avoid auto-starting it just for a health check,
  // which would wake up LocalDB and consume memory unnecessarily.
  const workerAlive = bridge.status().alive;
  if (!workerAlive) {
    checks.push({ name: 'Worker ping', status: 'warn', detail: 'Worker not started (will start on first tool call)' });
  } else {
    try {
      const ping = await bridge.send<{
        ok: boolean; sdkReady: boolean; sqlReady: boolean; user: string; kbPath: string;
      }>('ping', {}, 15000);
      checks.push({
        name: 'Worker ping',
        status: 'ok',
        detail: `user=${ping.user} kbPath=${ping.kbPath} sdkReady=${ping.sdkReady} sqlReady=${ping.sqlReady}`,
      });

      if (ping.sqlReady) {
        try {
          // TOP 1 avoids a full table scan — we just need to know the table is accessible.
          // The actual row count is expensive on large KBs (LocalDB full scan).
          const result = await bridge.send<{ rows: Array<{ cnt: number }> }>(
            'sql_query',
            { query: 'SELECT COUNT(*) AS cnt FROM (SELECT TOP 5000 1 AS n FROM EntityVersion) t', readOnly: true },
          );
          const cnt = result.rows[0]?.cnt ?? 0;
          checks.push({
            name: 'SQL EntityVersion rows',
            status: 'ok',
            detail: cnt >= 5000 ? `${cnt}+ (sampled)` : String(cnt),
          });
        } catch (err) {
          checks.push({ name: 'SQL EntityVersion rows', status: 'warn', detail: String(err) });
        }

        // DB connection ping — confirms live reachability of KB and Oracle (if configured).
        try {
          const dbPing = await bridge.send<{ kbOk: boolean; oracleOk: boolean }>('db_connections', {}, 15000);
          checks.push({
            name: 'DB connections',
            status: dbPing.kbOk ? 'ok' : 'fail',
            detail: `kb=${dbPing.kbOk ? 'reachable' : 'UNREACHABLE'} oracle=${dbPing.oracleOk ? 'reachable' : 'not configured or unreachable'}`,
          });
        } catch (err) {
          checks.push({ name: 'DB connections', status: 'warn', detail: `ping failed: ${String(err)}` });
        }
      }
    } catch (err) {
      checks.push({ name: 'Worker ping', status: 'fail', detail: String(err) });
    }
  }

  return { checks, ok: checks.every((c) => c.status !== 'fail') };
}
