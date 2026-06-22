import path from 'path';
import fs from 'fs';
import os from 'os';

export interface OracleConfig {
  host: string;
  port: number;
  service: string;
  user: string;
  password: string;
}

export interface SqlServerConfig {
  server: string;
  database: string;
  user?: string;
  password?: string;
  trustedConnection?: boolean;
}

export interface DbConnections {
  oracle?: OracleConfig;
  /** Additional named SQL Server connections (not the KB — use gx_sql for that) */
  sqlserver?: Record<string, SqlServerConfig>;
}

export interface Config {
  kbPath: string;
  kbServer: string;
  kbDatabase: string;
  gx18Dir: string;
  outputPath: string;
  workerExe: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  db: DbConnections;
}

const DEFAULT_GX18_DIR = 'C:\\Program Files (x86)\\GeneXus\\GeneXus18U6';
const CONFIG_FILE = path.join(os.homedir(), 'AppData', 'Local', 'gx18-mcp', 'config.json');

export function loadConfig(): Config {
  // Load .env from project root
  const root = findProjectRoot();
  if (root) {
    const envFile = path.join(root, '.env');
    if (fs.existsSync(envFile)) {
      const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
      for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const k = line.slice(0, eqIdx).trim();
        const v = line.slice(eqIdx + 1).trim();
        if (k && !k.startsWith('#')) {
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  }

  // Load config.json
  let saved: Partial<Config> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { /* ignore */ }
  }

  const workerDir = path.join(__dirname, '..', 'worker');
  const workerExe = path.join(workerDir, 'Gx18Mcp.SdkWorker.exe');

  const db: DbConnections = {};

  // Auto-detect Oracle from ORACLE_* env vars
  const oracleHost = process.env['ORACLE_HOST'];
  if (oracleHost) {
    db.oracle = {
      host: oracleHost,
      port: parseInt(process.env['ORACLE_PORT'] || '1521', 10),
      service: process.env['ORACLE_SERVICE'] || '',
      user: process.env['ORACLE_USER'] || '',
      password: process.env['ORACLE_PASSWORD'] || '',
    };
  }

  return {
    kbPath: process.env['GX_KB_PATH'] || saved.kbPath || '',
    kbServer: process.env['GX_KB_SERVER'] || saved.kbServer || '(localdb)\\MSSQLLocalDB',
    kbDatabase: process.env['GX_KB_DATABASE'] || saved.kbDatabase || '',
    gx18Dir: process.env['GX18_INSTALL_DIR'] || saved.gx18Dir || DEFAULT_GX18_DIR,
    outputPath: process.env['GX_OUTPUT_PATH'] || saved.outputPath || '.\\output',
    workerExe: process.env['GX18_WORKER_EXE'] || workerExe,
    logLevel: (process.env['GX18_LOG_LEVEL'] as Config['logLevel']) || 'info',
    db,
  };
}

export function saveConfig(config: Partial<Config>): void {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function findProjectRoot(): string | null {
  // Start from the package directory (two levels up from dist/src/__dirname at runtime,
  // or from __dirname itself at build time)
  let dir = __dirname;
  // Walk up looking for project markers
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.mcp.json'))) return dir;
    if (
      fs.existsSync(path.join(dir, '.gitignore')) &&
      fs.existsSync(path.join(dir, 'CLAUDE.md'))
    ) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
