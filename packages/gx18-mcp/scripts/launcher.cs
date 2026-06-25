using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

class Launcher {
    [DllImport("kernel32.dll")] static extern bool   FreeConsole();
    [DllImport("kernel32.dll")] static extern bool   AllocConsole();
    [DllImport("kernel32.dll")] static extern bool   SetConsoleTitle(string title);
    [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string mod);
    [DllImport("user32.dll")]   static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
    // LR_SHARED (0x8000) — system retains handle ownership, no DestroyIcon needed
    [DllImport("user32.dll")]   static extern IntPtr LoadImage(IntPtr hInst, IntPtr name, uint type, int cx, int cy, uint flags);

    // Detach from any inherited console (PS/CMD) and create our own.
    // AllocConsole creates a new conhost window whose icon comes from this
    // EXE's PE resources (/win32icon:Nara). WM_SETICON is belt-and-suspenders.
    static void OwnConsole() {
        FreeConsole();
        AllocConsole();
        SetConsoleTitle("GeneXus AI Toolkit");

        try {
            var hWnd  = GetConsoleWindow();
            if (hWnd == IntPtr.Zero) return;
            var hInst = GetModuleHandle(null);
            const uint LR_SHARED = 0x8000;
            var small = LoadImage(hInst, (IntPtr)1, 1 /*IMAGE_ICON*/, 16, 16, LR_SHARED);
            var large = LoadImage(hInst, (IntPtr)1, 1 /*IMAGE_ICON*/, 32, 32, LR_SHARED);
            if (small != IntPtr.Zero) SendMessage(hWnd, 0x0080 /*WM_SETICON*/, (IntPtr)0 /*ICON_SMALL*/, small);
            if (large != IntPtr.Zero) SendMessage(hWnd, 0x0080 /*WM_SETICON*/, (IntPtr)1 /*ICON_BIG*/,   large);
        } catch (Exception ex) {
            Trace.WriteLine("OwnConsole icon error: " + ex.Message);
        }
    }

    // CommandLineToArgvW quoting: backslashes are special only before a '"'.
    static string QuoteArg(string a) {
        if (a.IndexOf(' ') < 0 && a.IndexOf('"') < 0 && a.IndexOf('\t') < 0) return a;
        var sb = new System.Text.StringBuilder("\"");
        int bs = 0;
        foreach (char c in a) {
            if (c == '\\') {
                bs++;
            } else if (c == '"') {
                sb.Append('\\', bs * 2 + 1);
                sb.Append('"');
                bs = 0;
            } else {
                sb.Append('\\', bs);
                sb.Append(c);
                bs = 0;
            }
        }
        sb.Append('\\', bs * 2); // trailing backslashes before closing quote
        sb.Append('"');
        return sb.ToString();
    }

    static int Main(string[] args) {
        OwnConsole();

        var dir  = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        var core = Path.Combine(dir, "GeneXusAIToolkit.core.exe");

        if (!File.Exists(core)) {
            Console.Error.WriteLine("ERROR: GeneXusAIToolkit.core.exe not found in " + dir);
            Console.Error.WriteLine("Press Enter to close...");
            Console.ReadLine();
            return 1;
        }

        var psi = new ProcessStartInfo(core) {
            UseShellExecute = false,
            Arguments       = args.Length > 0
                ? string.Join(" ", Array.ConvertAll(args, QuoteArg))
                : ""
        };
        var p = Process.Start(psi);
        if (p == null) return 1;
        p.WaitForExit();
        return p.ExitCode;
    }
}
