using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Web.Script.Serialization;

namespace Gx18Mcp.SdkWorker.Domain
{
    public class SectionDef
    {
        public string Key;
        public string Part;
        public string Kind;
    }

    public class ObjectTypeDef
    {
        public string Key;
        public int EntityTypeId;
        public string DisplayName;
        public string SdkAssembly;
        public string SdkType;
        public bool WriteSupported;
        public bool Structured;
        public bool IsComponent;
        public List<SectionDef> Sections;
    }

    // Loads the canonical entity-types.json (embedded resource) — the single source of truth
    // shared with the TypeScript MCP server. ObjectFactory and KbSqlClient derive their registry
    // maps from this, eliminating cross-language drift. Parsed once, lazily.
    public static class EntityTypeRegistry
    {
        private static readonly Lazy<Loaded> _data = new Lazy<Loaded>(Load);

        public static IReadOnlyList<ObjectTypeDef> ObjectTypes => _data.Value.ObjectTypes;
        public static IReadOnlyDictionary<int, string> EntityTypeNames => _data.Value.EntityTypeNames;

        private class Loaded
        {
            public List<ObjectTypeDef> ObjectTypes;
            public Dictionary<int, string> EntityTypeNames;
        }

        private static Loaded Load()
        {
            var ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            var root = ser.Deserialize<Dictionary<string, object>>(ReadResource());

            // JavaScriptSerializer maps JSON arrays to ArrayList and JSON objects to Dictionary<string, object>.
            var types = new List<ObjectTypeDef>();
            foreach (Dictionary<string, object> ot in (IEnumerable)root["objectTypes"])
            {
                var def = new ObjectTypeDef
                {
                    Key = (string)ot["key"],
                    EntityTypeId = Convert.ToInt32(ot["entityTypeId"]),
                    DisplayName = (string)ot["displayName"],
                    SdkAssembly = (string)ot["sdkAssembly"],
                    SdkType = (string)ot["sdkType"],
                    WriteSupported = Convert.ToBoolean(ot["writeSupported"]),
                    Structured = Convert.ToBoolean(ot["structured"]),
                    IsComponent = Convert.ToBoolean(ot["isComponent"]),
                    Sections = new List<SectionDef>()
                };
                foreach (Dictionary<string, object> s in (IEnumerable)ot["sections"])
                    def.Sections.Add(new SectionDef { Key = (string)s["key"], Part = (string)s["part"], Kind = (string)s["kind"] });
                types.Add(def);
            }

            var names = new Dictionary<int, string>();
            foreach (var kv in (Dictionary<string, object>)root["entityTypeNames"])
                names[int.Parse(kv.Key)] = (string)kv.Value;

            return new Loaded { ObjectTypes = types, EntityTypeNames = names };
        }

        private static string ReadResource()
        {
            var asm = Assembly.GetExecutingAssembly();
            var resName = asm.GetManifestResourceNames()
                .FirstOrDefault(n => n.EndsWith("entity-types.json", StringComparison.OrdinalIgnoreCase));
            if (resName == null)
                throw new InvalidOperationException("Embedded resource entity-types.json not found in " + asm.FullName);
            var stream = asm.GetManifestResourceStream(resName);
            if (stream == null)
                throw new InvalidOperationException("Embedded resource stream was null for " + resName);
            using (stream)
            using (var reader = new StreamReader(stream))
                return reader.ReadToEnd();
        }
    }
}
