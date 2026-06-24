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
            if (string.IsNullOrEmpty(name))    throw new Exception("name is required");
            if (string.IsNullOrEmpty(section)) throw new Exception("section is required");
            if (content == null)               throw new Exception("content is required (pass empty string to clear a section)");

            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open — SDK may not have initialized");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);
            if (model == null) throw new Exception("DesignModel is null — KB may not be fully loaded");

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception(
                $"Object '{name}' not found (type '{typeKey}', EntityTypeId {spec.EntityTypeId}). " +
                $"Names are case-insensitive. Run gx_find with pattern '{name}' to confirm the exact name.");

            var sections = new Dictionary<string, object> { { section, content } };
            try
            {
                ApplySections(obj, spec, sections);
                InvokeSave(obj);
            }
            catch (Exception ex)
            {
                var inner = ex is System.Reflection.TargetInvocationException tie && tie.InnerException != null
                    ? tie.InnerException : ex;
                var msg = $"Failed to save '{name}' (type '{typeKey}', section '{section}'): {inner.GetType().Name}: {inner.Message}";
                if (typeKey.Equals("dso", StringComparison.OrdinalIgnoreCase) &&
                    (inner.Message.IndexOf("import", StringComparison.OrdinalIgnoreCase) >= 0 ||
                     inner.Message.IndexOf("valid", StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    msg += "\nHint: DSO @import must use the friendly DSO name (e.g. `@import DsoBase;`), " +
                           "not the GUID form (`@import @<guid>@`). " +
                           "The GUID form is internal — the SDK resolves it on save from the friendly name.";
                }
                throw new Exception(msg, inner);
            }

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
                {
                    var hint = spec.TypeName.IndexOf("UserControl", StringComparison.OrdinalIgnoreCase) >= 0
                        ? " AfterShow/Methods scripts are not writable via gx_modify — use gx_export → patch CDATA → gx_import."
                        : "";
                    throw new Exception(
                        $"Section '{kv.Key}' not supported for type '{spec.TypeName.Split('.').Last()}'. " +
                        $"Valid sections: {string.Join(", ", spec.Sections.Keys)}.{hint}");
                }

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
        // NOTE: Console.Out is swapped to Console.Error during the SDK call to prevent GX log output
        // from corrupting the JSON-RPC stdout stream. This is safe only because the worker is
        // contractually single-threaded (one IPC call processed at a time). Do not introduce
        // concurrency without replacing this with a captured-at-boot stdout handle.
        // Export a single object. For multi-object export use ExportXpzBatch.
        public object ExportXpz(string typeKey, string name, string outputFile)
        {
            var result = ExportXpzBatch(new[] { (typeKey, name) }, outputFile);
            return result;
        }

        // Export one or more objects into a single XPZ archive.
        // items: list of (typeKey, name) pairs; all must be the same typeKey (SDK restriction).
        public object ExportXpzBatch(IEnumerable<(string typeKey, string name)> items, string outputFile)
        {
            var itemList = new List<(string typeKey, string name)>(items);
            if (itemList.Count == 0) throw new Exception("ExportXpzBatch: items list is empty");

            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);
            if (model == null) throw new Exception(
                "DesignModel is null — worker KB session is stale. Kill the worker (Stop-Process Gx18Mcp.SdkWorker -Force) and retry.");

            var common = Assembly.Load("Artech.Architecture.Common");
            var servicesType = common.GetType("Artech.Architecture.Common.Services.Services");
            var kmType = common.GetType("Artech.Architecture.Common.Services.IKnowledgeManagerService");
            var kbObjectType = common.GetType("Artech.Architecture.Common.Objects.KBObject");
            var eoType = common.GetType("Artech.Architecture.Common.Services.ExportOptions");

            MethodInfo getSvc = null;
            foreach (var m in servicesType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                if (m.Name == "GetService" && m.IsGenericMethodDefinition && m.GetParameters().Length == 0) { getSvc = m; break; }
            if (getSvc == null) throw new Exception("Services.GetService<T>() not found");
            var km = getSvc.MakeGenericMethod(kmType).Invoke(null, null);
            if (km == null) throw new Exception("IKnowledgeManagerService not available");

            MethodInfo export = null;
            foreach (var m in kmType.GetMethods())
            {
                if (m.Name != "Export") continue;
                var ps = m.GetParameters();
                if (ps.Length == 4 && ps[2].ParameterType == typeof(string) && ps[1].ParameterType != typeof(string)) { export = m; break; }
            }
            if (export == null) throw new Exception("IKnowledgeManagerService.Export(model,objects,file,options) not found");

            var firstName = itemList.Count > 0 ? itemList[0].name : "";
            var firstType = itemList.Count > 0 ? itemList[0].typeKey : "";
            var firstSpec = itemList.Count > 0 ? Spec(itemList[0].typeKey) : null;

            // GX18 SDK Export for WebPanel/WebComponent (EntityTypeId 43) fails in headless mode:
            // both ResolveByName and IKnowledgeManagerService.Export throw NullReferenceException
            // because theme/layout services are not initialized without the IDE.
            // Skip the entire SDK path and use SQL blob XPZ construction for this type.
            if (firstSpec != null && firstSpec.EntityTypeId == 43)
            {
                Console.Error.WriteLine($"[gx18-worker] Type 43 detected ({firstName}): skipping SDK Export, using SQL XPZ builder.");
                return _sql.SqlExportXpz(firstName, 43, outputFile);
            }

            var objectsParam = export.GetParameters()[1].ParameterType;
            var elemType = objectsParam.IsGenericType ? objectsParam.GetGenericArguments()[0] : kbObjectType;
            var listType = typeof(List<>).MakeGenericType(elemType);
            var list = Activator.CreateInstance(listType);
            var addMethod = listType.GetMethod("Add");

            var exportedNames = new List<string>();
            foreach (var (typeKey, name) in itemList)
            {
                var spec = Spec(typeKey);
                var concrete = Resolve(spec);
                if (concrete == null) throw new Exception($"Cannot resolve SDK type for '{typeKey}'");
                var obj = ResolveByName(concrete, model, name);
                if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");
                object element = elemType.IsInstanceOfType(obj) ? obj : GetProp(obj, "Key");
                if (element == null || !elemType.IsInstanceOfType(element))
                    throw new Exception($"Cannot adapt object '{name}' to export element type {elemType.FullName}");
                addMethod.Invoke(list, new[] { element });
                exportedNames.Add(name);
            }

            var options = Activator.CreateInstance(eoType);
            SetIfExists(eoType, options, "ExportCurrentVersion", true);

            bool ok;
            var savedOut = Console.Out;
            try { Console.SetOut(Console.Error); ok = (bool)export.Invoke(km, new object[] { model, list, outputFile, options }); }
            finally { Console.SetOut(savedOut); }

            long size = System.IO.File.Exists(outputFile) ? new System.IO.FileInfo(outputFile).Length : 0;
            return new { ok, name = firstName, type = firstType, outputFile, fileExists = System.IO.File.Exists(outputFile), bytes = size, exportedNames };
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
        // Returns the recent EntityVersion rows of the named object so the TS-side assertWriteOk
        // guard can verify the stamped UserId and confirm the import is bound to the correct author.
        public object ImportXpz(string xpzFile, string typeKey, string name, bool fullOverwrite)
        {
            if (string.IsNullOrEmpty(xpzFile) || !System.IO.File.Exists(xpzFile))
                throw new Exception($"xpz file not found: {xpzFile}");
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);
            if (model == null) throw new Exception(
                "DesignModel is null — worker KB session is stale. Kill the worker (Stop-Process Gx18Mcp.SdkWorker -Force) and retry.");

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

            // Parse XPZ XML to collect all object names that were included in the archive.
            List<string> xpzObjectNames;
            try { xpzObjectNames = XpzHelper.ListObjectNames(xpzFile); }
            catch { xpzObjectNames = new List<string> { name }; }
            if (!xpzObjectNames.Contains(name, StringComparer.OrdinalIgnoreCase))
                xpzObjectNames.Insert(0, name);

            // Verify the imported object's author by name (avoids the webpanel 43/148 hint mismatch:
            // the object's own versions carry its name; its parts have different names like "Procedure, Rules").
            // Scope the UserId check to the correct EntityTypeId when we know the type.
            // EntityVersionId is not global, so type-scoping is required for a reliable result.
            int filterTypeId = 0;
            try { if (!string.IsNullOrEmpty(typeKey)) filterTypeId = Spec(typeKey).EntityTypeId; } catch { /* unknown typeKey */ }
            var verifyQuery = filterTypeId > 0
                ? "SELECT TOP 5 EntityTypeId, EntityId, EntityVersionId, UserId FROM EntityVersion WHERE EntityVersionName=@name AND EntityTypeId=" + filterTypeId + " ORDER BY EntityVersionId DESC"
                : "SELECT TOP 5 EntityTypeId, EntityId, EntityVersionId, UserId FROM EntityVersion WHERE EntityVersionName=@name ORDER BY EntityVersionId DESC";
            var res = _sql.QueryByName(verifyQuery, name);
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

            // Build importedObjects: look up entityId for each name in the XPZ.
            var importedObjects = new List<object>();
            foreach (var objName in xpzObjectNames)
            {
                int objTypeId = 0, objEntityId = 0;
                try
                {
                    var lookup = string.Equals(objName, name, StringComparison.OrdinalIgnoreCase) && filterTypeId > 0
                        ? _sql.QueryByName(
                            "SELECT TOP 1 EntityTypeId, EntityId FROM EntityVersion WHERE EntityVersionName=@name AND EntityTypeId=" + filterTypeId + " ORDER BY EntityVersionId DESC",
                            objName)
                        : _sql.QueryByName(
                            "SELECT TOP 1 EntityTypeId, EntityId FROM EntityVersion WHERE EntityVersionName=@name ORDER BY EntityVersionId DESC",
                            objName);
                    var lrows = GetProp(lookup, "rows") as List<object>;
                    if (lrows != null && lrows.Count > 0 && lrows[0] is Dictionary<string, object> lr)
                    {
                        if (lr.TryGetValue("EntityTypeId", out var let) && let != null) objTypeId = Convert.ToInt32(let);
                        if (lr.TryGetValue("EntityId", out var leid) && leid != null) objEntityId = Convert.ToInt32(leid);
                    }
                }
                catch { /* non-fatal: return name without IDs if lookup fails */ }
                importedObjects.Add(new { name = objName, entityTypeId = objTypeId, entityId = objEntityId });
            }

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
                versions = rows,
                importedObjects
            };
        }

        // ---- set_property, rename, validate, build ----

        public object SetProperty(string name, string typeKey, string property, string value)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");

            bool set = TrySetProp(obj, property, value);
            if (!set)
            {
                var setMeth = FindMethodByParams(obj.GetType(), "SetPropertyValue", typeof(string), typeof(string))
                    ?? FindMethodByParams(obj.GetType(), "SetPropertyValue", typeof(string), typeof(object));
                if (setMeth != null) { setMeth.Invoke(obj, new object[] { property, value }); set = true; }
            }
            if (!set) throw new Exception(
                $"Property '{property}' not found or not settable on {obj.GetType().Name}. " +
                "For source/events/rules/layout use gx_modify; for Description use 'Description'.");

            InvokeSave(obj);
            int id = Convert.ToInt32(GetProp(obj, "Id"));
            var writeResult = VerifyUserId(spec.EntityTypeId, id, name, "set_property");
            // Augment the WriteResult-compatible shape with property-specific fields
            var wr = writeResult as dynamic;
            return new {
                op = "set_property",
                name,
                property,
                value,
                entityTypeId = spec.EntityTypeId,
                entityId = (int)id,
                userId = (object)wr.userId,
                expectedUserId = (int)wr.expectedUserId,
                kbUserName = (string)wr.kbUserName,
                userIdOk = (bool)wr.userIdOk,
                recentVersions = (int)wr.recentVersions,
            };
        }

        public object Rename(string name, string typeKey, string newName)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");

            SetProp(obj, "Name", newName);
            InvokeSave(obj);

            int id = Convert.ToInt32(GetProp(obj, "Id"));
            return VerifyUserId(spec.EntityTypeId, id, newName, "rename");
        }

        public object Validate(string name, string typeKey)
        {
            // SDK Validate() invokes GeneXus diagnostics that crash headless (no message loop / COM pump).
            // Instead, we confirm the object exists via SQL — callers can tell if the name is wrong.
            var sql = $"SELECT TOP 1 ev.EntityId FROM EntityVersion ev WHERE ev.EntityVersionName = '{name.Replace("'", "''")}' ORDER BY ev.EntityVersionId DESC";
            var res = _sql.Query(sql, true);
            var rows = GetProp(res, "rows") as System.Collections.Generic.List<object>;
            bool exists = rows != null && rows.Count > 0;
            if (!exists) throw new Exception($"Object not found: {name} ({typeKey})");

            return new
            {
                errors = new string[0],
                warnings = new string[0],
                name,
                typeKey,
                note = "Full syntax validation requires the GX18 IDE (Build All). gx_validate only confirms the object exists in the KB."
            };
        }

        public object Build(string name, string typeKey)
        {
            return new
            {
                success = false,
                output = new string[0],
                errors = new[] { "Build must be performed from GX18 IDE (F5 / Build All). Headless compilation is not supported in gx18-mcp." },
                note = "gx_modify writes source to the KB but does not compile. Use IDE Build All to generate code from the changes."
            };
        }

        // ---- delete ----

        public object DeleteObject(string name, string typeKey, bool dryRun)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");

            int id = Convert.ToInt32(GetProp(obj, "Id"));
            if (dryRun)
                return new { op = "delete_dry_run", name, typeKey, entityTypeId = spec.EntityTypeId, entityId = id, deleted = false, note = "dryRun=true — no change made." };

            var deleteMethod = obj.GetType().GetMethod("Delete", Type.EmptyTypes);
            if (deleteMethod != null)
            {
                var savedOut = Console.Out;
                try { Console.SetOut(Console.Error); deleteMethod.Invoke(obj, null); }
                finally { Console.SetOut(savedOut); }
            }
            else
            {
                // Fallback: call Save() after marking as deleted if Delete() doesn't exist
                var deletedProp = FindProp(obj.GetType(), "IsDeleted") ?? FindProp(obj.GetType(), "Deleted");
                if (deletedProp != null && deletedProp.CanWrite) deletedProp.SetValue(obj, true);
                InvokeSave(obj);
            }

            // Verify removal: object should no longer appear in EntityVersion as latest
            var safeName = (name ?? "").Replace("'", "''");
            var sql = $"SELECT COUNT(*) FROM EntityVersion WHERE EntityTypeId={spec.EntityTypeId} AND EntityId={id} AND EntityVersionName='{safeName}'";
            long remaining = _sql.ScalarLong(sql);

            return new { op = "delete", name, typeKey, entityTypeId = spec.EntityTypeId, entityId = id, deleted = true, remainingVersions = remaining };
        }

        // ---- variable CRUD ----

        public object VariableList(string name, string typeKey)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");

            var varsPart = GetProp(obj, "Variables");
            if (varsPart == null) throw new Exception($"Object type '{typeKey}' does not have a Variables part.");

            var varList = GetProp(varsPart, "Variables") ?? GetProp(varsPart, "VariablesList");
            if (varList == null) throw new Exception("Variables collection not found.");

            var results = new List<object>();
            foreach (var v in (System.Collections.IEnumerable)varList)
            {
                var vname = Convert.ToString(GetProp(v, "Name"));
                var isCollection = GetProp(v, "IsCollection");
                results.Add(new { name = vname, isCollection = isCollection != null && (bool)isCollection });
            }
            return new { name, typeKey, variables = results, count = results.Count };
        }

        public object VariableAdd(string name, string typeKey, string varName, string dataType, int length, int decimals, bool isCollection)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");

            var varsPart = GetProp(obj, "Variables");
            if (varsPart == null) throw new Exception($"Object type '{typeKey}' does not have a Variables part.");

            // Add variable via Variables.New() or similar
            var newMethod = varsPart.GetType().GetMethod("New", Type.EmptyTypes)
                ?? varsPart.GetType().GetMethod("AddNew", Type.EmptyTypes)
                ?? varsPart.GetType().GetMethod("Add", Type.EmptyTypes);
            if (newMethod == null) throw new Exception("Cannot add variable: New()/AddNew()/Add() not found on Variables part.");

            var newVar = newMethod.Invoke(varsPart, null);
            if (newVar == null) throw new Exception("Variable creation returned null.");

            SetProp(newVar, "Name", varName);

            if (!string.IsNullOrEmpty(dataType))
            {
                var edbType = ToEDBType(null, dataType);
                TrySetProp(newVar, "Type", edbType);
            }
            if (length > 0) TrySetProp(newVar, "Length", length);
            if (decimals > 0) TrySetProp(newVar, "Decimals", decimals);
            if (isCollection) TrySetProp(newVar, "IsCollection", true);

            InvokeSave(obj);

            int id = Convert.ToInt32(GetProp(obj, "Id"));
            var writeResult = VerifyUserId(spec.EntityTypeId, id, name, "variable_add");
            return new { op = "variable_add", objectName = name, varName, dataType, length, decimals, isCollection, writeResult };
        }

        public object VariableDelete(string name, string typeKey, string varName)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");

            var varsPart = GetProp(obj, "Variables");
            if (varsPart == null) throw new Exception($"Object type '{typeKey}' does not have a Variables part.");

            var varList = GetProp(varsPart, "Variables") ?? GetProp(varsPart, "VariablesList");
            if (varList == null) throw new Exception("Variables collection not found.");

            object target = null;
            foreach (var v in (System.Collections.IEnumerable)varList)
                if (string.Equals(Convert.ToString(GetProp(v, "Name")), varName, StringComparison.OrdinalIgnoreCase)) { target = v; break; }

            if (target == null) return new { op = "variable_delete", objectName = name, varName, deleted = false, note = "Variable not found (idempotent)." };

            var removeMethod = varsPart.GetType().GetMethod("Remove", new[] { target.GetType() })
                ?? varsPart.GetType().GetMethod("Delete", new[] { target.GetType() });
            if (removeMethod != null)
            {
                var savedOut = Console.Out;
                try { Console.SetOut(Console.Error); removeMethod.Invoke(varsPart, new[] { target }); }
                finally { Console.SetOut(savedOut); }
            }
            else
            {
                var delMethod = target.GetType().GetMethod("Delete", Type.EmptyTypes);
                if (delMethod != null) { var so = Console.Out; try { Console.SetOut(Console.Error); delMethod.Invoke(target, null); } finally { Console.SetOut(so); } }
                else throw new Exception("Cannot delete variable: Remove()/Delete() not found.");
            }

            InvokeSave(obj);

            int id = Convert.ToInt32(GetProp(obj, "Id"));
            var writeResult = VerifyUserId(spec.EntityTypeId, id, name, "variable_delete");
            return new { op = "variable_delete", objectName = name, varName, deleted = true, writeResult };
        }

        public object VariableUpdate(string name, string typeKey, string varName, string dataType, int length, int decimals, object isCollection)
        {
            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var obj = ResolveByName(concrete, model, name);
            if (obj == null) throw new Exception($"Object not found: {name} ({typeKey})");

            var varsPart = GetProp(obj, "Variables");
            if (varsPart == null) throw new Exception($"Object type '{typeKey}' does not have a Variables part.");

            var varList = GetProp(varsPart, "Variables") ?? GetProp(varsPart, "VariablesList");
            if (varList == null) throw new Exception("Variables collection not found.");

            object target = null;
            foreach (var v in (System.Collections.IEnumerable)varList)
                if (string.Equals(Convert.ToString(GetProp(v, "Name")), varName, StringComparison.OrdinalIgnoreCase)) { target = v; break; }

            if (target == null) throw new Exception($"Variable '{varName}' not found in '{name}'.");

            if (!string.IsNullOrEmpty(dataType))
            {
                var edbType = ToEDBType(null, dataType);
                TrySetProp(target, "Type", edbType);
            }
            if (length >= 0) TrySetProp(target, "Length", length);
            if (decimals >= 0) TrySetProp(target, "Decimals", decimals);
            if (isCollection != null) TrySetProp(target, "IsCollection", Convert.ToBoolean(isCollection));

            InvokeSave(obj);

            int id = Convert.ToInt32(GetProp(obj, "Id"));
            var writeResult = VerifyUserId(spec.EntityTypeId, id, name, "variable_update");
            return new { op = "variable_update", objectName = name, varName, dataType, length, decimals, writeResult };
        }

        // --- Clone ---
        public object Clone(string typeKey, string sourceName, string targetName, string module)
        {
            if (string.IsNullOrEmpty(sourceName)) throw new Exception("sourceName is required");
            if (string.IsNullOrEmpty(targetName)) throw new Exception("targetName is required");

            var spec = Spec(typeKey);
            var concrete = Resolve(spec);
            var kb = _session.KnowledgeBase;
            if (kb == null) throw new Exception("KB not open");
            var model = _session.KbType.GetProperty("DesignModel").GetValue(kb);

            var source = ResolveByName(concrete, model, sourceName);
            if (source == null) throw new Exception($"Source object not found: {sourceName} ({typeKey})");

            // Extract sections from the source object
            var sections = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var kv in spec.Sections)
            {
                var part = GetProp(source, kv.Value.PartProp);
                if (part == null) continue;
                switch (kv.Value.Kind)
                {
                    case PartKind.Source:
                        var src = GetProp(part, "Source") as string;
                        if (!string.IsNullOrEmpty(src)) sections[kv.Key] = src;
                        break;
                    case PartKind.Editable:
                        var ec = GetProp(part, "EditableContent") as string;
                        if (!string.IsNullOrEmpty(ec)) sections[kv.Key] = ec;
                        break;
                    // Structure (SDT/TRN) cloning not supported — skip
                }
            }

            return CreateByKey(typeKey, targetName, module, sections);
        }

        // ---- helpers (private) ----

        private static bool TrySetProp(object obj, string name, object value)
        {
            var p = FindProp(obj.GetType(), name);
            if (p == null || !p.CanWrite) return false;
            try { p.SetValue(obj, value); return true; } catch { return false; }
        }

        private static MethodInfo FindMethodByParams(Type t, string name, params Type[] paramTypes)
        {
            return t.GetMethod(name, BindingFlags.Public | BindingFlags.Instance, null, paramTypes, null);
        }
    }
}
