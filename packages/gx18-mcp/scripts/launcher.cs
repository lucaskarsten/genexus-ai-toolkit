using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// GUI launcher (GeneXusAIToolkit.exe). A real WinForms window owns the Nara icon,
// so the taskbar button shows it reliably — unlike a console window, whose icon is
// dictated by the host (Windows Terminal ignores WM_SETICON entirely on Win11).
// The window streams the core process's stdout/stderr into a log box and shuts the
// core down when closed.
class Launcher {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SetCurrentProcessExplicitAppUserModelID(string appID);

    [STAThread]
    static int Main(string[] args) {
        try { SetCurrentProcessExplicitAppUserModelID("GeneXusAIToolkit.App"); } catch { }

        var dir  = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        var core = Path.Combine(dir, "GeneXusAIToolkit.core.exe");

        if (!File.Exists(core)) {
            MessageBox.Show(
                "GeneXusAIToolkit.core.exe não encontrado em:\n" + dir,
                "GeneXus AI Toolkit", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var form = new LauncherForm(core, args)) {
            Application.Run(form);
            return form.ExitCode;
        }
    }
}

class LauncherForm : Form {
    readonly TextBox _log;
    Process _core;
    public int ExitCode { get; private set; }

    public LauncherForm(string corePath, string[] args) {
        Text = "GeneXus AI Toolkit";
        Width = 760;
        Height = 460;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(15, 17, 21);

        // Window + taskbar icon come from this EXE's embedded PE icon (/win32icon:Nara).
        try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }

        _log = new TextBox {
            Multiline = true,
            ReadOnly = true,
            Dock = DockStyle.Fill,
            ScrollBars = ScrollBars.Vertical,
            BackColor = Color.FromArgb(10, 12, 16),
            ForeColor = Color.FromArgb(230, 233, 239),
            Font = new Font("Consolas", 9f),
            BorderStyle = BorderStyle.None,
        };
        Controls.Add(_log);

        Load += (s, e) => StartCore(corePath, args);
        FormClosing += (s, e) => StopCore();
    }

    void StartCore(string corePath, string[] args) {
        var psi = new ProcessStartInfo(corePath) {
            UseShellExecute        = false,
            CreateNoWindow         = true,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            Arguments              = args.Length > 0
                ? string.Join(" ", Array.ConvertAll(args, QuoteArg))
                : "",
        };

        _core = new Process { StartInfo = psi, EnableRaisingEvents = true };
        _core.OutputDataReceived += (s, e) => Append(e.Data);
        _core.ErrorDataReceived  += (s, e) => Append(e.Data);
        _core.Exited += (s, e) => {
            try { ExitCode = _core.ExitCode; } catch { }
            // Core ended on its own — close the window too.
            if (!IsDisposed) BeginInvoke((Action)(() => { if (!IsDisposed) Close(); }));
        };

        try {
            _core.Start();
            _core.BeginOutputReadLine();
            _core.BeginErrorReadLine();
        } catch (Exception ex) {
            Append("ERRO ao iniciar o core: " + ex.Message);
        }
    }

    void StopCore() {
        try {
            if (_core != null && !_core.HasExited) {
                _core.Kill();
                _core.WaitForExit(3000);
            }
        } catch { }
    }

    void Append(string line) {
        if (line == null || IsDisposed) return;
        try {
            BeginInvoke((Action)(() => {
                if (IsDisposed) return;
                _log.AppendText(line + Environment.NewLine);
            }));
        } catch { }
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
}
