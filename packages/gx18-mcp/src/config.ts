import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

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

export interface ChatConfig {
  /** Absolute path to the `claude` binary. Empty = use PATH. */
  claudeCliPath?: string;
  /** Working directory for the claude subprocess. Empty = auto-detect from project root. */
  projectRoot?: string;
  /** Path to the nexa skills directory passed via --add-dir. Empty string = disabled. */
  nexaSkillsDir?: string;
  /** Additional --add-dir paths (one per entry). */
  addDirs?: string[];
}

export interface ChatDetection {
  claudeCliPath: string;       // resolved binary path
  claudeVersion: string;       // output of `claude --version`
  claudeOk: boolean;           // binary found and responds
  projectRoot: string;         // detected project root
  nexaSkillsDir: string;       // detected nexa path
  nexaExists: boolean;         // whether the nexa path actually exists
  authInfo: string;            // heuristic auth status message
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
  chat?: ChatConfig;
}

const DEFAULT_GX18_DIR = 'C:\\Program Files (x86)\\GeneXus\\GeneXus18U6';
export const CONFIG_FILE = path.join(os.homedir(), 'AppData', 'Local', 'gx18-mcp', 'config.json');

/**
 * Read config.json verbatim, WITHOUT env merge or defaults. Used by the web UI's
 * config save path: loadConfig() folds in env (.env / process.env) and would bake
 * environment-specific values into the persisted file on round-trip. Saving must
 * merge against this raw view instead.
 */
export function readRawConfig(): Partial<Config> {
  if (fs.existsSync(CONFIG_FILE)) {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as Partial<Config>; } catch { /* ignore */ }
  }
  return {};
}

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

  // When running as a pkg standalone exe, __dirname is the virtual snapshot
  // filesystem (C:\snapshot\src) — unexecutable. The real worker/ folder is
  // shipped next to the exe in the release zip, so resolve from there instead.
  const isPkg = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;
  const workerDir = isPkg
    ? path.join(path.dirname(process.execPath), 'worker')
    : path.join(__dirname, '..', 'worker');
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
    chat: saved.chat,
  };
}

export function saveConfig(config: Partial<Config>): void {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ── Conversation persistence ──────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  tools?: Array<{ id: string; name: string; result: string; isError: boolean }>;
}

export interface ConversationRecord {
  id: string;
  title: string;
  sessionId: string | null;
  msgs: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
}

const CONV_FILE = path.join(path.dirname(CONFIG_FILE), 'conversations.json');

export function loadConversations(): ConversationRecord[] {
  try { return JSON.parse(fs.readFileSync(CONV_FILE, 'utf-8')) as ConversationRecord[]; }
  catch { return []; }
}

export function saveConversations(convs: ConversationRecord[]): void {
  const dir = path.dirname(CONV_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONV_FILE, JSON.stringify(convs, null, 2));
}

