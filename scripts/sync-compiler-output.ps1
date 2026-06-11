<#
.SYNOPSIS
    Syncs files from the GeneXus compiler output directory to a local reference folder.

.DESCRIPTION
    Copies files modified in the last $DaysBack days from your GeneXus compiler output
    (e.g., Tomcat webapps, IIS wwwroot) to a local reference folder so you can track
    what the compiler has generated.

    Run this after each GeneXus build to keep your local reference up to date.

.PARAMETER CompilerOutput
    Path to the GeneXus compiler output directory.
    Defaults to $env:GX_COMPILER_OUTPUT from your .env / environment.
    Examples:
      Tomcat: C:\tomcat\webapps\YourApp\static
      .NET:   C:\inetpub\wwwroot\YourApp\static

.PARAMETER LocalRef
    Destination folder for the synced files. Created if it doesn't exist.
    Default: .\reference

.PARAMETER ForceFullScan
    Ignores the cache file and rescans all files in CompilerOutput.

.PARAMETER DaysBack
    Number of days back to look for modified files. Default: 0 (today only).

.EXAMPLE
    .\sync-compiler-output.ps1
    Copies files modified today from $env:GX_COMPILER_OUTPUT to .\reference

.EXAMPLE
    .\sync-compiler-output.ps1 -ForceFullScan -DaysBack 7
    Copies all files modified in the last 7 days, ignoring cache.

.EXAMPLE
    .\sync-compiler-output.ps1 -CompilerOutput "C:\tomcat\webapps\MyApp\static" -LocalRef ".\gx-ref"
#>

param(
    [string]$CompilerOutput = $env:GX_COMPILER_OUTPUT,
    [string]$LocalRef       = ".\reference",
    [switch]$ForceFullScan,
    [int]$DaysBack          = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Validate parameters ────────────────────────────────────────────────────────

if (-not $CompilerOutput) {
    Write-Error @"
GX_COMPILER_OUTPUT is not set.

Set it in your environment or .env file:
  GX_COMPILER_OUTPUT=C:\tomcat\webapps\YourApp\static

Or pass it directly:
  .\sync-compiler-output.ps1 -CompilerOutput "C:\path\to\output"
"@
    exit 1
}

if (-not (Test-Path $CompilerOutput)) {
    Write-Error "Compiler output directory not found: $CompilerOutput"
    exit 1
}

# ── Setup paths ────────────────────────────────────────────────────────────────

$script:ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:RepoRoot   = Split-Path -Parent $script:ScriptDir
$script:SyncDir    = Join-Path $script:RepoRoot "sync"
$script:CacheFile  = Join-Path $script:SyncDir "gx-paths-cache.txt"

if (-not (Test-Path $script:SyncDir)) {
    New-Item -ItemType Directory -Path $script:SyncDir | Out-Null
}

# Resolve LocalRef relative to repo root
if (-not [System.IO.Path]::IsPathRooted($LocalRef)) {
    $LocalRef = Join-Path $script:RepoRoot $LocalRef.TrimStart(".\")
}

if (-not (Test-Path $LocalRef)) {
    Write-Host "Creating reference folder: $LocalRef"
    New-Item -ItemType Directory -Path $LocalRef -Force | Out-Null
}

# ── Load cache ─────────────────────────────────────────────────────────────────

$cachedPaths = @{}
if (-not $ForceFullScan -and (Test-Path $script:CacheFile)) {
    Write-Host "Loading cache from $script:CacheFile"
    Get-Content $script:CacheFile | ForEach-Object {
        $cachedPaths[$_] = $true
    }
}

# ── Find modified files ────────────────────────────────────────────────────────

$cutoff = (Get-Date).Date.AddDays(-$DaysBack)
Write-Host "Scanning for files modified since: $($cutoff.ToString('yyyy-MM-dd'))"
Write-Host "Source: $CompilerOutput"
Write-Host ""

$allFiles = Get-ChildItem -Path $CompilerOutput -Recurse -File |
    Where-Object { $_.LastWriteTime -ge $cutoff }

if ($allFiles.Count -eq 0) {
    Write-Host "No files modified since $($cutoff.ToString('yyyy-MM-dd')). Nothing to sync."
    Write-Host "Use -DaysBack N to look further back, or -ForceFullScan to sync everything."
    exit 0
}

Write-Host "Found $($allFiles.Count) modified file(s)."

# ── Copy files ─────────────────────────────────────────────────────────────────

$copied  = 0
$skipped = 0
$errors  = 0
$newPaths = @()

foreach ($file in $allFiles) {
    $relativePath = $file.FullName.Substring($CompilerOutput.Length).TrimStart('\', '/')
    $destPath     = Join-Path $LocalRef $relativePath
    $destDir      = Split-Path -Parent $destPath

    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    try {
        Copy-Item -Path $file.FullName -Destination $destPath -Force
        $newPaths += $file.FullName
        $copied++
        Write-Host "  COPY  $relativePath"
    } catch {
        Write-Warning "  FAIL  $relativePath — $_"
        $errors++
    }
}

# ── Update cache ───────────────────────────────────────────────────────────────

$allCachedPaths = ($cachedPaths.Keys + $newPaths) | Sort-Object -Unique
$allCachedPaths | Set-Content -Path $script:CacheFile -Encoding UTF8

# ── Summary ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "─────────────────────────────────────────────"
Write-Host "Sync complete"
Write-Host "  Copied : $copied file(s)"
Write-Host "  Errors : $errors"
Write-Host "  Dest   : $LocalRef"
Write-Host "  Cache  : $script:CacheFile ($($allCachedPaths.Count) total paths)"
Write-Host "─────────────────────────────────────────────"

if ($errors -gt 0) { exit 1 }
