using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using Gx18Mcp.SdkWorker.Sql;
using Gx18Mcp.SdkWorker.Identity;
using Gx18Mcp.SdkWorker.Sdk;
using Gx18Mcp.SdkWorker.Oracle;

namespace Gx18Mcp.SdkWorker
{
    class Program
    {
        private static readonly JavaScriptSerializer _json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private static KbSqlClient _sql;
        private static OracleClient _oracle;
        private static IdentityResolver _identity;
        private static AssemblyResolver _asmResolver;
        private static KbSession _kbSession;
        private static bool _sdkReady = false;
        private static bool _exitPending = false;

        [STAThread]
        static int Main(string[] args)
        {
            // Log unhandled exceptions from any thread before the runtime terminates the process.
            // Without this, background SDK threads crash silently with exit code -1.
            AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
            {
                var ex = e.ExceptionObject as Exception;
                Console.Error.WriteLine($"[gx18-worker] UNHANDLED EXCEPTION (isTerminating={e.IsTerminating}): {ex}");
            };

            // Configure stdout for newline-delimited JSON (NO BOM — UTF8Encoding(false))
            // System.Text.Encoding.UTF8 emits a BOM prefix that breaks JSON.parse on the Node.js side.
            var noBomUtf8 = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            Console.OutputEncoding = noBomUtf8;
            Console.InputEncoding = noBomUtf8;
            var stdout = new StreamWriter(Console.OpenStandardOutput(), noBomUtf8) { AutoFlush = true, NewLine = "\n" };
            Console.SetOut(stdout);

            // Initialize SQL client (always safe — no SDK)
            var kbServer = Environment.GetEnvironmentVariable("GX_KB_SERVER") ?? @"(localdb)\MSSQLLocalDB";
            var kbDatabase = Environment.GetEnvironmentVariable("GX_KB_DATABASE") ?? "";
            var gx18Dir = Environment.GetEnvironmentVariable("GX18_INSTALL_DIR")
                ?? @"C:\Program Files (x86)\GeneXus\GeneXus18U6";

            // The GeneXus BL loads native DLLs from the install dir AND from the shared Artech
            // protection folder (Common Files\Artech\GXprot*\Protect.dll). Our worker runs outside
            // both, so we must add them to the native loader search path.
            var nativeDirs = new System.Collections.Generic.List<string> { gx18Dir };
            var protDir = FindProtectionDir();
            if (protDir != null) nativeDirs.Add(protDir);
            foreach (var d in nativeDirs) { try { AddDllDirectory(d); } catch { } }
            try { SetDllDirectory(gx18Dir); } catch { }
            Environment.SetEnvironmentVariable("PATH",
                string.Join(";", nativeDirs) + ";" + (Environment.GetEnvironmentVariable("PATH") ?? ""));

            _sql = new KbSqlClient(kbServer, kbDatabase);
            _oracle = OracleClient.FromEnv();  // null if ORACLE_HOST not set
            _identity = new IdentityResolver(WindowsIdentity.GetCurrent().Name, _sql);
            _asmResolver = new AssemblyResolver(gx18Dir);

            Log($"Worker started. User: {WindowsIdentity.GetCurrent().Name}, KB: {kbDatabase}");

            // Main message loop
            string line;
            try
            {
                while ((line = Console.ReadLine()) != null)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    Dictionary<string, object> req;
                    int id = 0;
                    try
                    {
                        req = _json.Deserialize<Dictionary<string, object>>(line);
                        id = Convert.ToInt32(req["id"]);
                        var method = req["method"] as string ?? "";
                        var paramsDict = req.ContainsKey("params") ? req["params"] as Dictionary<string, object> : new Dictionary<string, object>();
                        var result = Dispatch(method, paramsDict ?? new Dictionary<string, object>());
                        WriteSuccess(id, result);
                        if (_exitPending)
                        {
                            try { _kbSession?.Dispose(); } catch { }
                            try { GC.Collect(); GC.WaitForPendingFinalizers(); } catch { }
                            Environment.Exit(0);
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine("[gx18-worker] FULL EXCEPTION:\n" + ex.ToString());
                        WriteError(id, Unwrap(ex));
                    }
                }
            }
            catch (IOException)
            {
                // stdin pipe closed — bridge shut down or process killed; exit cleanly
            }
            return 0;
        }

