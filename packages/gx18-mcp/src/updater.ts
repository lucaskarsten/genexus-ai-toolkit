/**
 * Self-update for the standalone GeneXusAIToolkit.exe.
 *
 * Flow:
 *   1. Fetch latest GitHub release
 *   2. Compare semver — bail if already current
 *   3. Download the zip asset → temp dir
 *   4. Extract GeneXusAIToolkit.exe from the zip via PowerShell (-Command, no Bypass)
 *   5. Write a _update.cjs (Node.js) that waits for this process to exit, copies the
 *      new exe, relaunches it, then self-deletes
 *   6. Spawn the script via process.execPath (detached) and exit this process
 *
 * Returns true if an update was triggered (process will exit shortly).
 * Returns false on no update available, network error, or any other failure.
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
      `$entry = $zip.Entries | Where-Object { $_.Name -like 'GeneXusAIToolkit*.exe' } | Select-Object -First 1`,
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

export async function checkAndUpdate(currentVersion: string, exePath: string): Promise<boolean> {
  try {
    const release = await fetchJson(
      `https://api.github.com/repos/${REPO}/releases/latest`,
    ) as GhRelease;

    // Tag format: "gx18-mcp-v1.9.x" (was "gx18-mcp/v1.x.x" before CI fix in 27c06be)
    const latestTag = release.tag_name.replace(/^gx18-mcp[-\/]/, '');

    if (!isNewer(latestTag, currentVersion)) return false;

    console.log(`\n  [UPDATE] Nova versao: v${currentVersion} -> ${latestTag}`);
    console.log('  Baixando atualizacao...');

    const versionNum = latestTag.replace(/^v/, '');
    const assetName = release.assets.some((a) => a.name === `GeneXusAIToolkit-${versionNum}-windows.zip`)
      ? `GeneXusAIToolkit-${versionNum}-windows.zip`
      : 'GeneXusAIToolkit-windows.zip';
    const asset = release.assets.find((a) => a.name === assetName);
    if (!asset) {
      console.log('  [UPDATE] Asset nao encontrado no release — ignorando.');
      return false;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gx18-update-'));
    const zipPath = path.join(tmpDir, 'update.zip');
    const newExe = path.join(tmpDir, EXE_NAME);

    await download(asset.browser_download_url, zipPath);
    await extractExe(zipPath, newExe);

    // Node.js update script — avoids powershell -ExecutionPolicy Bypass which
    // triggers Trojan:Win32/FileFix.BBAIMTB. Node.js is guaranteed available
    // (it is the current runtime) and is not flagged by the same heuristic.
    //   1. Kill any lingering worker subprocess via taskkill
    //   2. Busy-wait 5s for the main process to fully release the file handle
    //   3. Retry copyFileSync until it succeeds (max 30 attempts, 2s apart)
    //   4. Spawn the updated exe detached
    //   5. Self-delete
    const jsPath = path.join(tmpDir, '_update.cjs');
    const jsScript = [
      "const {execSync,spawn}=require('child_process'),fs=require('fs');",
      "const [,,src,dest]=process.argv;",
      "try{execSync('taskkill /F /IM Gx18Mcp.SdkWorker.exe',{stdio:'ignore',timeout:5000})}catch{}",
      "const wait=ms=>{const e=Date.now()+ms;while(Date.now()<e){}};wait(5000);",
      "let ok=false;",
      "for(let i=0;i<30&&!ok;i++){try{fs.copyFileSync(src,dest);ok=true}catch{wait(2000)}}",
      "if(ok)spawn(dest,[],{detached:true,stdio:'ignore'}).unref();",
      "setTimeout(()=>{try{fs.unlinkSync(__filename)}catch{}},100);",
    ].join('\n');

    fs.writeFileSync(jsPath, jsScript, { encoding: 'utf8' });

    console.log(`  Atualizacao pronta. Reiniciando em ${latestTag}...\n`);
    console.log('  NAO reabra o aplicativo — ele reiniciara automaticamente.\n');

    // Write sentinel so the freshly-launched exe skips its own update check.
    try { fs.writeFileSync(SENTINEL, String(Date.now())); } catch { /* non-fatal */ }

    spawn(process.execPath, [jsPath, newExe, exePath], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    // Exit after 3s — gives Node.js time to flush and fully release the file handle.
    setTimeout(() => process.exit(0), 3000);
    return true;
  } catch {
    // Non-fatal — network errors, 404, parse failures, etc.
    return false;
  }
}
