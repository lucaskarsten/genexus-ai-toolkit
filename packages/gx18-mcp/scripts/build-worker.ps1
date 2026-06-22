# Build the C# worker subprocess (Gx18Mcp.SdkWorker.exe)
# Uses dotnet build (SDK-style project) which handles NuGet restore automatically.
# Requires .NET SDK 6+ and .NET Framework 4.8 reference assemblies.

$project = Join-Path $PSScriptRoot "..\worker\Gx18Mcp.SdkWorker\Gx18Mcp.SdkWorker.csproj"
$output  = Join-Path $PSScriptRoot "..\dist\worker"

if (-not (Test-Path $project)) {
    Write-Error "C# project not found at $project"
    exit 1
}

New-Item -ItemType Directory -Force -Path $output | Out-Null

Write-Host "Building C# worker (net48 x86 Release via dotnet build)..."

dotnet build $project `
    -c Release `
    /p:PlatformTarget=x86 `
    /p:OutputPath=$output `
    --verbosity minimal

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed (exit code $LASTEXITCODE)"
    exit $LASTEXITCODE
}

# Strip non-runtime artifacts so they never reach the published tarball.
# Keep the .exe, .exe.config and the runtime DLLs; drop debug symbols and Oracle trace logs.
Get-ChildItem -Path $output -Include *.pdb, *.log -File -Recurse -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Worker built -> $output\Gx18Mcp.SdkWorker.exe"
