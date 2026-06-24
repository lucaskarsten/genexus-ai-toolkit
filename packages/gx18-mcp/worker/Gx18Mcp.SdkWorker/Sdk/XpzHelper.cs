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
        public static object ReadXpz(string xpzFile, string scriptName)
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
            using (var zip = ZipFile.OpenRead(zipPath))
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
