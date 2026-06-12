# Starts GeneXus Next (Docker version) and waits for MCP to be ready.
# Reads GX_DOCKER_FOLDER and GX_MCP_PORT from .env in the repo root.
#
# Usage:
#   .\scripts\start-gxnext.ps1
#   .\scripts\start-gxnext.ps1 -DockerFolder "C:\path\to\gx-docker" -TimeoutSeconds 180
param(
    [string]$DockerFolder  = "",
    [int]$TimeoutSeconds   = 120
)

# ── Load .env ──────────────────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot "..\\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $name  = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            if (-not [System.Environment]::GetEnvironmentVariable($name)) {
                [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    }
}

# ── Resolve parameters ────────────────────────────────────────────────────
if (-not $DockerFolder) {
    $DockerFolder = $env:GX_DOCKER_FOLDER
}
if (-not $DockerFolder) {
    Write-Error "DockerFolder not set. Add GX_DOCKER_FOLDER to your .env file or pass -DockerFolder."
    exit 1
}

$mcpPort = if ($env:GX_MCP_PORT) { $env:GX_MCP_PORT } else { "8001" }
$mcpUrl  = "http://localhost:$mcpPort/mcp"
$ideUrl  = "http://localhost:3000"

# ── Already running? ───────────────────────────────────────────────────────
try {
    Invoke-WebRequest -Uri $ideUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
    Write-Host "GeneXus Next already running!" -ForegroundColor Green
    Write-Host "  IDE: $ideUrl" -ForegroundColor Cyan
    Write-Host "  MCP: $mcpUrl" -ForegroundColor Cyan
    exit 0
} catch {}

# ── Start Docker stack ─────────────────────────────────────────────────────
if (-not (Test-Path "$DockerFolder\dup.ps1")) {
    Write-Error "dup.ps1 not found in: $DockerFolder"
    exit 1
}

Write-Host "Starting GeneXus Next (Docker)..." -ForegroundColor Cyan
Push-Location $DockerFolder
try {
    & .\dup.ps1
} finally {
    Pop-Location
}

# ── Wait for IDE ──────────────────────────────────────────────────────────
Write-Host "Waiting for IDE on port 3000..." -ForegroundColor Yellow
$elapsed  = 0
$interval = 3

while ($elapsed -lt $TimeoutSeconds) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    try {
        Invoke-WebRequest -Uri $ideUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
        Write-Host ""
        Write-Host "GeneXus Next ready! (${elapsed}s)" -ForegroundColor Green
        Write-Host "  IDE: $ideUrl" -ForegroundColor Cyan
        Write-Host "  MCP: $mcpUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Claude Code: run /mcp to confirm gxnext connection." -ForegroundColor Yellow
        Write-Host "Codex CLI:   codex (project codex.toml is pre-configured)" -ForegroundColor Yellow
        exit 0
    } catch {}
    Write-Host "  ...waiting (${elapsed}/${TimeoutSeconds}s)"
}

Write-Warning "Timeout after $TimeoutSeconds seconds. Check: docker ps"
exit 1
