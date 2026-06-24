/**
 * Self-update for the standalone GeneXusAIToolkit.exe.
 *
 * Flow:
 *   1. Fetch latest GitHub release (non-blocking, fire-and-forget from launcher)
 *   2. Compare semver — bail if already current
 *   3. Download the zip asset → temp dir
 *   4. Extract GeneXusAIToolkit.exe from the zip via PowerShell
 *   5. Write a _update.bat that waits for this PID to exit, copies the new exe,
 *      relaunches it, then self-deletes
 *   6. Spawn the bat (detached) and exit this process
 *
 * Everything is non-fatal: any network or I/O error is silently swallowed.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';

const SENTINEL = path.join(os.tmpdir(), 'gx18mcp_updated');
const SENTINEL_TTL_MS = 90_000; // 90s grace — skip update check on fresh-after-update launch

/** Returns true if the process was just launched by the auto-updater and should skip the check. */
export function justUpdated(): boolean {
  try {
    const stat = fs.statSync(SENTINEL);
    if (Date.now() - stat.mtimeMs < SENTINEL_TTL_MS) return true;
    fs.unlinkSync(SENTINEL);
  } catch { /* file absent — normal launch */ }
  return false;
}

const REPO = 'lucaskarsten/genexus-ai-toolkit';
const ASSET_NAME = 'GeneXusAIToolkit-windows.zip';
const EXE_NAME = 'GeneXusAIToolkit.exe';

interface GhRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'gx18-mcp-updater',
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      // Follow one redirect (GitHub may redirect to api.github.com CDN)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'gx18-mcp-updater' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        return download(res.headers.location!, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
    });
    req.on('error', reject);
  });
}

function extractExe(zipPath: string, destExe: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$zip = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')`,
      `$entry = $zip.Entries | Where-Object { $_.Name -eq '${EXE_NAME}' } | Select-Object -First 1`,
      'if (-not $entry) { $zip.Dispose(); exit 1 }',
      `[System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, '${destExe.replace(/'/g, "''")}', $true)`,
      '$zip.Dispose()',
    ].join('; ');
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

export async function checkAndUpdate(currentVersion: string, exePath: string): Promise<void> {
  try {
    const release = await fetchJson(
      `https://api.github.com/repos/${REPO}/releases/latest`,
    ) as GhRelease;

    // Tag format: "gx18-mcp-v1.9.x" (was "gx18-mcp/v1.x.x" before CI fix in 27c06be)
    const latestTag = release.tag_name.replace(/^gx18-mcp[-\/]/, '');

    if (!isNewer(latestTag, currentVersion)) return;

    console.log(`\n  [UPDATE] Nova versao: v${currentVersion} -> ${latestTag}`);
    console.log('  Baixando atualizacao...');

    const asset = release.assets.find((a) => a.name === ASSET_NAME);
    if (!asset) {
      console.log('  [UPDATE] Asset nao encontrado no release — ignorando.');
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gx18-update-'));
    const zipPath = path.join(tmpDir, 'update.zip');
    const newExe = path.join(tmpDir, EXE_NAME);

    await download(asset.browser_download_url, zipPath);
    await extractExe(zipPath, newExe);

    // PowerShell script: wait for old process to exit, copy with retry (file may be
    // briefly locked if the user reopens quickly), relaunch, self-delete.
    // Runs hidden — no visible cmd windows.
    const ps1Path = path.join(tmpDir, '_update.ps1');
    const newExeQ = newExe.replace(/'/g, "''");
    const exePathQ = exePath.replace(/'/g, "''");
    const ps1 = [
      'Start-Sleep -Seconds 3',
      '$copied = $false',
      'for ($i = 0; $i -lt 10; $i++) {',
      '  try {',
      `    Copy-Item -Force '${newExeQ}' '${exePathQ}' -ErrorAction Stop`,
      '    $copied = $true; break',
      '  } catch { Start-Sleep -Seconds 2 }',
      '}',
      'if ($copied) {',
      `  Start-Process '${exePathQ}'`,
      '}',
      'Remove-Item -Force $PSCommandPath',
    ].join('\r\n');

    fs.writeFileSync(ps1Path, ps1, { encoding: 'utf8' });

    console.log(`  Atualizacao pronta. Reiniciando em ${latestTag}...\n`);
    console.log('  NAO reabra o aplicativo — ele reiniciara automaticamente.\n');

    // Write sentinel so the freshly-launched exe skips its own update check.
    try { fs.writeFileSync(SENTINEL, String(Date.now())); } catch { /* non-fatal */ }

    spawn('powershell', [
      '-WindowStyle', 'Hidden',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', ps1Path,
    ], { detached: true, stdio: 'ignore' }).unref();

    // Exit after 1.5s so PowerShell can copy the file.
    setTimeout(() => process.exit(0), 1500);
  } catch {
    // Non-fatal — network errors, 404, parse failures, etc.
  }
}