export function findProjectRoot(): string | null {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.mcp.json'))) return dir;
    if (fs.existsSync(path.join(dir, '.gitignore')) && fs.existsSync(path.join(dir, 'CLAUDE.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ── Environment auto-detection ────────────────────────────────────────────────

export interface DetectedKb {
  kbPath: string;
  gxwFile: string;
  dbName: string;
  kbServer: string;
}

export interface DetectedEnvironment {
  kbs: DetectedKb[];
  gx18Dirs: string[];
}

/** Scan common paths for GeneXus 18 KBs and installs. Zero side-effects — safe to call anytime. */
export function detectEnvironment(): DetectedEnvironment {
  const kbs: DetectedKb[] = [];
  const gx18Dirs: string[] = [];

  // KB roots to scan (one level deep)
  const kbRoots = [
    'C:\\KBs',
    'C:\\GeneXus',
    path.join(os.homedir(), 'Documents', 'GeneXus'),
    path.join(os.homedir(), 'GeneXus'),
  ];

  for (const root of kbRoots) {
    if (!fs.existsSync(root)) continue;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const kbDir = path.join(root, entry.name);
      try {
        const files = fs.readdirSync(kbDir);
        const gxwFile = files.find(f => f.endsWith('.gxw'));
        if (!gxwFile) continue;

        let dbName = '';
        let kbServer = '(localdb)\\MSSQLLocalDB';
        const connFile = path.join(kbDir, 'knowledgebase.connection');
        if (fs.existsSync(connFile)) {
          try {
            const xml = fs.readFileSync(connFile, 'utf-8');
            const dbMatch = xml.match(/<DBName>([^<]+)<\/DBName>/);
            const srvMatch = xml.match(/<ServerInstance>([^<]+)<\/ServerInstance>/);
            if (dbMatch) dbName = dbMatch[1].trim();
            if (srvMatch) kbServer = srvMatch[1].trim();
          } catch { /* skip */ }
        }

        kbs.push({ kbPath: kbDir, gxwFile, dbName, kbServer });
      } catch { /* skip unreadable dirs */ }
    }
  }

  // Sort: most recently modified KB first
  kbs.sort((a, b) => {
    try { return fs.statSync(b.kbPath).mtimeMs - fs.statSync(a.kbPath).mtimeMs; } catch { return 0; }
  });

  // Scan for GX18 installs
  const gx18Root = 'C:\\Program Files (x86)\\GeneXus';
  if (fs.existsSync(gx18Root)) {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(gx18Root, { withFileTypes: true }); } catch { /* skip */ }
    for (const entry of entries) {
      if (!entry.isDirectory() || !/GeneXus18/i.test(entry.name)) continue;
      const gxDir = path.join(gx18Root, entry.name);
      const hasDll = fs.existsSync(path.join(gxDir, 'Artech.Common.Controls.dll')) ||
                     fs.existsSync(path.join(gxDir, 'GeneXus.Programs.Common.dll'));
      if (hasDll) gx18Dirs.push(gxDir);
    }
  }

  return { kbs, gx18Dirs };
}

/** Auto-detect Claude CLI binary, project root, nexa skills dir, and auth status. */
export function detectChatConfig(saved?: ChatConfig): ChatDetection {
  // 1. Resolve binary path
  let claudeCliPath = saved?.claudeCliPath?.trim() || '';
  if (!claudeCliPath) {
    try {
      const found = execSync('where claude', { encoding: 'utf-8', timeout: 3000 }).trim().split('\n')[0].trim();
      if (found) claudeCliPath = found;
    } catch { /* not in PATH */ }
    if (!claudeCliPath) claudeCliPath = 'claude'; // fallback, let spawn fail with a clear message
  }

  // 2. Verify binary + get version
  let claudeVersion = '';
  let claudeOk = false;
  try {
    claudeVersion = execSync(`"${claudeCliPath}" --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
    claudeOk = true;
  } catch {
    claudeVersion = 'not found';
  }

  // 3. Project root
  const projectRoot = saved?.projectRoot?.trim() || findProjectRoot() || process.cwd();

  // 4. Nexa skills
  const nexaSkillsDir = saved?.nexaSkillsDir ?? path.join(projectRoot, 'skills', 'nexa', 'nexa');
  const nexaExists = fs.existsSync(nexaSkillsDir);

  // 5. Auth heuristic: check ~/.claude/ for credential files
  let authInfo = 'unknown';
  const claudeDir = path.join(os.homedir(), '.claude');
  if (!fs.existsSync(claudeDir)) {
    authInfo = 'not logged in — run: claude auth login';
  } else {
    try {
      const files = fs.readdirSync(claudeDir);
      const hasCredentials = files.some((f) => /credential|auth|account|token/i.test(f));
      authInfo = hasCredentials ? 'credentials found' : 'logged in (settings found)';
    } catch {
      authInfo = '~/.claude found (cannot read)';
    }
  }

  return { claudeCliPath, claudeVersion, claudeOk, projectRoot, nexaSkillsDir, nexaExists, authInfo };
}
