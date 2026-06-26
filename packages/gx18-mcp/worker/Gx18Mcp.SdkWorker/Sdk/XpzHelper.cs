using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace Gx18Mcp.SdkWorker.Sdk
{
    internal static class XpzHelper
    {
        // Maps <Part type="GUID"> GUIDs to friendly section names.
        // Confirmed from real IDE-exported XPZ files (GX18 IDE, Knowledge Manager → Export).
        private static readonly Dictionary<string, string> PartGuidToName =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "763f0d8b-d8ac-4db4-8dd4-de8979f2b5b9", "Conditions" },
                { "babf62c5-0111-49e9-a1c3-cc004d90900a", "Documentation" },
                { "c44bd5ff-f918-415b-98e6-aca44fed84fa", "Events" },
                { "ad3ca970-19d0-44e1-a7b7-db05556e820c", "Help" },
                { "528d1c06-a9c2-420d-bd35-21dca83f12ff", "ProcedureSource" },
                { "9b0a32a3-de6d-4be1-a4dd-1b85d3741534", "Rules" },
                { "e4c4ade7-53f0-4a56-bdfd-843735b66f47", "Variables" },
                { "d24a58ad-57ba-41b7-9e6e-eaca3543c778", "WebForm" },
                // UserControl parts (must match the GUIDs emitted by SqlExportXpz in KbSqlClient).
                // ScreenTemplate (148) is exported as <Part><Source>; Properties (149) is exported as
                // <Definition> and its inner <Script> elements are surfaced individually by scriptRx.
                { "3dd92fe7-b095-44d3-9fa0-8488fa3f0c67", "ScreenTemplate" },
                { "8e9e4a7c-a4d3-4c36-8e8e-fb6702402f63", "Properties" },
            };

        private static readonly Dictionary<string, string> PartNameToGuid =
            new Func<Dictionary<string, string>>(() =>
            {
                var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var kv in PartGuidToName) d[kv.Value] = kv.Key;
                return d;
            })();

        public static object ReadXpz(string xpzFile, string scriptName, string partFilter = null)
        {
            if (!File.Exists(xpzFile))
                throw new Exception("xpz file not found: " + xpzFile);

            string xml = ReadXmlFromZip(xpzFile);

            // UC format: <Script Name="AfterShow"><![CDATA[...]]></Script>
            var scriptRx = new Regex(
                @"<Script\b[^>]*\bName=""([^""]+)""[^>]*><!\[CDATA\[([\s\S]*?)\]\]></Script>",
                RegexOptions.Compiled);

            // WebPanel/WBC format (SQL-exported): <Part type="GUID"><Source><![CDATA[...]]></Source>
            var partSourceRx = new Regex(
                @"<Part\b[^>]*\btype=""([^""]+)""[^>]*>\s*<Source><!\[CDATA\[([\s\S]*?)\]\]></Source>",
                RegexOptions.Compiled);

            var scripts = new List<object>();
            bool found = false;

            void AddEntry(string sName, string sBody)
            {
                if (!string.IsNullOrEmpty(partFilter) &&
                    string.IsNullOrEmpty(scriptName) &&
                    sName.IndexOf(partFilter, StringComparison.OrdinalIgnoreCase) < 0)
                    return;

                bool isTarget = !string.IsNullOrEmpty(scriptName) &&
                                string.Equals(sName, scriptName, StringComparison.OrdinalIgnoreCase);
                if (isTarget) found = true;

                if (string.IsNullOrEmpty(scriptName))
                    scripts.Add(new { name = sName, length = sBody.Length });
                else if (isTarget)
                    scripts.Add(new { name = sName, length = sBody.Length, content = sBody });
            }

            foreach (Match m in scriptRx.Matches(xml))
                AddEntry(m.Groups[1].Value, m.Groups[2].Value);

            foreach (Match m in partSourceRx.Matches(xml))
            {
                string guid = m.Groups[1].Value;
                string body = m.Groups[2].Value;
                string sName = PartGuidToName.TryGetValue(guid, out var n) ? n : guid;
                AddEntry(sName, body);
            }

            if (!string.IsNullOrEmpty(scriptName) && !found)
                throw new Exception("Script '" + scriptName + "' not found in " + Path.GetFileName(xpzFile) +
                    ". Use gx_read_xpz without scriptName to list available scripts.");

            return new
            {
                ok = true,
                xpzFile,
                scripts,
                scriptCount = scripts.Count
            };
        }

        // Returns the names of all <Object> elements declared in the XPZ.
        // Used by ImportXpz to enumerate which objects the archive affects.
        public static List<string> ListObjectNames(string xpzFile)
        {
            string xml = ReadXmlFromZip(xpzFile);
            var rx = new Regex(@"<Object\b[^>]*\bname=""([^""]+)""", RegexOptions.Compiled | RegexOptions.IgnoreCase);
            var names = new List<string>();
            foreach (Match m in rx.Matches(xml))
                names.Add(m.Groups[1].Value);
            return names;
        }

        // Patch multiple scripts in one ZIP pass. patches is a list of (scriptName, content) pairs.
        public static object PatchXpzBatch(string xpzFile, List<KeyValuePair<string, string>> patches, string outputFile)
        {
            if (!File.Exists(xpzFile))
                throw new Exception("xpz file not found: " + xpzFile);
            if (patches == null || patches.Count == 0)
                throw new Exception("patches list is empty");

            if (string.IsNullOrEmpty(outputFile))
            {
                var dir2 = Path.GetDirectoryName(xpzFile) ?? ".";
                var baseName2 = Path.GetFileNameWithoutExtension(xpzFile);
                outputFile = Path.Combine(dir2, baseName2 + "_patched.xpz");
            }

            if (string.Equals(Path.GetFullPath(outputFile), Path.GetFullPath(xpzFile), StringComparison.OrdinalIgnoreCase))
                throw new Exception(
                    "outputFile must differ from xpzFile — cannot overwrite the source archive. " +
                    "Pass a different path for outputFile or omit it to auto-generate '_patched.xpz'.");

            string entryName2;
            string xml2 = ReadXmlEntry(xpzFile, out entryName2);

            var patchResults = new List<object>();
            foreach (var patch in patches)
            {
                if (string.IsNullOrEmpty(patch.Key))
                    throw new Exception("Each patch must have a non-empty scriptName.");
                if ((patch.Value ?? "").Contains("]]>"))
                    throw new Exception(
                        $"Patch for script '{patch.Key}' contains ']]>' which is the CDATA closing marker. " +
                        "Refactor the script to avoid the literal ']]>' sequence.");

                // Try UC format first: <Script Name="X"><![CDATA[...]]></Script>
                var scriptRx2 = new Regex(
                    @"<Script\b[^>]*\bName=""" + Regex.Escape(patch.Key) + @"""[^>]*><!\[CDATA\[([\s\S]*?)\]\]></Script>",
                    RegexOptions.Compiled);
                var origMatch2 = scriptRx2.Match(xml2);

                if (origMatch2.Success)
                {
                    int origLen2 = origMatch2.Groups[1].Value.Length;
                    var replaceRx2 = new Regex(
                        @"(<Script\b[^>]*\bName=""" + Regex.Escape(patch.Key) + @"""[^>]*>)<!\[CDATA\[[\s\S]*?\]\]>(</Script>)",
                        RegexOptions.Compiled);
                    xml2 = replaceRx2.Replace(xml2,
                        m => m.Groups[1].Value + "<![CDATA[" + patch.Value + "]]>" + m.Groups[2].Value);
                    patchResults.Add(new { scriptName = patch.Key, originalLength = origLen2, newLength = (patch.Value ?? "").Length });
                }
                else if (PartNameToGuid.TryGetValue(patch.Key, out var partGuid2))
                {
                    // WebPanel/WBC format: <Part type="GUID"><Source><![CDATA[...]]></Source>
                    var partOrigRx2 = new Regex(
                        @"(<Part\b[^>]*\btype=""" + Regex.Escape(partGuid2) + @"""[^>]*>\s*<Source>)<!\[CDATA\[([\s\S]*?)\]\]>(</Source>)",
                        RegexOptions.Compiled);
                    var partOrigMatch2 = partOrigRx2.Match(xml2);
                    if (!partOrigMatch2.Success)
                        throw new Exception($"Part '{patch.Key}' (GUID {partGuid2}) not found as <Source> element in XPZ XML. Use gx_read_xpz to list available sections.");
                    int origLen3 = partOrigMatch2.Groups[2].Value.Length;
                    xml2 = partOrigRx2.Replace(xml2,
                        m => m.Groups[1].Value + "<![CDATA[" + patch.Value + "]]>" + m.Groups[3].Value);
                    patchResults.Add(new { scriptName = patch.Key, originalLength = origLen3, newLength = (patch.Value ?? "").Length });
                }
                else
                {
                    throw new Exception($"Script/part '{patch.Key}' not found in XPZ XML. Use gx_read_xpz to list available scripts. Known part names: {string.Join(", ", PartNameToGuid.Keys)}.");
                }
            }

            // Bump lastUpdate + zero checksum once after all patches applied
            var now2 = DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss");
            xml2 = Regex.Replace(xml2, @"(<Object\b[^>]*\blastUpdate="")[^""]*("")",
                m => m.Groups[1].Value + now2 + m.Groups[2].Value);
            xml2 = Regex.Replace(xml2, @"(<Object\b[^>]*\bchecksum="")[^""]*("")",
                m => m.Groups[1].Value + new string('0', 32) + m.Groups[2].Value);

            var bomUtf82 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
            using (var ms2 = new MemoryStream())
            {
                using (var zip2 = new ZipArchive(ms2, ZipArchiveMode.Create, leaveOpen: true))
                {
                    var entry2 = zip2.CreateEntry(entryName2, CompressionLevel.Optimal);
                    using (var writer2 = new StreamWriter(entry2.Open(), bomUtf82))
                    { writer2.NewLine = "\r\n"; writer2.Write(xml2); }
                }
                File.WriteAllBytes(outputFile, ms2.ToArray());
            }

            return new { ok = true, xpzFile, outputFile, patches = patchResults, patchCount = patchResults.Count };
        }

        public static object PatchXpz(string xpzFile, string scriptName, string content, string outputFile)
        {
            if (!File.Exists(xpzFile))
                throw new Exception("xpz file not found: " + xpzFile);
            if (string.IsNullOrEmpty(scriptName))
                throw new Exception("scriptName is required");

            if (string.IsNullOrEmpty(outputFile))
            {
                var dir = Path.GetDirectoryName(xpzFile) ?? ".";
                var baseName = Path.GetFileNameWithoutExtension(xpzFile);
                outputFile = Path.Combine(dir, baseName + "_patched.xpz");
            }

            if (string.Equals(Path.GetFullPath(outputFile), Path.GetFullPath(xpzFile), StringComparison.OrdinalIgnoreCase))
                throw new Exception(
                    $"outputFile must differ from xpzFile — cannot overwrite the source archive. " +
                    $"Pass a different path for outputFile or omit it to auto-generate '_patched.xpz'.");



            string entryName;
            string xml = ReadXmlEntry(xpzFile, out entryName);

            if ((content ?? "").Contains("]]>"))
                throw new Exception(
                    "content contains ']]>' which is the CDATA closing marker and cannot be embedded " +
                    "in an XPZ script body. Refactor the script to avoid the literal ']]>' sequence " +
                    "(e.g. split the string constant across two lines or use a variable).");
            string safeCdata = content ?? "";

            // Try UC format: <Script Name="X"><![CDATA[...]]></Script>
            var origRx = new Regex(
                @"<Script\b[^>]*\bName=""" + Regex.Escape(scriptName) + @"""[^>]*><!\[CDATA\[([\s\S]*?)\]\]></Script>",
                RegexOptions.Compiled);
            var origMatch = origRx.Match(xml);
            int originalLength;
            string patchedXml;

            if (origMatch.Success)
            {
                originalLength = origMatch.Groups[1].Value.Length;
                var replaceRx = new Regex(
                    @"(<Script\b[^>]*\bName=""" + Regex.Escape(scriptName) + @"""[^>]*>)<!\[CDATA\[[\s\S]*?\]\]>(</Script>)",
                    RegexOptions.Compiled);
                patchedXml = replaceRx.Replace(xml,
                    m => m.Groups[1].Value + "<![CDATA[" + safeCdata + "]]>" + m.Groups[2].Value);
            }
            else if (PartNameToGuid.TryGetValue(scriptName, out var partGuid))
            {
                // WebPanel/WBC format: <Part type="GUID"><Source><![CDATA[...]]></Source>
                var partOrigRx = new Regex(
                    @"(<Part\b[^>]*\btype=""" + Regex.Escape(partGuid) + @"""[^>]*>\s*<Source>)<!\[CDATA\[([\s\S]*?)\]\]>(</Source>)",
                    RegexOptions.Compiled);
                var partOrigMatch = partOrigRx.Match(xml);
                if (!partOrigMatch.Success)
                    throw new Exception($"Part '{scriptName}' (GUID {partGuid}) not found as <Source> element in XPZ XML. Use gx_read_xpz to list available sections.");
                originalLength = partOrigMatch.Groups[2].Value.Length;
                patchedXml = partOrigRx.Replace(xml,
                    m => m.Groups[1].Value + "<![CDATA[" + safeCdata + "]]>" + m.Groups[3].Value);
            }
            else
            {
                throw new Exception("Script '" + scriptName + "' not found in XPZ XML. Use gx_read_xpz to list available scripts. " +
                    $"Known part names for WebPanel XPZ: {string.Join(", ", PartNameToGuid.Keys)}.");
            }

            // Bump lastUpdate on <Object ...> element
            var now = DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss");
            patchedXml = Regex.Replace(patchedXml,
                @"(<Object\b[^>]*\blastUpdate="")[^""]*("")",
                m => m.Groups[1].Value + now + m.Groups[2].Value);

            // Zero checksum — GX does not validate it cryptographically on import
            patchedXml = Regex.Replace(patchedXml,
                @"(<Object\b[^>]*\bchecksum="")[^""]*("")",
                m => m.Groups[1].Value + new string('0', 32) + m.Groups[2].Value);

            // Write new ZIP with BOM UTF-8 — reuse the same entry name captured during read
            var bomUtf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
            using (var ms = new MemoryStream())
            {
                using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
                {
                    var entry = zip.CreateEntry(entryName, CompressionLevel.Optimal);
                    using (var writer = new StreamWriter(entry.Open(), bomUtf8))
                    {
                        writer.NewLine = "\r\n";
                        writer.Write(patchedXml);
                    }
                }
                File.WriteAllBytes(outputFile, ms.ToArray());
            }

            return new
            {
                ok = true,
                xpzFile,
                outputFile,
                scriptName,
                originalLength,
                newLength = (content ?? "").Length,
                patched = true
            };
        }

        private static string ReadXmlFromZip(string zipPath)
        {
            string dummy;
            return ReadXmlEntry(zipPath, out dummy);
        }

        private static string ReadXmlEntry(string zipPath, out string entryName)
        {
            ZipArchive zip;
            try { zip = ZipFile.OpenRead(zipPath); }
            catch (Exception ex) { throw new InvalidDataException($"XPZ file is not a valid ZIP archive: {ex.Message}", ex); }
            using (zip)
            {
                foreach (var entry in zip.Entries)
                {
                    if (entry.Name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
                    {
                        entryName = entry.FullName;
                        using (var stream = entry.Open())
                        using (var reader = new StreamReader(stream, Encoding.UTF8))
                            return reader.ReadToEnd();
                    }
                }
            }
            throw new Exception("No .xml entry found in " + Path.GetFileName(zipPath));
        }
    }
}
