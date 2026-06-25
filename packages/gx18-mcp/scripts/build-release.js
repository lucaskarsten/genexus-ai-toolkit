// Assembles release zip: GeneXusAIToolkit.exe + worker/ + README.txt
// Uses child_process.execSync with PowerShell to zip
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { version } = require('../package.json');

// Create README.txt
const readme = `GeneXus AI Toolkit — gx18-mcp

INSTALAÇÃO:
1. Extraia todos os arquivos nesta pasta
2. Dê duplo clique em GeneXusAIToolkit.exe
3. Configure os caminhos no browser

REQUISITOS:
- Windows 10+ (64-bit)
- .NET Framework 4.8 (já incluso no Windows 10+)
- GeneXus 18 instalado (para operações de escrita na KB)

Para mais informações: https://github.com/lucaskarsten/genexus-ai-toolkit
`;
fs.writeFileSync(path.join(root, 'release', 'README.txt'), readme, 'utf8');

// Copy worker dir into release/worker/
const workerSrc = path.join(root, 'dist', 'worker');
const workerDst = path.join(root, 'release', 'worker');
if (fs.existsSync(workerDst)) {
  fs.rmSync(workerDst, { recursive: true });
}
fs.cpSync(workerSrc, workerDst, { recursive: true });

// Rename exe to versioned filename
const exeSrc = path.join(root, 'release', 'GeneXusAIToolkit.exe');
const exeVersioned = path.join(root, 'release', `GeneXusAIToolkit-${version}.exe`);
if (fs.existsSync(exeVersioned)) fs.rmSync(exeVersioned);
fs.copyFileSync(exeSrc, exeVersioned);

// Create versioned zip via PowerShell
const zipPath = path.join(root, 'release', `GeneXusAIToolkit-${version}-windows.zip`);
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

execSync(
  `Compress-Archive -Path "${exeSrc}","${workerDst}","${path.join(root, 'release', 'README.txt')}" -DestinationPath "${zipPath}" -Force`,
  { shell: 'powershell.exe', stdio: 'inherit' }
);

console.log(`Release ${version} created:`);
console.log('  exe:', exeVersioned);
console.log('  zip:', zipPath);