        private static object Dispatch(string method, Dictionary<string, object> p)
        {
            switch (method)
            {
                case "ping":    return Ping();
                case "whoami":  return _identity.GetInfo(_sdkReady, Environment.GetEnvironmentVariable("GX_KB_PATH"), Environment.GetEnvironmentVariable("GX18_INSTALL_DIR") ?? @"C:\Program Files (x86)\GeneXus\GeneXus18U6");
                case "find":
                {
                    // "type" may be a single number OR an array of EntityTypeIds.
                    if (p.ContainsKey("type") && p["type"] is object[] typeIds && typeIds.Length > 0)
                    {
                        var types = new int[typeIds.Length];
                        for (int i = 0; i < typeIds.Length; i++) types[i] = Convert.ToInt32(typeIds[i]);
                        return _sql.FindMulti(S(p, "pattern"), types, N(p, "limit", 50), S(p, "module"), S(p, "exclude"));
                    }
                    return _sql.Find(S(p, "pattern"), N(p, "type"), N(p, "limit", 50), S(p, "module"), S(p, "exclude"));
                }
                case "list":    return _sql.List(N(p, "type"), S(p, "module"), N(p, "limit", 100), N(p, "offset", 0), S(p, "exclude"));
                case "get":     return _sql.Get(S(p, "name"), N(p, "type"));
                case "read_source":    return _sql.ReadSource(N(p, "entityTypeId"), N(p, "entityId"));
                case "read_properties": return _sql.ReadProperties(S(p, "name"), N(p, "type"));
                case "read_structure":  return _sql.ReadStructure(S(p, "name"));
                case "sql_query": return _sql.Query(S(p, "query"), B(p, "readOnly", true), N(p, "maxRows", 1000));
                case "db_connections": return new { kbOk = _sql.TestConnection(), oracleOk = _oracle != null && _oracle.TestConnection() };
                case "oracle_query":
                {
                    if (_oracle == null) throw new Exception("Oracle not configured — set ORACLE_HOST in .env");
                    var oracleParams = p.ContainsKey("params") ? p["params"] as Dictionary<string, object> : null;
                    return _oracle.Query(S(p, "query"), B(p, "readOnly", true), N(p, "limit", 100), oracleParams);
                }
                case "export":   return _sql.Export(S(p, "name"), N(p, "type"), S(p, "outputDir", Environment.GetEnvironmentVariable("GX_OUTPUT_PATH") ?? @".\output"));
                case "read_xpz":
                    return Gx18Mcp.SdkWorker.Sdk.XpzHelper.ReadXpz(S(p, "xpzFile"), S(p, "scriptName"), S(p, "partFilter"));
                case "patch_xpz":
                {
                    // Multi-patch: if "patches" array is present, use batch mode.
                    if (p.ContainsKey("patches") && p["patches"] is object[] patchArr && patchArr.Length > 0)
                    {
                        var patchList = new List<KeyValuePair<string, string>>();
                        foreach (var item in patchArr)
                        {
                            if (item is Dictionary<string, object> pd)
                                patchList.Add(new KeyValuePair<string, string>(
                                    pd.ContainsKey("scriptName") ? pd["scriptName"]?.ToString() : null,
                                    pd.ContainsKey("content") ? pd["content"]?.ToString() ?? "" : ""));
                            else throw new Exception("Each patch must be an object with scriptName and content.");
                        }
                        return Gx18Mcp.SdkWorker.Sdk.XpzHelper.PatchXpzBatch(S(p, "xpzFile"), patchList, S(p, "outputFile"));
                    }
                    return Gx18Mcp.SdkWorker.Sdk.XpzHelper.PatchXpz(S(p, "xpzFile"), S(p, "scriptName"), S(p, "content"), S(p, "outputFile"));
                }
                case "create":
                {
                    var sections = new Dictionary<string, object>();
                    foreach (var key in new[] { "source", "events", "rules", "conditions", "layout", "properties", "template", "tokens", "styles", "elements", "structure" })
                        if (p.ContainsKey(key) && p[key] != null) sections[key] = p[key];
                    // ALL types — including webpanel/webcomponent (type 43) — create through the SDK.
                    // (The former SQL-only bypass for type 43 was removed: the SDK creates type 43
                    // cleanly headless and tokenizes events/rules, while the SQL clone produced objects
                    // the SDK could not re-open.) EnsureSdk() initializes StartBL + KB open + the
                    // assembly resolver that ObjectFactory.Resolve() needs to load Artech.Genexus.Common.
                    return EnsureSdk().CreateByKey(S(p, "type") ?? "", S(p, "name"), S(p, "module"), sections);
                }
                case "modify":   return EnsureSdk().ModifyByKey(S(p, "name"), S(p, "type"), S(p, "section"), S(p, "content"));
                case "export_xpz":
                {
                    // Multi-object export: if "names" array is present, use batch mode.
                    if (p.ContainsKey("names") && p["names"] is object[] nameArr && nameArr.Length > 0)
                    {
                        var typeKey = S(p, "type");
                        var items = new List<(string, string)>();
                        foreach (var n in nameArr) items.Add((typeKey, n?.ToString() ?? ""));
                        return EnsureSdk().ExportXpzBatch(items, S(p, "outputFile"));
                    }
                    return EnsureSdk().ExportXpz(S(p, "type"), S(p, "name"), S(p, "outputFile"));
                }
                case "import": return EnsureSdk().ImportXpz(S(p, "xpzFile"), S(p, "type"), S(p, "name"), B(p, "fullOverwrite", true));
                case "set_property": return EnsureSdk().SetProperty(S(p, "name"), S(p, "type"), S(p, "property"), S(p, "value"));
                case "rename":   return EnsureSdk().Rename(S(p, "name"), S(p, "type"), S(p, "newName"));
                case "validate": return EnsureSdk().Validate(S(p, "name"), S(p, "type"));
                case "build":    return EnsureSdk().Build(S(p, "name"), S(p, "type"));
                case "delete":   return EnsureSdk().DeleteObject(S(p, "name"), S(p, "type"), B(p, "dryRun", false));
                case "variable_list":   return EnsureSdk().VariableList(S(p, "name"), S(p, "type"));
                case "variable_add":    return EnsureSdk().VariableAdd(S(p, "name"), S(p, "type"), S(p, "varName"), S(p, "dataType"), N(p, "length"), N(p, "decimals"), B(p, "isCollection", false));
                case "variable_delete": return EnsureSdk().VariableDelete(S(p, "name"), S(p, "type"), S(p, "varName"));
                case "variable_update": return EnsureSdk().VariableUpdate(S(p, "name"), S(p, "type"), S(p, "varName"), S(p, "dataType"), N(p, "length", -1), N(p, "decimals", -1), p.ContainsKey("isCollection") ? p["isCollection"] : null);
                case "search":   return _sql.Search(S(p, "pattern"), N(p, "type"), S(p, "section"), N(p, "limit", 20), S(p, "module"), S(p, "exclude"));
                case "analyze":  return _sql.Analyze(S(p, "name"), N(p, "type"), S(p, "action", "usedby"), N(p, "limit", 50), S(p, "exclude"));
                case "history":  return _sql.GetHistory(S(p, "name"), N(p, "type"), N(p, "limit", 10));
                case "move":     return _sql.MoveToModule(S(p, "name"), N(p, "type"), S(p, "targetModule"));
                case "tokenize_spike": return EnsureSdk().TokenizeSpike(S(p, "name"), S(p, "source"), B(p, "allowSave", false));
                case "sdk_create_spike": return EnsureSdk().SdkCreateSpike(S(p, "name"), B(p, "isComponent", true), S(p, "module"));
                case "open_spike": return OpenSpike();
                case "import_spike": return ImportSpike(S(p, "xpzFile"), S(p, "type"), S(p, "name"), B(p, "fullOverwrite", true));
                case "probe_sdk": return SdkProbe.Run(
                    Environment.GetEnvironmentVariable("GX18_INSTALL_DIR") ?? @"C:\Program Files (x86)\GeneXus\GeneXus18U6",
                    S(p, "assembly"), S(p, "type"), S(p, "filter"));
                case "stats":
                    return _sql.Stats(S(p, "module"));

                case "modules":
                    return _sql.Modules();

                case "diff":
                    return _sql.Diff(
                        S(p, "name"),
                        N(p, "entityTypeId"),
                        S(p, "section"),
                        N(p, "versionA"),
                        N(p, "versionB")
                    );

                case "dead_code":
                    return _sql.DeadCode(
                        N(p, "entityTypeId"),
                        S(p, "module"),
                        N(p, "limit", 50),
                        S(p, "exclude")
                    );

                case "impact":
                    return _sql.Impact(
                        S(p, "name"),
                        N(p, "entityTypeId"),
                        N(p, "depth", 2)
                    );

                case "attribute_list":
                    return _sql.AttributeList(
                        S(p, "pattern"),
                        N(p, "limit", 100)
                    );

                case "compare":
                    return _sql.Compare(
                        S(p, "name"),
                        N(p, "entityTypeId"),
                        S(p, "targetDb"),
                        S(p, "section")
                    );

                case "lint":
                    return _sql.Lint(
                        N(p, "entityTypeId"),
                        S(p, "module"),
                        S(p, "severity")
                    );

                case "clone":
                    return EnsureSdk().Clone(
                        S(p, "typeKey"),
                        S(p, "sourceName"),
                        S(p, "targetName"),
                        S(p, "module")
                    );

                case "shutdown":
                    _exitPending = true;
                    return new { ok = true };
                default: throw new ArgumentException($"Unknown method: {method}");
            }
        }

