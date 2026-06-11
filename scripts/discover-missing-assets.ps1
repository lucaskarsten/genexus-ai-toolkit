<#
.SYNOPSIS
    Scans source files for @import, src=, and href= references and checks if the
    referenced files exist. Can auto-fetch missing files from the compiler output.

.DESCRIPTION
    Helps detect:
    - @import references in .css files that point to missing DSOs
    - src= and href= references in .html/.view files that point to missing assets
    - Drift between your src/ files and what the compiler has generated

    Run this after a build or when investigating missing dependencies.

.PARAMETER SourcePath
    Directory to scan for source files. Default: .\src

.PARAMETER CompilerOutput
    Path to the GeneXus compiler output. Used for -AutoFetch and -Diff.
    Defaults to $env:GX_COMPILER_OUTPUT.

.PARAMETER AutoFetch
    Automatically copies missing files from CompilerOutput to SourcePath.

.PARAMETER Diff
    Compares files in SourcePath against CompilerOutput to detect drift
    (files that exist in src but differ from what the compiler generated).

.EXAMPLE
    .\discover-missing-assets.ps1
    Reports missing references without modifying anything.

.EXAMPLE
    .\discover-missing-assets.ps1 -AutoFetch
    Reports and auto-copies missing files from compiler output.

.EXAMPLE
    .\discover-missing-assets.ps1 -Diff
    Shows files that exist in both src and compiler output but differ.

.EXAMPLE
    .\discover-missing-assets.ps1 -SourcePath ".\GX\Src" -CompilerOutput "C:\tomcat\webapps\MyApp\static"
#>

param(
    [string]$SourcePath     = ".\src",
    [string]$CompilerOutput = $env:GX_COMPILER_OUTPUT,
    [switch]$AutoFetch,
    [switch]$Diff
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# ── Setup ──────────────────────────────────────────────────────────────────────

$script:ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:RepoRoot  = Split-Path -Parent $script:ScriptDir
$script:SyncDir   = Join-Path $script:RepoRoot "sync"
$script:ReportFile = Join-Path $script:SyncDir "discovery-report.txt"

if (-not (Test-Path $script:SyncDir)) {
    New-Item -ItemType Directory -Path $script:SyncDir | Out-Null
}

# Resolve SourcePath
if (-not [System.IO.Path]::IsPathRooted($SourcePath)) {
    $SourcePath = Join-Path $script:RepoRoot $SourcePath.TrimStart(".\")
}

if (-not (Test-Path $SourcePath)) {
    Write-Warning "Source path not found: $SourcePath"
    Write-Warning "Create it or pass -SourcePath with the correct path."
}

$report = @()
$report += "Discovery Report — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += "Source : $SourcePath"
$report += "Compiler Output: $(if ($CompilerOutput) { $CompilerOutput } else { '(not set)' })"
$report += ""

# ── Scan @import in CSS files ──────────────────────────────────────────────────

Write-Host "Scanning CSS files for @import references..."
$report += "=== @import references (CSS) ==="

$cssFiles = Get-ChildItem -Path $SourcePath -Recurse -Include "*.css" -ErrorAction SilentlyContinue

$missingImports = @()

foreach ($cssFile in $cssFiles) {
    $content = Get-Content $cssFile.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }

    $importMatches = [regex]::Matches($content, '@import\s+([A-Za-z0-9_-]+)\s*;')
    foreach ($match in $importMatches) {
        $importedName = $match.Groups[1].Value
        $importedFile = $importedName + ".css"

        # Search in source path
        $found = Get-ChildItem -Path $SourcePath -Recurse -Name $importedFile -ErrorAction SilentlyContinue
        if (-not $found) {
            $entry = "  MISSING  $importedFile (referenced in $($cssFile.Name))"
            $missingImports += @{ Name = $importedFile; Source = $cssFile.FullName }
            Write-Host $entry -ForegroundColor Yellow
            $report += $entry
        }
    }
}

if ($missingImports.Count -eq 0) {
    $report += "  (no missing @import references)"
    Write-Host "  No missing @import references."
}

$report += ""

# ── Scan src= and href= in HTML/.view files ────────────────────────────────────

Write-Host "Scanning HTML/.view files for src= and href= references..."
$report += "=== src= / href= references (HTML/.view) ==="

$htmlFiles = Get-ChildItem -Path $SourcePath -Recurse -Include "*.html","*.view" -ErrorAction SilentlyContinue

$missingRefs = @()

foreach ($htmlFile in $htmlFiles) {
    $content = Get-Content $htmlFile.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }

    # Match src="..." and href="..." (skip http/https/data: URLs and mustache {{...}})
    $refMatches = [regex]::Matches($content, '(?:src|href)="([^"{}]+)"')
    foreach ($match in $refMatches) {
        $refValue = $match.Groups[1].Value.Trim()
        # Skip absolute URLs and data: URIs
        if ($refValue -match '^https?://' -or $refValue -match '^data:' -or $refValue -match '^\{\{') {
            continue
        }
        # Skip empty or anchor-only refs
        if ($refValue -eq '' -or $refValue.StartsWith('#')) { continue }

        $refFileName = Split-Path -Leaf $refValue
        $found = Get-ChildItem -Path $SourcePath -Recurse -Name $refFileName -ErrorAction SilentlyContinue
        if (-not $found) {
            $entry = "  MISSING  $refFileName (referenced in $($htmlFile.Name))"
            $missingRefs += @{ Name = $refFileName; Path = $refValue; Source = $htmlFile.FullName }
            Write-Host $entry -ForegroundColor Yellow
            $report += $entry
        }
    }
}

