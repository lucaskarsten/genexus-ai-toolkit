using System;
using System.IO;
using System.Reflection;

namespace Gx18Mcp.SdkWorker.Sdk
{
    public class KbSession : IDisposable
    {
        private readonly string _kbPath;
        private object _kb; // KnowledgeBase instance (via reflection)
        private Type _kbType;

        public KbSession(string kbPath) { _kbPath = kbPath; }

        public object KnowledgeBase => _kb;
        public Type KbType => _kbType;

        public void Open()
        {
            if (string.IsNullOrEmpty(_kbPath))
                throw new Exception("GX_KB_PATH is not set");
            if (!Directory.Exists(_kbPath))
                throw new Exception($"KB path not found: {_kbPath}");

            var gxwFiles = Directory.GetFiles(_kbPath, "*.gxw");
            if (gxwFiles.Length == 0) throw new Exception($"No .gxw file found in: {_kbPath}");

            var kbAssembly = Assembly.Load("Artech.Architecture.Common");
            _kbType = kbAssembly.GetType("Artech.Architecture.Common.Objects.KnowledgeBase");
            if (_kbType == null) throw new Exception("KnowledgeBase type not found");

            // OpenOptions is a nested type: KnowledgeBase+OpenOptions, ctor takes (string location)
            var optionsType = kbAssembly.GetType("Artech.Architecture.Common.Objects.KnowledgeBase+OpenOptions");
            if (optionsType == null) throw new Exception("KnowledgeBase.OpenOptions type not found");

            var options = Activator.CreateInstance(optionsType, new object[] { _kbPath });
            // AvoidStartupUpdate=true prevents the open-time migration/reindex that re-saves objects
            // (the suspected cause of gxnext's revision storm). AvoidIndexing skips the index rebuild.
            SetProp(optionsType, options, "EnableMultiUser", true);
            SetProp(optionsType, options, "AvoidStartupUpdate", true);
            SetProp(optionsType, options, "AvoidIndexing", true);

            var openMethod = _kbType.GetMethod("Open", new[] { optionsType });
            if (openMethod == null) throw new Exception("KnowledgeBase.Open(OpenOptions) not found");

            // Redirect Console.Out -> stderr during BL bootstrap + open: the SDK logs to stdout,
            // which would corrupt our newline-delimited JSON-RPC protocol.
            var savedOut = Console.Out;
            var originalDir = Directory.GetCurrentDirectory();
            try
            {
                Console.SetOut(Console.Error);
                // The GeneXus BL (business logic / package system) MUST be started before any KB
                // operation, otherwise KnowledgeBase.Open NPEs on a null service singleton.
                // KbConversion.exe does Artech.Core.Connector.StartBL(); since our worker lives
                // outside the GX install dir, we use CustomStartBL with explicit paths.
                StartBL();
                Directory.SetCurrentDirectory(_kbPath);
                _kb = openMethod.Invoke(null, new object[] { options });
            }
            finally
            {
                Directory.SetCurrentDirectory(originalDir);
                Console.SetOut(savedOut);
            }

            if (_kb == null) throw new Exception("KnowledgeBase.Open returned null");
            Console.Error.WriteLine($"[gx18-worker] KB opened: {_kbPath}");
        }

        private static bool _blStarted;

        private static void StartBL()
        {
            if (_blStarted) return;
            var connType = Assembly.Load("Connector").GetType("Artech.Core.Connector");
            if (connType == null) throw new Exception("Artech.Core.Connector type not found");

            var isStarted = connType.GetProperty("IsBLStarted");
            if (isStarted != null && (bool)isStarted.GetValue(null)) { _blStarted = true; return; }

            var gx18Dir = Environment.GetEnvironmentVariable("GX18_INSTALL_DIR")
                ?? @"C:\Program Files (x86)\GeneXus\GeneXus18U6";
            var packagesDir = Path.Combine(gx18Dir, "Packages");

            var custom = connType.GetMethod("CustomStartBL", new[] { typeof(string), typeof(string), typeof(bool) });
            if (custom == null) throw new Exception("Connector.CustomStartBL(string,string,bool) not found");
            custom.Invoke(null, new object[] { gx18Dir, packagesDir, true });
            _blStarted = true;
            Console.Error.WriteLine("[gx18-worker] GeneXus BL started.");
        }

        private static void SetProp(Type t, object obj, string name, object value)
        {
            var p = t.GetProperty(name);
            if (p != null && p.CanWrite) p.SetValue(obj, value);
        }

        /// <summary>Returns the KB's resolved current user (Id + Name). This is the author stamped on Save.</summary>
        public object GetUserInfo()
        {
            if (_kb == null) return new { id = (int?)null, name = (string)null, userName = (string)null };
            var userProp = _kbType.GetProperty("User");
            var user = userProp?.GetValue(_kb);
            if (user == null) return new { id = (int?)null, name = (string)null, userName = (string)null };
            var ut = user.GetType();
            return new
            {
                id = ut.GetProperty("Id")?.GetValue(user),
                name = ut.GetProperty("Name")?.GetValue(user),
                userName = ut.GetProperty("UserName")?.GetValue(user),
            };
        }

        public void Dispose()
        {
            if (_kb != null)
            {
                try { _kbType?.GetMethod("Close")?.Invoke(_kb, null); } catch { }
                _kb = null;
            }
        }
    }
}