        // Spike: measure EntityVersion delta around an SDK open/close.
        // Proves whether KnowledgeBase.Open() creates revisions (the gxnext storm).
        // MUST be run against a disposable clone KB, never the live KB.
        private static object OpenSpike()
        {
            const string countSql = "SELECT COUNT(*) FROM EntityVersion";
            long before = _sql.ScalarLong(countSql);

            _asmResolver.Register();
            var session = new KbSession(Environment.GetEnvironmentVariable("GX_KB_PATH") ?? "");
            object user;
            try
            {
                session.Open();
                user = session.GetUserInfo();
            }
            finally
            {
                session.Dispose();
            }

            long after = _sql.ScalarLong(countSql);
            return new { before, after, delta = after - before, user };
        }

        // Spike: import an .xpz into a clone KB and measure the EntityVersion delta + stamped UserId.
        // Proves whether the native GX18 import (a) stamps the correct Windows user and (b) creates a
        // bounded number of revisions (not the gxnext storm). MUST run against a disposable clone.
        private static object ImportSpike(string xpzFile, string type, string name, bool fullOverwrite)
        {
            const string countSql = "SELECT COUNT(*) FROM EntityVersion";
            long before = _sql.ScalarLong(countSql);
            var result = EnsureSdk().ImportXpz(xpzFile, type, name, fullOverwrite);
            long after = _sql.ScalarLong(countSql);
            return new { before, after, delta = after - before, import = result };
        }

