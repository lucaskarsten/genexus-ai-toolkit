using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Web.Script.Serialization;
using Gx18Mcp.SdkWorker.Identity;
using Gx18Mcp.SdkWorker.Sql;

namespace Gx18Mcp.SdkWorker.Sdk
{
    public class ObjectFactory
    {
        private readonly KbSession _session;
        private readonly IdentityResolver _identity;
        private readonly KbSqlClient _sql;

        public ObjectFactory(KbSession session, IdentityResolver identity, KbSqlClient sql)
        {
            _session = session;
            _identity = identity;
            _sql = sql;
        }

        internal enum PartKind { Source, Editable, Structure }

        internal class Section
        {
            public string PartProp;
            public PartKind Kind;
            public Section(string prop, PartKind kind) { PartProp = prop; Kind = kind; }
        }

        internal class TypeSpec
        {
            public string Assembly;
            public string TypeName;
            public int EntityTypeId;
            // section key (as sent from TS) -> part mapping
            public Dictionary<string, Section> Sections;
            // structure-only types create a default empty level on Create; flag for messaging
            public bool IsStructured;
        }

        // Registry now derives from the canonical spec (spec/entity-types.json) via EntityTypeRegistry,
        // the single source of truth shared with the TS server. Locked to legacy behavior by RegistryParityTests.
        internal static readonly Dictionary<string, TypeSpec> TYPES = BuildTypes();

        private static Dictionary<string, TypeSpec> BuildTypes()
        {
            var dict = new Dictionary<string, TypeSpec>(StringComparer.OrdinalIgnoreCase);
            foreach (var ot in Domain.EntityTypeRegistry.ObjectTypes)
            {
                var sections = new Dictionary<string, Section>(StringComparer.OrdinalIgnoreCase);
                foreach (var s in ot.Sections)
                    sections[s.Key] = new Section(s.Part, ParseKind(s.Kind));
                dict[ot.Key] = new TypeSpec
                {
                    Assembly = ot.SdkAssembly,
                    TypeName = ot.SdkType,
                    EntityTypeId = ot.EntityTypeId,
                    IsStructured = ot.Structured,
                    Sections = sections
                };
            }
            return dict;
        }

        private static PartKind ParseKind(string kind)
        {
            switch ((kind ?? "").ToLowerInvariant())
            {
                case "source": return PartKind.Source;
                case "editable": return PartKind.Editable;
                case "structure": return PartKind.Structure;
                default: throw new Exception($"Unknown section kind: '{kind}'");
            }
        }

        public static IEnumerable<string> SupportedTypes => TYPES.Keys;

        private TypeSpec Spec(string typeKey)
        {
            if (!TYPES.TryGetValue(typeKey, out var spec))
                throw new Exception($"Unsupported object type: '{typeKey}'. Supported: {string.Join(", ", TYPES.Keys)}");
            return spec;
        }

        private Type Resolve(TypeSpec spec)
        {
            var t = Assembly.Load(spec.Assembly).GetType(spec.TypeName);
            if (t == null) throw new Exception($"Type not found: {spec.TypeName}");
            return t;
        }

        public object CreateByKey(string typeKey, string name, string module, IDictionary<string, object> sections)
        {
            if (string.IsNullOrEmpty(name)) throw new Exception("name is required");
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var createMethod = concrete.GetMethod("Create", BindingFlags.Public | BindingFlags.Static, null, new[] { model.GetType() }, null)
                ?? FindStaticCreate(concrete, model.GetType());
            if (createMethod == null) throw new Exception($"{concrete.Name}.Create(KBModel) not found");

            var obj = createMethod.Invoke(null, new[] { model });
            SetProp(obj, "Name", name);
            AssignModule(obj, model, module);

            if (typeKey.Equals("webcomponent", StringComparison.OrdinalIgnoreCase))
                SetComponentFlag(obj);

