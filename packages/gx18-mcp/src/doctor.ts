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
        const result = await bridge.send<{ rows: Array<{ cnt: number }> }>(
          'sql_query',
          { query: 'SELECT COUNT(*) AS cnt FROM EntityVersion', readOnly: true },
        );
        checks.push({
          name: 'SQL EntityVersion rows',
          status: 'ok',
          detail: String(result.rows[0]?.cnt ?? '(none)'),
        });
      } catch (err) {
        checks.push({ name: 'SQL EntityVersion rows', status: 'warn', detail: String(err) });
      }
    }
  } catch (err) {
    checks.push({ name: 'Worker ping', status: 'fail', detail: String(err) });
  }

  return { checks, ok: checks.every((c) => c.status !== 'fail') };
}
