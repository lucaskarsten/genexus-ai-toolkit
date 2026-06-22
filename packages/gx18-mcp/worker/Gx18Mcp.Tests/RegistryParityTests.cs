using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using Gx18Mcp.SdkWorker.Domain;
using Gx18Mcp.SdkWorker.Sdk;
using Gx18Mcp.SdkWorker.Sql;
using Xunit;

namespace Gx18Mcp.Tests
{
    // Characterization: locks the current C# registry maps to spec/entity-types.json.
    // Once green, Step 2 refactors ObjectFactory/KbSqlClient to DERIVE from the spec;
    // these tests guarantee the spec-driven registry stays identical to today's behavior.
    public class RegistryParityTests
    {
        private static readonly Lazy<Dictionary<string, object>> _spec = new Lazy<Dictionary<string, object>>(LoadSpec);

        private static Dictionary<string, object> LoadSpec()
        {
            var path = FindSpecFile();
            var json = File.ReadAllText(path);
            var ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            return ser.Deserialize<Dictionary<string, object>>(json);
        }

        private static string FindSpecFile()
        {
            var dir = AppContext.BaseDirectory;
            for (var d = new DirectoryInfo(dir); d != null; d = d.Parent)
            {
                var candidate = Path.Combine(d.FullName, "spec", "entity-types.json");
                if (File.Exists(candidate)) return candidate;
            }
            throw new FileNotFoundException("spec/entity-types.json not found walking up from " + dir);
        }

        // JavaScriptSerializer maps JSON arrays to ArrayList and JSON objects to Dictionary<string, object>.
        private static List<Dictionary<string, object>> AsDictList(object jsonArray)
            => ((IEnumerable)jsonArray).Cast<Dictionary<string, object>>().ToList();

        private static List<Dictionary<string, object>> ObjectTypes()
            => AsDictList(_spec.Value["objectTypes"]);

        [Fact]
        public void ObjectFactory_TYPES_count_matches_spec()
        {
            Assert.Equal(ObjectTypes().Count, ObjectFactory.TYPES.Count);
        }

        [Fact]
        public void ObjectFactory_TYPES_match_spec_objectTypes()
        {
            foreach (var ot in ObjectTypes())
            {
                var key = (string)ot["key"];
                Assert.True(ObjectFactory.TYPES.ContainsKey(key), $"TYPES missing key '{key}'");
                var ts = ObjectFactory.TYPES[key];

                Assert.Equal(Convert.ToInt32(ot["entityTypeId"]), ts.EntityTypeId);
                Assert.Equal((string)ot["sdkType"], ts.TypeName);
                Assert.Equal((string)ot["sdkAssembly"], ts.Assembly);
                Assert.Equal((bool)ot["structured"], ts.IsStructured);

                var specSections = AsDictList(ot["sections"]);
                Assert.Equal(specSections.Count, ts.Sections.Count);
                foreach (var s in specSections)
                {
                    var sk = (string)s["key"];
                    Assert.True(ts.Sections.ContainsKey(sk), $"type '{key}' missing section '{sk}'");
                    var sec = ts.Sections[sk];
                    Assert.Equal((string)s["part"], sec.PartProp);
                    Assert.Equal((string)s["kind"], sec.Kind.ToString().ToLowerInvariant());
                }
            }
        }

        [Fact]
        public void KbSqlClient_TYPE_NAMES_match_spec_entityTypeNames()
        {
            var names = (Dictionary<string, object>)_spec.Value["entityTypeNames"];
            Assert.Equal(names.Count, KbSqlClient.TYPE_NAMES.Count);
            foreach (var kv in names)
            {
                var id = int.Parse(kv.Key);
                Assert.True(KbSqlClient.TYPE_NAMES.ContainsKey(id), $"TYPE_NAMES missing id {id}");
                Assert.Equal((string)kv.Value, KbSqlClient.TYPE_NAMES[id]);
            }
        }

        // Literal anchors: re-tie the registry to known-correct SDK values, so a wrong spec
        // edit can't pass (the parity tests above only check spec-derived == spec).
        [Fact]
        public void Registry_encodes_known_sdk_literals()
        {
            Assert.Equal(34, ObjectFactory.TYPES["procedure"].EntityTypeId);
            Assert.Equal("Artech.Genexus.Common.Objects.Procedure", ObjectFactory.TYPES["procedure"].TypeName);
            Assert.Equal("ProcedurePart", ObjectFactory.TYPES["procedure"].Sections["source"].PartProp);
            Assert.Equal(ObjectFactory.PartKind.Source, ObjectFactory.TYPES["procedure"].Sections["source"].Kind);

            Assert.Equal(43, ObjectFactory.TYPES["webpanel"].EntityTypeId);
            Assert.Equal("WebForm", ObjectFactory.TYPES["webpanel"].Sections["layout"].PartProp);
            Assert.Equal(ObjectFactory.PartKind.Editable, ObjectFactory.TYPES["webpanel"].Sections["layout"].Kind);

            Assert.True(ObjectFactory.TYPES["transaction"].IsStructured);
            Assert.Equal("Procedure", KbSqlClient.TYPE_NAMES[34]);
            Assert.Equal("WebPanel", KbSqlClient.TYPE_NAMES[43]);
        }

        // Exercises the embedded-resource load path in EntityTypeRegistry.ReadResource().
        // The disk-based parity tests never touch it; if the EmbeddedResource Link breaks,
        // every write/read tool fails at runtime but only THIS test catches it.
        [Fact]
        public void Registry_loads_from_embedded_resource()
        {
            Assert.NotEmpty(EntityTypeRegistry.ObjectTypes);
            Assert.NotEmpty(EntityTypeRegistry.EntityTypeNames);
            Assert.Contains(EntityTypeRegistry.ObjectTypes, o => o.Key == "procedure" && o.EntityTypeId == 34);
        }
    }
}