            ApplySections(obj, spec, sections);
            if (spec.IsStructured)
            {
                var verr = CollectValidationErrors(obj);
                if (!string.IsNullOrEmpty(verr)) throw new Exception("Validation: " + verr);
            }
            InvokeSave(obj);

            int newId = Convert.ToInt32(GetProp(obj, "Id"));
            return VerifyUserId(spec.EntityTypeId, newId, name, "create");
        }

        public object ModifyByKey(string name, string typeKey, string section, string content)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name}");

            var sections = new Dictionary<string, object> { { section, content } };
            ApplySections(obj, spec, sections);
            InvokeSave(obj);

            int id = Convert.ToInt32(GetProp(obj, "Id"));
            return VerifyUserId(spec.EntityTypeId, id, name, "modify");
        }

        // ---- section application ----

        private void ApplySections(object obj, TypeSpec spec, IDictionary<string, object> sections)
        {
            if (sections == null) return;
            foreach (var kv in sections)
            {
                if (kv.Value == null) continue;
                var content = kv.Value.ToString();
                if (string.IsNullOrEmpty(content)) continue;
                if (!spec.Sections.TryGetValue(kv.Key, out var sec))
                    throw new Exception($"Section '{kv.Key}' not supported for this type. Valid: {string.Join(", ", spec.Sections.Keys)}");

                var part = GetProp(obj, sec.PartProp);
                if (part == null) throw new Exception($"Part '{sec.PartProp}' is null");

                switch (sec.Kind)
                {
                    case PartKind.Source:
                        SetProp(part, "Source", content);
                        break;
                    case PartKind.Editable:
                        // WebFormPart.EditableContent (text) — falls back to nothing if absent
                        SetProp(part, "EditableContent", content);
                        break;
                    case PartKind.Structure:
                        BuildStructure(obj, part, sec.PartProp, kv.Value);
                        break;
                }
            }
        }

        // ---- structured parts (transaction attributes / sdt members) ----

        private static readonly JavaScriptSerializer _json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        private List<Dictionary<string, object>> ParseItems(object value)
        {
            // value may be a JSON string or an already-parsed object[] (from the worker's deserializer).
            IEnumerable<object> raw;
            if (value is string s)
            {
                var parsed = _json.DeserializeObject(s);
                raw = parsed as object[] ?? throw new Exception("structure must be a JSON array");
            }
            else if (value is object[] arr) raw = arr;
            else if (value is System.Collections.IEnumerable en && !(value is string)) raw = en.Cast<object>();
            else throw new Exception("structure must be a JSON array of items");

            var list = new List<Dictionary<string, object>>();
            foreach (var o in raw)
            {
                if (o is Dictionary<string, object> d) list.Add(d);
                else throw new Exception("each structure item must be an object");
            }
            return list;
        }

        private object ToEDBType(Type concreteAsm, string typeStr)
        {
            var eType = Assembly.Load("Artech.Genexus.Common").GetType("Artech.Genexus.Common.eDBType");
            if (eType == null) throw new Exception("eDBType not found");
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                {"char","CHARACTER"}, {"character","CHARACTER"}, {"varchar","VARCHAR"}, {"longvarchar","LONGVARCHAR"},
                {"text","LONGVARCHAR"}, {"numeric","NUMERIC"}, {"number","NUMERIC"}, {"decimal","NUMERIC"},
                {"int","INT"}, {"integer","INT"}, {"date","DATE"}, {"datetime","DATETIME"}, {"bool","Boolean"},
                {"boolean","Boolean"}, {"guid","GUID"}, {"blob","BINARYFILE"}, {"image","BITMAP"}
            };
            var name = map.TryGetValue(typeStr ?? "", out var mapped) ? mapped : typeStr;
            try { return Enum.Parse(eType, name, true); }
            catch { throw new Exception($"Unknown attribute type '{typeStr}'. Use Character/VarChar/Numeric/Int/Date/DateTime/Boolean/GUID/LongVarChar."); }
        }

        private void BuildStructure(object obj, object part, string partProp, object value)
        {
            var items = ParseItems(value);
            if (partProp == "SDTStructure") BuildSdt(part, items);
            else if (partProp == "Structure") BuildTransaction(obj, part, items);
            else throw new Exception($"Structured write for part '{partProp}' is not implemented (only SDT and Transaction).");
        }

        private void BuildSdt(object part, List<Dictionary<string, object>> items)
        {
            var root = GetProp(part, "Root"); // SDTLevel
            if (root == null) throw new Exception("SDTStructure.Root is null");
            var rootType = root.GetType();
            // SDTItem AddItem(string itemName, eDBType type, int length, int decimals)
            var addItem4 = rootType.GetMethod("AddItem", new[] { typeof(string), Assembly.Load("Artech.Genexus.Common").GetType("Artech.Genexus.Common.eDBType"), typeof(int), typeof(int) });
            foreach (var it in items)
            {
                var name = Convert.ToString(it["name"]);
                var type = ToEDBType(null, it.ContainsKey("type") ? Convert.ToString(it["type"]) : "Character");
                int length = it.ContainsKey("length") && it["length"] != null ? Convert.ToInt32(it["length"]) : 0;
                int dec = it.ContainsKey("decimals") && it["decimals"] != null ? Convert.ToInt32(it["decimals"]) : 0;
                addItem4.Invoke(root, new object[] { name, type, length, dec });
            }
        }

        private void BuildTransaction(object trn, object part, List<Dictionary<string, object>> items)
        {
            var root = GetProp(part, "Root"); // TransactionLevel
            if (root == null) throw new Exception("Structure.Root is null");
            var kb = _session.KnowledgeBase;
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);
            var attrType = Assembly.Load("Artech.Genexus.Common").GetType("Artech.Genexus.Common.Objects.Attribute");
            var createAttr = attrType.GetMethod("Create", BindingFlags.Public | BindingFlags.Static, null, new[] { model.GetType() }, null);
            var addAttr = root.GetType().GetMethod("AddAttribute", new[] { attrType });

            // WinFormPart.ValidateData keys a dictionary by Attribute.Id during save; brand-new
            // attributes all share Id=0 and collide ("duplicate key"). New attributes can't be saved
            // standalone (they belong to the transaction). So we pre-assign each a unique Id from the
            // attribute Id sequence; GeneXus keeps/reconciles them on transaction save.
            var entityBase = Assembly.Load("Artech.Udm.Framework").GetType("Artech.Udm.Framework.Entity");
            var getLastObjectId = _session.KbType.GetMethod("GetLastObjectId", new[] { typeof(Guid) });
            int nextId = 0;

            int idx = 0;
            foreach (var it in items)
            {
                var name = Convert.ToString(it["name"]);
                object attr = ResolveAttribute(attrType, model, name);
                bool isNew = attr == null;
                if (isNew)
                {
                    attr = createAttr.Invoke(null, new[] { model });
                    var guidProp = FindProp(attr.GetType(), "Guid");
                    if (guidProp != null && guidProp.CanWrite && (Guid)guidProp.GetValue(attr) == Guid.Empty)
                        guidProp.SetValue(attr, Guid.NewGuid());
                    if (nextId == 0 && getLastObjectId != null)
                    {
                        var classGuid = (Guid)entityBase.GetProperty("Type").GetValue(attr);
                        nextId = Convert.ToInt32(getLastObjectId.Invoke(kb, new object[] { classGuid }));
                    }
                    var idProp = FindProp(attr.GetType(), "Id");
                    if (idProp != null && idProp.CanWrite) idProp.SetValue(attr, nextId + 1 + idx);
                }
                SetProp(attr, "Name", name);
                SetProp(attr, "Type", ToEDBType(null, it.ContainsKey("type") ? Convert.ToString(it["type"]) : "Character"));
                if (it.ContainsKey("length") && it["length"] != null) SetProp(attr, "Length", Convert.ToInt32(it["length"]));
                if (it.ContainsKey("decimals") && it["decimals"] != null) SetProp(attr, "Decimals", Convert.ToInt32(it["decimals"]));
                var ta = addAttr.Invoke(root, new[] { attr });
                // A transaction requires a primary key. Mark attributes flagged key:true; if none are
                // flagged, the first attribute becomes the key.
                bool isKey = it.ContainsKey("key") && it["key"] != null && Convert.ToBoolean(it["key"]);
                if (ta != null && (isKey || (idx == 0 && !AnyKeyFlag(items))))
                {
                    var keyProp = ta.GetType().GetProperty("IsKey");
                    if (keyProp != null && keyProp.CanWrite) keyProp.SetValue(ta, true);
                }
                idx++;
            }

            // Regenerate the default dependent parts (Web/Win form) from the FINAL structure so their
            // attribute control references match the structure attribute Ids (avoids "invalid control
            // reference" at validation).
            try
            {
                var refresh = trn.GetType().GetMethod("RefreshDefaultDependentParts", Type.EmptyTypes);
                if (refresh != null)
                {
                    var so = Console.Out;
                    try { Console.SetOut(Console.Error); refresh.Invoke(trn, null); }
                    finally { Console.SetOut(so); }
                }
            }
            catch { }
        }

        private static bool AnyKeyFlag(List<Dictionary<string, object>> items)
        {
            foreach (var it in items)
                if (it.ContainsKey("key") && it["key"] != null && Convert.ToBoolean(it["key"])) return true;
            return false;
        }

        private object ResolveAttribute(Type attrType, object model, string name)
        {
            var get = attrType.GetMethod("Get", BindingFlags.Public | BindingFlags.Static, null, new[] { model.GetType(), typeof(string) }, null);
            if (get != null) { try { return get.Invoke(null, new[] { model, name }); } catch { } }
            return null;
        }

        private void SetComponentFlag(object webPanel)
        {
            // WebPanel has a property that marks it as a Web Component (varies: "IsWebComponent" / a property value).
            var p = webPanel.GetType().GetProperty("IsWebComponent");
            if (p != null && p.CanWrite) { p.SetValue(webPanel, true); return; }
            // Fallback: set via SetPropertyValue("ComponentType"/"Type") if present — best effort.
        }

        // ---- helpers ----

        private object ResolveByName(Type concrete, object model, string name)
        {
            var getAll = concrete.GetMethod("GetAll", BindingFlags.Public | BindingFlags.Static, null, new[] { model.GetType() }, null);
            if (getAll != null)
            {
                var all = getAll.Invoke(null, new[] { model }) as System.Collections.IEnumerable;
                if (all != null)
                    foreach (var o in all)
                        if (string.Equals(Convert.ToString(GetProp(o, "Name")), name, StringComparison.OrdinalIgnoreCase))
                            return o;
            }
            return null;
        }

        private MethodInfo FindStaticCreate(Type concrete, Type modelType)
        {
            foreach (var m in concrete.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (m.Name != "Create") continue;
                var ps = m.GetParameters();
                if (ps.Length == 1 && ps[0].ParameterType.IsAssignableFrom(modelType)) return m;
            }
            return null;
        }

        private void AssignModule(object obj, object model, string moduleName)
        {
            var current = GetProp(obj, "Module");
            if (current != null && string.IsNullOrEmpty(moduleName)) return;

            var moduleType = Assembly.Load("Artech.Architecture.Common").GetType("Artech.Architecture.Common.Objects.Module");
            if (moduleType == null) return;
            object target = null;
            var rootMethod = moduleType.GetMethod("GetRoot", BindingFlags.Public | BindingFlags.Static)
                ?? moduleType.GetMethod("Root", BindingFlags.Public | BindingFlags.Static);
            if (rootMethod != null)
            {
                var ps = rootMethod.GetParameters();
                target = ps.Length == 1 ? rootMethod.Invoke(null, new[] { model }) : rootMethod.Invoke(null, null);
            }
            if (target != null && current == null) SetProp(obj, "Module", target);
        }

        private string CollectValidationErrors(object obj)
        {
            try
            {
                var omType = Assembly.Load("Artech.Common").GetType("Artech.Common.Diagnostics.OutputMessages");
                var om = Activator.CreateInstance(omType);
                var validate = obj.GetType().GetMethod("Validate", new[] { omType });
                if (validate == null) return null;
                var savedOut = Console.Out;
                try { Console.SetOut(Console.Error); validate.Invoke(obj, new[] { om }); }
                finally { Console.SetOut(savedOut); }
                var errText = omType.GetProperty("ErrorText")?.GetValue(om) as string;
                return string.IsNullOrWhiteSpace(errText) ? null : errText.Replace("\r", " ").Replace("\n", " | ");
            }
            catch (Exception ex) { return "validate-probe failed: " + ex.Message; }
        }

        private void InvokeSave(object obj)
        {
            var save = obj.GetType().GetMethod("Save", Type.EmptyTypes);
            if (save == null) throw new Exception("Save() not found");
            var savedOut = Console.Out;
            try { Console.SetOut(Console.Error); save.Invoke(obj, null); }
            finally { Console.SetOut(savedOut); }
        }

        private object VerifyUserId(int entityTypeIdHint, int entityId, string name, string op)
        {
            // Query by EntityId + Name (robust regardless of the registry's EntityTypeId hint).
            var safeName = (name ?? "").Replace("'", "''");
            var sql = $"SELECT TOP 3 EntityTypeId, EntityVersionId, UserId FROM EntityVersion WHERE EntityId={entityId} AND EntityVersionName='{safeName}' ORDER BY EntityVersionId DESC";
            var res = _sql.Query(sql, true);
            var rows = GetProp(res, "rows") as List<object>;
            int? userId = null;
            int entityTypeId = entityTypeIdHint;
            if (rows != null && rows.Count > 0)
            {
                var first = rows[0] as Dictionary<string, object>;
                if (first != null)
                {
                    if (first.ContainsKey("UserId") && first["UserId"] != null)
                        userId = Convert.ToInt32(first["UserId"]);
                    if (first.ContainsKey("EntityTypeId") && first["EntityTypeId"] != null)
                        entityTypeId = Convert.ToInt32(first["EntityTypeId"]);
                }
            }
            var info = _session.GetUserInfo();
            var infoId = GetProp(info, "id");
            int expected = infoId == null ? 0 : Convert.ToInt32(infoId);
            return new
            {
                op,
                name,
                entityTypeId,
                entityId,
                userId,
                expectedUserId = expected,
                kbUserName = Convert.ToString(GetProp(info, "name")),
                userIdOk = expected <= 0 || userId == expected,
                recentVersions = rows == null ? 0 : rows.Count
            };
        }

        // Resolve a property even when a derived type shadows a base member (e.g. Attribute.Type
        // (eDBType) shadows Entity.Type (Guid)) — GetProperty(name) throws AmbiguousMatchException there.
        private static PropertyInfo FindProp(Type t, string name)
        {
            for (var cur = t; cur != null; cur = cur.BaseType)
            {
                var p = cur.GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
                if (p != null) return p;
            }
            return null;
        }

        private static object GetProp(object obj, string name)
        {
            var p = FindProp(obj.GetType(), name);
            return p?.GetValue(obj);
        }

        private static void SetProp(object obj, string name, object value)
        {
            var p = FindProp(obj.GetType(), name);
            if (p == null || !p.CanWrite) throw new Exception($"Property '{name}' not settable on {obj.GetType().Name}");
            p.SetValue(obj, value);
        }

        // Export one object (by name+type) to an .xpz file via the Knowledge Manager service.
        // Doubles as a validation: a successful export proves the object is well-formed in the KB.
        public object ExportXpz(string typeKey, string name, string outputFile)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");

            var common = Assembly.Load("Artech.Architecture.Common");
            var servicesType = common.GetType("Artech.Architecture.Common.Services.Services");
            var kmType = common.GetType("Artech.Architecture.Common.Services.IKnowledgeManagerService");
            var kbObjectType = common.GetType("Artech.Architecture.Common.Objects.KBObject");
            var eoType = common.GetType("Artech.Architecture.Common.Services.ExportOptions");

            // static TService Services.GetService<TService>()
            MethodInfo getSvc = null;
            foreach (var m in servicesType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                if (m.Name == "GetService" && m.IsGenericMethodDefinition && m.GetParameters().Length == 0) { getSvc = m; break; }
            if (getSvc == null) throw new Exception("Services.GetService<T>() not found");
            var km = getSvc.MakeGenericMethod(kmType).Invoke(null, null);
            if (km == null) throw new Exception("IKnowledgeManagerService not available");

            // Export(KBModel model, IEnumerable<T> objects, string outputFile, ExportOptions options)
            MethodInfo export = null;
            foreach (var m in kmType.GetMethods())
            {
                if (m.Name != "Export") continue;
                var ps = m.GetParameters();
                if (ps.Length == 4 && ps[2].ParameterType == typeof(string) && ps[1].ParameterType != typeof(string)) { export = m; break; }
            }
            if (export == null) throw new Exception("IKnowledgeManagerService.Export(model,objects,file,options) not found");

            // Build a List<T> using the method's actual element type (KBObject, Entity, or IExportItem).
            var objectsParam = export.GetParameters()[1].ParameterType;
            var elemType = objectsParam.IsGenericType ? objectsParam.GetGenericArguments()[0] : kbObjectType;
            var listType = typeof(List<>).MakeGenericType(elemType);
            var list = Activator.CreateInstance(listType);
            // The Export overload takes IEnumerable<EntityKey>; pass the object's Key (fall back to the object itself).
            object element = elemType.IsInstanceOfType(obj) ? obj : GetProp(obj, "Key");
            if (element == null || !elemType.IsInstanceOfType(element))
                throw new Exception($"Cannot adapt object to export element type {elemType.FullName}");
            listType.GetMethod("Add").Invoke(list, new[] { element });

            var options = Activator.CreateInstance(eoType);
            SetIfExists(eoType, options, "ExportCurrentVersion", true);

            bool ok;
            var savedOut = Console.Out;
            try { Console.SetOut(Console.Error); ok = (bool)export.Invoke(km, new object[] { model, list, outputFile, options }); }
            finally { Console.SetOut(savedOut); }

            long size = System.IO.File.Exists(outputFile) ? new System.IO.FileInfo(outputFile).Length : 0;
            return new { ok, name, type = typeKey, outputFile, fileExists = System.IO.File.Exists(outputFile), bytes = size };
        }

        private static void SetIfExists(Type t, object obj, string prop, object val)
        {
            var p = t.GetProperty(prop);
            if (p != null && p.CanWrite) p.SetValue(obj, val);
        }

        // Import an .xpz (or .kbx) into the open KB via the GX18 Knowledge Manager service.
        // This is the NATIVE GX18 import path (IKnowledgeManagerService.ImportFile) — NOT the
        // gxnext mass-import that caused the revision storm. Because the worker opened the KB as
        // the Windows user, the SDK stamps the real UserId (e.g. 321) on the imported revisions.
        // SPIKE-ONLY for now: returns the recent EntityVersion rows of the named object so the
        // caller can assert UserId + revision count. Validate on a clone before exposing as a tool.
        public object ImportXpz(string xpzFile, string typeKey, string name, bool fullOverwrite)
        {
            if (string.IsNullOrEmpty(xpzFile) || !System.IO.File.Exists(xpzFile))
                throw new Exception($"xpz file not found: {xpzFile}");
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var common = Assembly.Load("Artech.Architecture.Common");
            var servicesType = common.GetType("Artech.Architecture.Common.Services.Services");
            var kmType = common.GetType("Artech.Architecture.Common.Services.IKnowledgeManagerService");
            var ioType = common.GetType("Artech.Architecture.Common.Services.ImportOptions");

            MethodInfo getSvc = null;
            foreach (var m in servicesType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                if (m.Name == "GetService" && m.IsGenericMethodDefinition && m.GetParameters().Length == 0) { getSvc = m; break; }
            if (getSvc == null) throw new Exception("Services.GetService<T>() not found");
            var km = getSvc.MakeGenericMethod(kmType).Invoke(null, null);
            if (km == null) throw new Exception("IKnowledgeManagerService not available");

            // ImportOptions preset: FullOverwrite (overwrite existing) or Default.
            var presetProp = ioType.GetProperty(fullOverwrite ? "FullOverwrite" : "Default",
                BindingFlags.Public | BindingFlags.Static);
            if (presetProp == null) throw new Exception("ImportOptions preset not found");
            var options = presetProp.GetValue(null);
            // Be non-interactive / safe under a headless worker.
            SetIfExists(ioType, options, "ShowPropertiesErrors", false);
            SetIfExists(ioType, options, "RollBackOnError", true);

            // ImportFile(string kbxFile, KBModel model, ImportOptions options) : bool
            MethodInfo importFile = null;
            foreach (var m in kmType.GetMethods())
            {
                if (m.Name != "ImportFile") continue;
                var ps = m.GetParameters();
                if (ps.Length == 3 && ps[0].ParameterType == typeof(string)) { importFile = m; break; }
            }
            if (importFile == null) throw new Exception("IKnowledgeManagerService.ImportFile(string,model,options) not found");

            bool ok;
            var savedOut = Console.Out;
            try { Console.SetOut(Console.Error); ok = (bool)importFile.Invoke(km, new object[] { xpzFile, model, options }); }
            finally { Console.SetOut(savedOut); }

            // Verify the imported object's author by name (avoids the webpanel 43/148 hint mismatch:
            // the object's own versions carry its name; its parts have different names like "Procedure, Rules").
            var safeName = (name ?? "").Replace("'", "''");
            var sql = $"SELECT TOP 5 EntityTypeId, EntityId, EntityVersionId, UserId FROM EntityVersion WHERE EntityVersionName='{safeName}' ORDER BY EntityVersionId DESC";
            var res = _sql.Query(sql, true);
            var rows = GetProp(res, "rows") as List<object>;

            int? userId = null;
            int entityTypeId = 0, entityId = 0;
            if (rows != null && rows.Count > 0 && rows[0] is Dictionary<string, object> first)
            {
                if (first.TryGetValue("UserId", out var u) && u != null) userId = Convert.ToInt32(u);
                if (first.TryGetValue("EntityTypeId", out var et) && et != null) entityTypeId = Convert.ToInt32(et);
                if (first.TryGetValue("EntityId", out var eid) && eid != null) entityId = Convert.ToInt32(eid);
            }
            var info = _session.GetUserInfo();
            var infoId = GetProp(info, "id");
            int expected = infoId == null ? 0 : Convert.ToInt32(infoId);

            // WriteResult-compatible shape (op/name/entityId/userId/expectedUserId/kbUserName/userIdOk)
            // so the TS guard (assertWriteOk) treats import exactly like create/modify, plus import-specific fields.
            return new
            {
                op = "import",
                ok,
                xpzFile,
                fullOverwrite,
                type = typeKey,
                name,
                entityTypeId,
                entityId,
                userId,
                expectedUserId = expected,
                kbUserName = Convert.ToString(GetProp(info, "name")),
                userIdOk = expected <= 0 || userId == expected,
                recentVersions = rows == null ? 0 : rows.Count,
                versions = rows
            };
        }

        // Legacy stubs
        public object SetProperty(string name, int type, string property, string value) => throw new NotImplementedException("SetProperty: pending");
        public object Rename(string name, int type, string newName) => throw new NotImplementedException("Rename: pending");
        public object Validate(string name, int type) => throw new NotImplementedException("Validate: pending");
        public object Build(string name, int type) => throw new NotImplementedException("Build: pending");
    }
}