        private static object Ping() => new {
            ok = true,
            protocolVersion = "1.0",
            sdkReady = _sdkReady,
            sqlReady = true,   // lazy — TestConnection() is slow (SQL Server auto-start); use sql_query to verify
            user = WindowsIdentity.GetCurrent().Name,
            kbPath = Environment.GetEnvironmentVariable("GX_KB_PATH") ?? ""
        };

        private static ObjectFactory EnsureSdk()
        {
            if (_kbSession == null)
            {
                Log("Initializing GX18 SDK...");
                _asmResolver.Register();
                _kbSession = new KbSession(Environment.GetEnvironmentVariable("GX_KB_PATH") ?? "");
            }

            if (_kbSession.KnowledgeBase == null)
            {
                // Open() on the same session instance — safe to call multiple times.
                // First call after worker start always NullRefs internally (GX18 cold-start);
                // the second call on the same session succeeds.
                try
                {
                    _kbSession.Open();
                    _sdkReady = true;
                    Log("SDK ready.");
                }
                catch (Exception ex)
                {
                    // Leave _kbSession set so next call retries Open() on the same instance.
                    throw new Exception("SDK cold-start — retry the call once. Error: " + ex.Message, ex);
                }
            }
            return new ObjectFactory(_kbSession, _identity, _sql);
        }

        private static void WriteSuccess(int id, object result)
        {
            Console.WriteLine(_json.Serialize(new { id, result }));
        }

        private static void WriteError(int id, string error)
        {
            Console.WriteLine(_json.Serialize(new { id, error }));
        }

        [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);

        [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr AddDllDirectory(string NewDirectory);

        // Locate the shared GeneXus protection folder (Common Files\Artech\GXprot*\Protect.dll).
        private static string FindProtectionDir()
        {
            var commonX86 = Environment.GetEnvironmentVariable("CommonProgramFiles(x86)")
                ?? @"C:\Program Files (x86)\Common Files";
            var artech = Path.Combine(commonX86, "Artech");
            if (!Directory.Exists(artech)) return null;
            foreach (var dir in Directory.GetDirectories(artech, "GXprot*"))
                if (File.Exists(Path.Combine(dir, "Protect.dll"))) return dir;
            return null;
        }

        private static string Unwrap(Exception ex)
        {
            var sb = new System.Text.StringBuilder();
            var e = ex;
            int depth = 0;
            while (e != null && depth < 6)
            {
                // TargetInvocationException only wraps — skip to InnerException to avoid the
                // uninformative "Exception has been thrown by the target of an invocation." prefix.
                if (e is System.Reflection.TargetInvocationException && e.InnerException != null)
                { e = e.InnerException; continue; }
                if (sb.Length > 0) sb.Append(" -> ");
                sb.Append(e.GetType().Name).Append(": ").Append(e.Message);
                e = e.InnerException;
                depth++;
            }
            return sb.ToString();
        }

        private static void Log(string msg) => Console.Error.WriteLine($"[gx18-worker] {msg}");

        // Param helpers
        private static string S(Dictionary<string, object> p, string k, string def = null)
            => p.ContainsKey(k) && p[k] != null ? p[k].ToString() : def;
        private static int N(Dictionary<string, object> p, string k, int def = 0)
            => p.ContainsKey(k) && p[k] != null ? Convert.ToInt32(p[k]) : def;
        private static bool B(Dictionary<string, object> p, string k, bool def = false)
            => p.ContainsKey(k) && p[k] != null ? Convert.ToBoolean(p[k]) : def;
    }
}
