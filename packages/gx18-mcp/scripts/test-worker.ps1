# Runs the C# worker unit tests (xUnit, net48/x86).
# Worker is x86, so the test host is forced to x86 via tests.runsettings.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root "worker\Gx18Mcp.Tests\Gx18Mcp.Tests.csproj"
$settings = Join-Path $root "worker\tests.runsettings"
dotnet test $proj --settings $settings --nologo
exit $LASTEXITCODE
