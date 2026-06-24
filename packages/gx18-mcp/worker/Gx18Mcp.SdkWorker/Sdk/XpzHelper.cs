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
        public static object ReadXpz(string xpzFile, string scriptName, string partFilter = null)
        {
            if (!File.Exists(xpzFile))
                throw new Exception("xpz file not found: " + xpzFile);

            string xml = ReadXmlFromZip(xpzFile);

            var scriptRx = new Regex(
                @"<Script\b[^>]*\bName=""([^""]+)""[^>]*><!\[CDATA\[([\s\S]*?)\]\]></Script>",
                RegexOptions.Compiled);

            var scripts = new List<object>();
            bool found = false;
            foreach (Match m in scriptRx.Matches(xml))
            {
                string sName = m.Groups[1].Value;
                string sBody = m.Groups[2].Value;

                // Apply partFilter: skip scripts whose name doesn't contain the filter substring.
                if (!string.IsNullOrEmpty(partFilter) &&
                    string.IsNullOrEmpty(scriptName) &&
                    sName.IndexOf(partFilter, StringComparison.OrdinalIgnoreCase) < 0)
                    continue;

                bool isTarget = !string.IsNullOrEmpty(scriptName) &&
                                string.Equals(sName, scriptName, StringComparison.OrdinalIgnoreCase);

                if (isTarget) found = true;

                if (string.IsNullOrEmpty(scriptName))
                {
                    scripts.Add(new { name = sName, length = sBody.Length });
                }
                else if (isTarget)
                {
                    scripts.Add(new { name = sName, length = sBody.Length, content = sBody });
                }
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

                var scriptRx2 = new Regex(
                    @"<Script\b[^>]*\bName=""" + Regex.Escape(patch.Key) + @"""[^>]*><!\[CDATA\[([\s\S]*?)\]\]></Script>",
                    RegexOptions.Compiled);
                var origMatch2 = scriptRx2.Match(xml2);
                if (!origMatch2.Success)
                    throw new Exception($"Script '{patch.Key}' not found in XPZ XML. Use gx_read_xpz to list available scripts.");

                int origLen = origMatch2.Groups[1].Value.Length;
                var replaceRx2 = new Regex(
                    @"(<Script\b[^>]*\bName=""" + Regex.Escape(patch.Key) + @"""[^>]*>)<!\[CDATA\[[\s\S]*?\]\]>(</Script>)",
                    RegexOptions.Compiled);
                xml2 = replaceRx2.Replace(xml2,
                    m => m.Groups[1].Value + "<![CDATA[" + patch.Value + "]]>" + m.Groups[2].Value);
                patchResults.Add(new { scriptName = patch.Key, originalLength = origLen, newLength = (patch.Value ?? "").Length });
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

            // Capture original length
            var origRx = new Regex(
                @"<Script\b[^>]*\bName=""" + Regex.Escape(scriptName) + @"""[^>]*><!\[CDATA\[([\s\S]*?)\]\]></Script>",
                RegexOptions.Compiled);
            var origMatch = origRx.Match(xml);
            if (!origMatch.Success)
                throw new Exception("Script '" + scriptName + "' not found in XPZ XML. Use gx_read_xpz to list available scripts.");
            int originalLength = origMatch.Groups[1].Value.Length;

            // GeneXus does not merge adjacent CDATA sections — ']]>' in script content
            // would corrupt the XPZ XML. Require the caller to refactor the script instead.
            if ((content ?? "").Contains("]]>"))
                throw new Exception(
                    "content contains ']]>' which is the CDATA closing marker and cannot be embedded " +
                    "in an XPZ script body. Refactor the script to avoid the literal ']]>' sequence " +
                    "(e.g. split the string constant across two lines or use a variable).");
            string safeCdata = content ?? "";

            // Replace the CDATA body, preserving the opening/closing Script tags
            var replaceRx = new Regex(
                @"(<Script\b[^>]*\bName=""" + Regex.Escape(scriptName) + @"""[^>]*>)<!\[CDATA\[[\s\S]*?\]\]>(</Script>)",
                RegexOptions.Compiled);
            string patchedXml = replaceRx.Replace(xml,
                m => m.Groups[1].Value + "<![CDATA[" + safeCdata + "]]>" + m.Groups[2].Value);

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
