// Compiles the C# launcher (GeneXusAIToolkit.exe) with Nara icon.
// The pkg bundle is renamed to GeneXusAIToolkit.core.exe.
// GeneXusAIToolkit.exe = tiny C# shim with the Nara icon that calls .core.exe
'use strict'

const { execSync } = require('child_process')
const path = require('path')
const fs   = require('fs')

const root = path.join(__dirname, '..')
const ico  = path.join(root, 'assets', 'icon.ico')
const cs   = path.join(root, 'scripts', 'launcher.cs')
const out  = path.join(root, 'release', 'GeneXusAIToolkit.exe')

const cscPaths = [
  `${process.env.WINDIR}\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe`,
  `${process.env.WINDIR}\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe`,
]
const csc = cscPaths.find(p => fs.existsSync(p))
if (!csc) { console.error('csc.exe not found — .NET Framework 4 required'); process.exit(1) }

if (fs.existsSync(out)) fs.unlinkSync(out)

execSync(
  `"${csc}" /nologo /target:exe /platform:x64 /win32icon:"${ico}" /out:"${out}" "${cs}"`,
  { stdio: 'inherit', shell: 'cmd.exe' }
)

const kb = Math.round(fs.statSync(out).size / 1024)
console.log(`Launcher built: GeneXusAIToolkit.exe (${kb} KB, Nara icon embedded)`)
