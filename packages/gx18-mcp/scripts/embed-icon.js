// Embeds icon.ico into GeneXusAIToolkit.exe using Win32 UpdateResource API
// Bypasses rcedit (which fails silently with 32bpp transparent ICOs)
'use strict'

const { execSync } = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

// Target: argv[2] = custom exe path, or default to pkg base binary
const PKG_CACHE = path.join(os.homedir(), '.pkg-cache', 'v3.5', 'fetched-v18.20.4-win-x64')
const exe = process.argv[2] || PKG_CACHE
const ico = path.join(__dirname, '..', 'assets', 'icon.ico')

if (!fs.existsSync(exe)) { console.error('EXE not found:', exe); process.exit(1) }
if (!fs.existsSync(ico)) { console.error('ICO not found:', ico); process.exit(1) }

const ps1 = path.join(os.tmpdir(), 'embed-icon-gx18.ps1')

fs.writeFileSync(ps1, `
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class PEIcon {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr BeginUpdateResource(string f, bool del);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool UpdateResource(IntPtr h, IntPtr t, IntPtr n, ushort l, byte[] d, uint s);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool EndUpdateResource(IntPtr h, bool disc);

    public static void Embed(string exePath, string icoPath) {
        byte[] ico = File.ReadAllBytes(icoPath);
        int count = BitConverter.ToUInt16(ico, 4);
        IntPtr h = BeginUpdateResource(exePath, false);
        if (h == IntPtr.Zero) throw new Exception("BeginUpdateResource failed: " + Marshal.GetLastWin32Error());

        byte[] grp = new byte[6 + count * 14];
        grp[2] = 1;
        grp[4] = (byte)count;

        for (int i = 0; i < count; i++) {
            int e = 6 + i * 16;
            uint sz  = BitConverter.ToUInt32(ico, e + 8);
            uint off = BitConverter.ToUInt32(ico, e + 12);
            byte[] data = new byte[sz];
            Array.Copy(ico, off, data, 0, sz);

            if (!UpdateResource(h, (IntPtr)3, (IntPtr)(i + 1), 0, data, sz))
                Console.Error.WriteLine("RT_ICON " + (i+1) + " failed: " + Marshal.GetLastWin32Error());

            int g = 6 + i * 14;
            grp[g]   = ico[e];
            grp[g+1] = ico[e+1];
            grp[g+2] = ico[e+2];
            grp[g+3] = ico[e+3];
            Array.Copy(BitConverter.GetBytes(BitConverter.ToUInt16(ico, e + 4)), 0, grp, g + 4, 2);
            Array.Copy(BitConverter.GetBytes(BitConverter.ToUInt16(ico, e + 6)), 0, grp, g + 6, 2);
            Array.Copy(BitConverter.GetBytes(sz), 0, grp, g + 8, 4);
            Array.Copy(BitConverter.GetBytes((ushort)(i + 1)), 0, grp, g + 12, 2);
        }

        if (!UpdateResource(h, (IntPtr)14, (IntPtr)1, 0, grp, (uint)grp.Length))
            throw new Exception("RT_GROUP_ICON failed: " + Marshal.GetLastWin32Error());

        if (!EndUpdateResource(h, false))
            throw new Exception("EndUpdateResource failed: " + Marshal.GetLastWin32Error());

        Console.WriteLine("Icon embedded: " + count + " frame(s)");
    }
}
'@
[PEIcon]::Embed("${exe.replace(/\\/g, '\\\\')}", "${ico.replace(/\\/g, '\\\\')}")
`, 'utf8')

execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, { stdio: 'inherit' })
fs.unlinkSync(ps1)