if ($missingRefs.Count -eq 0) {
    $report += "  (no missing src=/href= references)"
    Write-Host "  No missing src=/href= references."
}

$report += ""

# ── AutoFetch: copy missing files from compiler output ────────────────────────

if ($AutoFetch) {
    if (-not $CompilerOutput) {
        Write-Warning "-AutoFetch requires GX_COMPILER_OUTPUT to be set."
    } elseif (-not (Test-Path $CompilerOutput)) {
        Write-Warning "Compiler output not found: $CompilerOutput"
    } else {
        Write-Host ""
        Write-Host "=== AutoFetch: searching for missing files in compiler output ==="
        $report += "=== AutoFetch Results ==="

        $allMissing = @()
        foreach ($m in $missingImports) { $allMissing += $m.Name }
        foreach ($m in $missingRefs)    { $allMissing += $m.Name }
        $allMissing = $allMissing | Sort-Object -Unique

        foreach ($fileName in $allMissing) {
            $found = Get-ChildItem -Path $CompilerOutput -Recurse -Name $fileName -ErrorAction SilentlyContinue
            if ($found) {
                $srcFile  = Join-Path $CompilerOutput $found
                $destFile = Join-Path $SourcePath $fileName
                try {
                    Copy-Item -Path $srcFile -Destination $destFile -Force
                    $entry = "  FETCHED  $fileName → $SourcePath"
                    Write-Host $entry -ForegroundColor Green
                    $report += $entry
                } catch {
                    $entry = "  FAILED   $fileName — $_"
                    Write-Host $entry -ForegroundColor Red
                    $report += $entry
                }
            } else {
                $entry = "  NOT FOUND in compiler output: $fileName"
                Write-Host $entry -ForegroundColor Red
                $report += $entry
            }
        }
        $report += ""
    }
}

# ── Diff: compare src vs compiler output ──────────────────────────────────────

if ($Diff) {
    if (-not $CompilerOutput) {
        Write-Warning "-Diff requires GX_COMPILER_OUTPUT to be set."
    } elseif (-not (Test-Path $CompilerOutput)) {
        Write-Warning "Compiler output not found: $CompilerOutput"
    } else {
        Write-Host ""
        Write-Host "=== Diff: comparing src files against compiler output ==="
        $report += "=== Drift Detection (src vs compiler output) ==="

        $srcFiles = Get-ChildItem -Path $SourcePath -Recurse -File -ErrorAction SilentlyContinue

        $drifted = 0
        foreach ($srcFile in $srcFiles) {
            $found = Get-ChildItem -Path $CompilerOutput -Recurse -Name $srcFile.Name -ErrorAction SilentlyContinue
            if ($found) {
                $compilerFile = Join-Path $CompilerOutput $found
                $srcHash      = (Get-FileHash $srcFile.FullName -Algorithm MD5).Hash
                $compHash     = (Get-FileHash $compilerFile -Algorithm MD5).Hash
                if ($srcHash -ne $compHash) {
                    $entry = "  DRIFT  $($srcFile.Name)  (src differs from compiler output)"
                    Write-Host $entry -ForegroundColor Cyan
                    $report += $entry
                    $drifted++
                }
            }
        }

        if ($drifted -eq 0) {
            $report += "  (no drift detected — all src files match compiler output)"
            Write-Host "  No drift detected."
        } else {
            $report += "  Total drifted: $drifted file(s)"
        }
        $report += ""
    }
}

# ── Summary ────────────────────────────────────────────────────────────────────

$summary = @(
    "─────────────────────────────────────────────",
    "Discovery complete",
    "  Missing @imports : $($missingImports.Count)",
    "  Missing refs     : $($missingRefs.Count)",
    "  Report saved to  : $script:ReportFile",
    "─────────────────────────────────────────────"
)
$summary | ForEach-Object { Write-Host $_ }
$report += $summary

# ── Save report ────────────────────────────────────────────────────────────────

$report | Set-Content -Path $script:ReportFile -Encoding UTF8
Write-Host ""
Write-Host "Full report: $script:ReportFile"
