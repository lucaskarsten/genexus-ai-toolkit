using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Xml;

namespace Gx18Mcp.SdkWorker.Sql
{
    public class KbSqlClient
    {
        private readonly string _connectionString;

        public KbSqlClient(string server, string database)
        {
            _connectionString = $"Data Source={server};Initial Catalog={database};Integrated Security=True;Connection Timeout=30;Min Pool Size=1;Max Pool Size=8;Pooling=true";
        }

        private SqlConnection Open()
        {
            var conn = new SqlConnection(_connectionString);
            conn.Open();
            return conn;
        }

        public bool TestConnection()
        {
            try { using (Open()) return true; } catch { return false; }
        }

        // KB users are stored as entities of EntityTypeId 7 (KBUser). EntityVersionName == Windows identity.
        public int FindUserIdByName(string windowsUser)
        {
            using (var conn = Open())
            using (var cmd = new SqlCommand("SELECT TOP 1 EntityId FROM EntityVersion WHERE EntityTypeId=7 AND EntityVersionName=@n", conn))
            {
                cmd.Parameters.AddWithValue("@n", windowsUser ?? "");
                var val = cmd.ExecuteScalar();
                return val == null || val == DBNull.Value ? 0 : Convert.ToInt32(val);
            }
        }

        public long ScalarLong(string sql)
        {
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                var val = cmd.ExecuteScalar();
                return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
            }
        }

        // EntityType display-name map — derived from the canonical spec (spec/entity-types.json)
        // via EntityTypeRegistry. Single source of truth shared with the TS server.
        internal static readonly Dictionary<int, string> TYPE_NAMES = BuildTypeNames();

        private static Dictionary<int, string> BuildTypeNames()
        {
            var d = new Dictionary<int, string>();
            foreach (var kv in Gx18Mcp.SdkWorker.Domain.EntityTypeRegistry.EntityTypeNames)
                d[kv.Key] = kv.Value;
            return d;
        }

        private string TypeName(int id) => TYPE_NAMES.ContainsKey(id) ? TYPE_NAMES[id] : id.ToString();

        public List<object> Find(string pattern, int type, int limit)
        {
            var sql = type > 0
                ? $"SELECT TOP {limit} e.EntityTypeId, e.EntityId, ev.EntityVersionName, CONVERT(varchar,ev.EntityVersionTimestamp,120) as ts FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId WHERE e.EntityTypeId={type} AND ev.EntityVersionName LIKE @pat AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId) ORDER BY ev.EntityVersionName"
                : $"SELECT TOP {limit} e.EntityTypeId, e.EntityId, ev.EntityVersionName, CONVERT(varchar,ev.EntityVersionTimestamp,120) as ts FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId WHERE ev.EntityVersionName LIKE @pat AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId) ORDER BY ev.EntityVersionName";

            var results = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@pat", pattern != null && pattern.Contains("%") ? pattern : $"%{pattern}%");
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        results.Add(new { entityTypeId = r.GetInt32(0), typeName = TypeName(r.GetInt32(0)), entityId = r.GetInt32(1), name = r.GetString(2), lastModified = r.GetString(3) });
            }
            return results;
        }

        public List<object> List(int type, string module, int limit, int offset)
        {
            var moduleFilter = string.IsNullOrEmpty(module) ? "" : " AND e.ModuleName=@mod";
            var sql = $"SELECT e.EntityTypeId, e.EntityId, ev.EntityVersionName, CONVERT(varchar,ev.EntityVersionTimestamp,120) as ts FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId WHERE e.EntityTypeId=@type AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId){moduleFilter} ORDER BY ev.EntityVersionName OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY";
            var results = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@off", offset);
                cmd.Parameters.AddWithValue("@lim", limit);
                if (!string.IsNullOrEmpty(module)) cmd.Parameters.AddWithValue("@mod", module);
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        results.Add(new { entityTypeId = r.GetInt32(0), typeName = TypeName(r.GetInt32(0)), entityId = r.GetInt32(1), name = r.GetString(2), lastModified = r.GetString(3) });
            }
            return results;
        }

        public object Get(string name, int type)
        {
            int entityId = -1;
            string entityName = null;
            string lastModified = null;
            int entityVersionId = -1;

            using (var conn = Open())
            using (var cmd = new SqlCommand("SELECT e.EntityId, ev.EntityVersionName, CONVERT(varchar,ev.EntityVersionTimestamp,120), ev.EntityVersionId FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId WHERE e.EntityTypeId=@type AND ev.EntityVersionName=@name AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId)", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@name", name);
                using (var r = cmd.ExecuteReader())
                {
                    if (!r.Read()) throw new Exception($"Object not found: {name} (type {type})");
                    entityId = r.GetInt32(0);
                    entityName = r.GetString(1);
                    lastModified = r.GetString(2);
                    entityVersionId = r.GetInt32(3);
                }
            }

            var components = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand("SELECT evc.ComponentEntityTypeId, evc.ComponentEntityId, evc.ComponentEntityVersionId FROM EntityVersionComposition evc WHERE evc.CompoundEntityTypeId=@type AND evc.CompoundEntityId=@id AND evc.CompoundEntityVersionId=@vid", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@id", entityId);
                cmd.Parameters.AddWithValue("@vid", entityVersionId);
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        components.Add(new { entityTypeId = r.GetInt32(0), typeName = TypeName(r.GetInt32(0)), entityId = r.GetInt32(1), entityVersionId = r.GetInt32(2) });
            }

            return new { entityTypeId = type, typeName = TypeName(type), entityId, name = entityName, lastModified, components };
        }

        public object ReadSource(int entityTypeId, int entityId)
        {
            byte[] data = ReadBlob(entityTypeId, entityId);
            if (data == null || data.Length <= 11) return new { xml = "", text = "" };
            var xml = Decompress(data);
            var text = TokensToText(xml);
            return new { xml, text };
        }

        private byte[] ReadBlob(int entityTypeId, int entityId)
        {
            var sql = $"SELECT EntityVersionData FROM EntityVersion WHERE EntityTypeId={entityTypeId} AND EntityId={entityId} AND EntityVersionId=(SELECT MAX(EntityVersionId) FROM EntityVersion WHERE EntityTypeId={entityTypeId} AND EntityId={entityId})";
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            using (var r = cmd.ExecuteReader(CommandBehavior.SequentialAccess))
            {
                if (!r.Read()) return null;
                if (r.IsDBNull(0)) return null;
                long size = r.GetBytes(0, 0, null, 0, 0);
                var buffer = new byte[size];
                r.GetBytes(0, 0, buffer, 0, (int)size);
                return buffer;
            }
        }

        private string Decompress(byte[] data)
        {
            // Skip 11-byte GeneXus header
            using (var ms = new MemoryStream(data, 11, data.Length - 11))
            using (var gz = new GZipStream(ms, CompressionMode.Decompress))
            using (var reader = new StreamReader(gz, Encoding.UTF8))
                return reader.ReadToEnd();
        }

        private string TokensToText(string xml)
        {
            if (string.IsNullOrEmpty(xml)) return "";
            var sb = new StringBuilder();
            try
            {
                var doc = new XmlDocument();
                doc.LoadXml(xml);
                var tokens = doc.SelectNodes("//TokenData");
                if (tokens != null)
                    foreach (XmlNode token in tokens)
                    {
                        var word = token.SelectSingleNode("Word")?.InnerText;
                        if (word != null) sb.Append(word);
                    }
            }
            catch { return xml; } // fallback: return raw xml
            return sb.ToString();
        }

        public object ReadProperties(string name, int type)
        {
            using (var conn = Open())
            using (var cmd = new SqlCommand("SELECT TOP 1 ev.EntityVersionProperties FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId WHERE e.EntityTypeId=@type AND ev.EntityVersionName=@name AND ev.EntityVersionId=(SELECT MAX(v.EntityVersionId) FROM EntityVersion v WHERE v.EntityTypeId=e.EntityTypeId AND v.EntityId=e.EntityId)", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@name", name);
                var val = cmd.ExecuteScalar();
                if (val == null || val == DBNull.Value) return new Dictionary<string, string>();
                var text = val.ToString();
                var result = new Dictionary<string, string>();
                try
                {
                    var doc = new XmlDocument();
                    doc.LoadXml(text);
                    foreach (XmlNode node in doc.DocumentElement.ChildNodes)
                        if (node.Attributes?["Name"] != null && node.Attributes?["Value"] != null)
                            result[node.Attributes["Name"].Value] = node.Attributes["Value"].Value;
                }
                catch { result["raw"] = text; }
                return result;
            }
        }

        public object ReadStructure(string name)
        {
            int entityId = -1;
            using (var conn = Open())
            using (var cmd = new SqlCommand("SELECT TOP 1 e.EntityId FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId WHERE e.EntityTypeId=39 AND ev.EntityVersionName=@name", conn))
            {
                cmd.Parameters.AddWithValue("@name", name);
                var val = cmd.ExecuteScalar();
                if (val == null) throw new Exception($"Transaction not found: {name}");
                entityId = Convert.ToInt32(val);
            }

            var attrs = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand("SELECT ev.EntityVersionName, ev.EntityVersionDescription FROM EntityVersion ev WHERE ev.EntityTypeId=24 AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=24 AND v2.EntityId=ev.EntityId) AND EXISTS(SELECT 1 FROM EntityVersionComposition evc WHERE evc.ComponentEntityTypeId=24 AND evc.ComponentEntityId=ev.EntityId AND evc.CompoundEntityTypeId=39 AND evc.CompoundEntityId=@entityId)", conn))
            {
                cmd.Parameters.AddWithValue("@entityId", entityId);
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        attrs.Add(new { name = r.GetString(0), description = r.IsDBNull(1) ? "" : r.GetString(1) });
            }
            return new { name, attributes = attrs };
        }

        public object Query(string query, bool readOnly)
        {
            if (!readOnly)
            {
                var upper = query.TrimStart().ToUpperInvariant();
                if (upper.StartsWith("DROP") || upper.StartsWith("TRUNCATE") || upper.StartsWith("ALTER"))
                    throw new Exception("Blocked: DROP/TRUNCATE/ALTER not allowed via gx_sql");
            }
            var rows = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(query, conn))
            {
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var row = new Dictionary<string, object>();
                        for (int i = 0; i < r.FieldCount; i++)
                            row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
                        rows.Add(row);
                    }
                }
            }
            return new { rows, count = rows.Count };
        }

        // Search object sources for a text/regex pattern.
        // Reads and decompresses part blobs in memory — limited by `limit` to avoid timeouts.
        public object Search(string pattern, int type, string section, int limit)
        {
            if (string.IsNullOrEmpty(pattern)) throw new Exception("pattern is required");

            // Part EntityTypeIds for code sections (confirmed from EntityVersionComposition):
            //   67 = Procedure source (EntityTypeId 34 compounds)
            //   69 = Rules (procedures + web components)
            //   64 = Events (web components / web panels)
            var partTypes = new List<int>();
            var sectionLower = (section ?? "").ToLowerInvariant();
            if (sectionLower == "events") partTypes.Add(64);
            else if (sectionLower == "rules") partTypes.Add(69);
            else if (sectionLower == "source") { partTypes.Add(67); partTypes.Add(69); }
            else { partTypes.Add(67); partTypes.Add(69); partTypes.Add(64); }  // all code sections

            // Get parent objects (parts belong to compound objects via EntityVersionComposition)
            var partTypeIn = string.Join(",", partTypes);
            var typeFilter = type > 0 ? $" AND c.CompoundEntityTypeId={type}" : "";
            var sql = $@"SELECT TOP {limit * 5}
                    c.CompoundEntityTypeId, c.CompoundEntityId,
                    p.EntityTypeId AS PartTypeId, p.EntityId AS PartEntityId,
                    pn.EntityVersionName AS PartName, pn.EntityVersionTimestamp
                FROM EntityVersionComposition c
                JOIN EntityVersion p ON p.EntityTypeId=c.ComponentEntityTypeId AND p.EntityId=c.ComponentEntityId
                    AND p.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=p.EntityTypeId AND v2.EntityId=p.EntityId)
                JOIN EntityVersion pn ON pn.EntityTypeId=c.CompoundEntityTypeId AND pn.EntityId=c.CompoundEntityId
                    AND pn.EntityVersionId=c.CompoundEntityVersionId
                WHERE c.ComponentEntityTypeId IN ({partTypeIn}){typeFilter}
                    AND c.CompoundEntityVersionId=(SELECT MAX(v3.EntityVersionId) FROM EntityVersion v3 WHERE v3.EntityTypeId=c.CompoundEntityTypeId AND v3.EntityId=c.CompoundEntityId)";

            var candidates = new List<(int compoundType, int compoundId, int partTypeId, int partEntityId, string parentName)>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            using (var r = cmd.ExecuteReader())
                while (r.Read())
                    candidates.Add((r.GetInt32(0), r.GetInt32(1), r.GetInt32(2), r.GetInt32(3), r.IsDBNull(4) ? "" : r.GetString(4)));

            var matches = new List<object>();
            var seen = new HashSet<string>();
            foreach (var c in candidates)
            {
                if (matches.Count >= limit) break;
                var key = $"{c.compoundType}:{c.compoundId}";
                if (seen.Contains(key)) continue;

                var blob = ReadBlob(c.partTypeId, c.partEntityId);
                if (blob == null || blob.Length <= 11) continue;
                string text;
                try { text = TokensToText(Decompress(blob)); } catch { continue; }
                if (string.IsNullOrEmpty(text)) continue;

                // Case-insensitive substring match (simple, reliable)
                if (text.IndexOf(pattern, StringComparison.OrdinalIgnoreCase) < 0) continue;

                seen.Add(key);
                // Find matching lines
                var lines = text.Split('\n');
                var matchLines = new List<object>();
                for (int i = 0; i < lines.Length && matchLines.Count < 5; i++)
                    if (lines[i].IndexOf(pattern, StringComparison.OrdinalIgnoreCase) >= 0)
                        matchLines.Add(new { line = i + 1, text = lines[i].TrimEnd() });

                matches.Add(new
                {
                    name = c.parentName,
                    entityTypeId = c.compoundType,
                    typeName = TypeName(c.compoundType),
                    entityId = c.compoundId,
                    section = c.partTypeId == 64 ? "events" : c.partTypeId == 69 ? "rules" : "source",
                    matchCount = matchLines.Count,
                    matchLines
                });
            }
            return new { pattern, matches, total = matches.Count };
        }

        // Impact/dependency analysis. action: "usedby" | "uses" | "dependencies"
        public object Analyze(string name, int type, string action, int limit)
        {
            if (string.IsNullOrEmpty(name)) throw new Exception("name is required");

            // Resolve the object's EntityId
            int entityId = -1;
            using (var conn = Open())
            using (var cmd = new SqlCommand(
                "SELECT TOP 1 e.EntityId FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId WHERE e.EntityTypeId=@type AND ev.EntityVersionName=@name", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@name", name);
                var val = cmd.ExecuteScalar();
                if (val == null) throw new Exception($"Object not found: {name} (type {type})");
                entityId = Convert.ToInt32(val);
            }

            var actionLower = (action ?? "usedby").ToLowerInvariant();

            if (actionLower == "usedby")
            {
                // Objects that contain the name in their source — text search across all types
                var searchResult = Search(name, 0, null, limit) as dynamic;
                return new { name, entityTypeId = type, entityId, action, results = searchResult.matches };
            }
            else if (actionLower == "uses" || actionLower == "dependencies")
            {
                // Read this object's source and look for known object names
                // Find all source parts of this object
                var compSql = $@"SELECT c.ComponentEntityTypeId, c.ComponentEntityId
                    FROM EntityVersionComposition c
                    JOIN EntityVersion ev ON ev.EntityTypeId=c.CompoundEntityTypeId AND ev.EntityId=c.CompoundEntityId AND ev.EntityVersionId=c.CompoundEntityVersionId
                    WHERE c.CompoundEntityTypeId=@type AND c.CompoundEntityId=@entityId AND c.ComponentEntityTypeId IN (67,69,64)
                      AND c.CompoundEntityVersionId=(SELECT MAX(v.EntityVersionId) FROM EntityVersion v WHERE v.EntityTypeId=@type AND v.EntityId=@entityId)";
                var ownSource = new StringBuilder();
                using (var conn2 = Open())
                using (var cmd2 = new SqlCommand(compSql, conn2))
                {
                    cmd2.Parameters.AddWithValue("@type", type);
                    cmd2.Parameters.AddWithValue("@entityId", entityId);
                    using (var r2 = cmd2.ExecuteReader())
                        while (r2.Read())
                        {
                            var blob = ReadBlob(r2.GetInt32(0), r2.GetInt32(1));
                            if (blob != null && blob.Length > 11)
                                try { ownSource.AppendLine(TokensToText(Decompress(blob))); } catch { }
                        }
                }
                var src = ownSource.ToString();
                // Find object names referenced in the source (simple: look for known KB names)
                var referencedNames = new List<object>();
                var allNamesResult = Query($"SELECT TOP 200 ev.EntityVersionName, e.EntityTypeId FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId WHERE e.EntityTypeId IN (34,36,39,43,147,161) AND ev.EntityVersionId=(SELECT MAX(v.EntityVersionId) FROM EntityVersion v WHERE v.EntityTypeId=e.EntityTypeId AND v.EntityId=e.EntityId) ORDER BY ev.EntityVersionName", true) as dynamic;
                var rows = allNamesResult.rows as List<object>;
                foreach (var row in rows ?? new List<object>())
                {
                    var d = row as Dictionary<string, object>;
                    if (d == null) continue;
                    var refName = Convert.ToString(d["EntityVersionName"]);
                    if (string.Equals(refName, name, StringComparison.OrdinalIgnoreCase)) continue;
                    if (src.IndexOf(refName, StringComparison.OrdinalIgnoreCase) >= 0)
                        referencedNames.Add(new { name = refName, entityTypeId = Convert.ToInt32(d["EntityTypeId"]), typeName = TypeName(Convert.ToInt32(d["EntityTypeId"])) });
                }
                return new { name, entityTypeId = type, entityId, action, results = referencedNames };
            }
            return new { name, entityTypeId = type, entityId, action, results = new List<object>(), note = $"Unknown action: {action}. Use usedby, uses, or dependencies." };
        }

        // Revision history of an object (all EntityVersion entries, not just the latest).
        public object GetHistory(string name, int type, int limit)
        {
            if (string.IsNullOrEmpty(name)) throw new Exception("name is required");

            int entityId = -1;
            using (var conn = Open())
            using (var cmd = new SqlCommand(
                "SELECT TOP 1 EntityId FROM EntityVersion WHERE EntityTypeId=@type AND EntityVersionName=@name AND EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=@type AND v2.EntityVersionName=@name)", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@name", name);
                var val = cmd.ExecuteScalar();
                if (val == null) throw new Exception($"Object not found: {name} (type {type})");
                entityId = Convert.ToInt32(val);
            }

            var versions = new List<object>();
            var histSql = $@"SELECT TOP {limit}
                ev.EntityVersionId,
                ev.UserId,
                ISNULL(u.EntityVersionName, CAST(ev.UserId AS varchar)) AS userName,
                CONVERT(varchar, ev.EntityVersionTimestamp, 120) AS ts,
                ISNULL(ev.EntityVersionDescription, '') AS description
            FROM EntityVersion ev
            LEFT JOIN EntityVersion u ON u.EntityTypeId=7 AND u.EntityId=ev.UserId
                AND u.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=7 AND v2.EntityId=ev.UserId)
            WHERE ev.EntityTypeId=@type AND ev.EntityId=@entityId
            ORDER BY ev.EntityVersionId DESC";

            using (var conn = Open())
            using (var cmd = new SqlCommand(histSql, conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@entityId", entityId);
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        versions.Add(new
                        {
                            versionId = r.GetInt32(0),
                            userId = r.GetInt32(1),
                            userName = r.GetString(2),
                            timestamp = r.GetString(3),
                            description = r.GetString(4)
                        });
            }
            return new { name, entityTypeId = type, typeName = TypeName(type), entityId, versions, count = versions.Count };
        }

        // Move an object to a different module by updating ModelEntityVersion.
        public object MoveToModule(string name, int type, string targetModule)
        {
            if (string.IsNullOrEmpty(name)) throw new Exception("name is required");
            if (string.IsNullOrEmpty(targetModule)) throw new Exception("targetModule is required");

            // Resolve object
            int entityId = -1;
            int entityVersionId = -1;
            using (var conn = Open())
            using (var cmd = new SqlCommand(
                "SELECT EntityId, EntityVersionId FROM EntityVersion WHERE EntityTypeId=@type AND EntityVersionName=@name AND EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=@type AND v2.EntityVersionName=@name)", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@name", name);
                using (var r = cmd.ExecuteReader())
                {
                    if (!r.Read()) throw new Exception($"Object not found: {name} (type {type})");
                    entityId = r.GetInt32(0);
                    entityVersionId = r.GetInt32(1);
                }
            }

            // Get the ModelId from the current ModelEntityVersion row
            int modelId = -1;
            string fromModule = null;
            using (var conn = Open())
            using (var cmd = new SqlCommand(
                "SELECT TOP 1 mev.ModelId, mev.ModelParentEntityId FROM ModelEntityVersion mev WHERE mev.EntityTypeId=@type AND mev.EntityId=@entityId AND mev.EntityVersionId=@evid", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@entityId", entityId);
                cmd.Parameters.AddWithValue("@evid", entityVersionId);
                using (var r = cmd.ExecuteReader())
                {
                    if (!r.Read()) throw new Exception($"No ModelEntityVersion row for {name}. Object may not be in a model.");
                    modelId = r.GetInt32(0);
                    int fromId = r.GetInt32(1);
                    // Resolve from-module name
                    using (var conn2 = Open())
                    using (var cmd2 = new SqlCommand($"SELECT TOP 1 ev.EntityVersionName FROM EntityVersion ev WHERE ev.EntityTypeId=100 AND ev.EntityId=@mid AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=100 AND v2.EntityId=@mid)", conn2))
                    {
                        cmd2.Parameters.AddWithValue("@mid", fromId);
                        var fn = cmd2.ExecuteScalar();
                        fromModule = fn == null || fn == DBNull.Value ? fromId.ToString() : fn.ToString();
                    }
                }
            }

            // Resolve target module EntityId
            int targetModuleId = -1;
            using (var conn = Open())
            using (var cmd = new SqlCommand(
                "SELECT TOP 1 ev.EntityId FROM EntityVersion ev WHERE ev.EntityTypeId=100 AND ev.EntityVersionName=@mod AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=100 AND v2.EntityId=ev.EntityId)", conn))
            {
                cmd.Parameters.AddWithValue("@mod", targetModule);
                var val = cmd.ExecuteScalar();
                if (val == null) throw new Exception($"Module not found: '{targetModule}'. List modules with: SELECT ev.EntityVersionName FROM EntityVersion ev WHERE ev.EntityTypeId=100 ORDER BY ev.EntityVersionName");
                targetModuleId = Convert.ToInt32(val);
            }

            // Execute the move
            int updated;
            using (var conn = Open())
            using (var cmd = new SqlCommand(
                "UPDATE ModelEntityVersion SET ModelParentEntityId=@targetId WHERE ModelId=@modelId AND EntityTypeId=@type AND EntityId=@entityId AND EntityVersionId=@evid", conn))
            {
                cmd.Parameters.AddWithValue("@targetId", targetModuleId);
                cmd.Parameters.AddWithValue("@modelId", modelId);
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@entityId", entityId);
                cmd.Parameters.AddWithValue("@evid", entityVersionId);
                updated = cmd.ExecuteNonQuery();
            }

            return new { op = "move", name, entityTypeId = type, entityId, fromModule, toModule = targetModule, rowsUpdated = updated };
        }

        public object Export(string name, int type, string outputDir)
        {
            var ext = type == 34 ? "prc" : type == 39 ? "trn" : type == 36 ? "sdt" : "view";
            var category = type == 34 ? "PRC" : type == 39 ? "TRN" : type == 36 ? "SDT" : type == 43 ? "WBP" : type == 147 ? "UC" : "OTHER";
            var dir = Path.Combine(outputDir, category);
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, $"{name}.{ext}");
            File.WriteAllText(path, $"// Exported: {name}\n// Type: {TypeName(type)}\n", Encoding.UTF8);
            return new { path };
        }

        // --- Stats ---
        public object Stats(string module)
        {
            var byTypeSql = @"
                SELECT et.EntityTypeName, ev.EntityTypeId, COUNT(*) as Total
                FROM EntityVersion ev
                JOIN EntityType et ON et.EntityTypeId = ev.EntityTypeId
                WHERE ev.EntityTypeId IN (34,36,39,43,86,88,147,161)
                GROUP BY et.EntityTypeName, ev.EntityTypeId
                ORDER BY Total DESC";
            var byTypeResult = Query(byTypeSql, true);

            var recentSql = @"
                SELECT TOP 10 ev.EntityVersionName, et.EntityTypeName, CONVERT(varchar,ev.EntityVersionTimestamp,120) as ts
                FROM EntityVersion ev
                JOIN EntityType et ON et.EntityTypeId = ev.EntityTypeId
                WHERE ev.EntityTypeId IN (34,36,39,43,86,88,147,161)
                ORDER BY ev.EntityVersionTimestamp DESC";
            var recentResult = Query(recentSql, true);

            long total = ScalarLong("SELECT COUNT(*) FROM EntityVersion WHERE EntityTypeId IN (34,36,39,43,86,88,147,161)");

            return new { byType = GetResultRows(byTypeResult), recentlyModified = GetResultRows(recentResult), totalObjects = total };
        }

        private List<object> GetResultRows(object result)
        {
            var p = result.GetType().GetProperty("rows");
            return p?.GetValue(result) as List<object> ?? new List<object>();
        }

        // --- Modules ---
        public object Modules()
        {
            var sql = @"
                SELECT ev.EntityId as Id, ev.EntityVersionName as Name,
                       mev.ModelParentEntityId as ParentId
                FROM EntityVersion ev
                JOIN ModelEntityVersion mev
                    ON mev.EntityTypeId = ev.EntityTypeId AND mev.EntityId = ev.EntityId
                    AND mev.EntityVersionId = ev.EntityVersionId
                WHERE ev.EntityTypeId = 100
                ORDER BY ev.EntityVersionName";
            var result = Query(sql, true);
            var rows = GetResultRows(result);
            return new { modules = rows, total = rows.Count };
        }

        // --- Diff ---
        public object Diff(string name, int entityTypeId, string section, int versionA, int versionB)
        {
            if (string.IsNullOrEmpty(name)) throw new Exception("name is required");
            if (entityTypeId <= 0) throw new Exception("entityTypeId is required");

            if (versionA <= 0 || versionB <= 0)
            {
                var safeName = name.Replace("'", "''");
                var versionsSql = $@"
                    SELECT TOP 2 ev.EntityVersionId, CONVERT(varchar,ev.EntityVersionTimestamp,120) as ts
                    FROM EntityVersion ev
                    WHERE ev.EntityTypeId = {entityTypeId}
                      AND ev.EntityVersionName = '{safeName}'
                    ORDER BY ev.EntityVersionId DESC";
                var vRes = Query(versionsSql, true);
                var vRows = GetResultRows(vRes);
                if (vRows.Count < 2)
                    throw new Exception($"Object '{name}' has fewer than 2 versions — diff requires at least 2.");
                var v0 = vRows[0] as Dictionary<string, object>;
                var v1 = vRows[1] as Dictionary<string, object>;
                versionA = v0 != null && v0.ContainsKey("EntityVersionId") ? Convert.ToInt32(v0["EntityVersionId"]) : 0;
                versionB = v1 != null && v1.ContainsKey("EntityVersionId") ? Convert.ToInt32(v1["EntityVersionId"]) : 0;
            }

            var textA = ReadVersionText(entityTypeId, name, versionA);
            var textB = ReadVersionText(entityTypeId, name, versionB);
            var diff = GenerateUnifiedDiff(textA, textB, $"v{versionA}", $"v{versionB}");
            var diffLines = diff.Split('\n');
            int added = 0, removed = 0;
            foreach (var l in diffLines)
            {
                if (l.StartsWith("+") && !l.StartsWith("+++")) added++;
                else if (l.StartsWith("-") && !l.StartsWith("---")) removed++;
            }

            return new { name, entityTypeId, section = section ?? "source", versionA, versionB, diff, linesAdded = added, linesRemoved = removed };
        }

        private string ReadVersionText(int entityTypeId, string name, int versionId)
        {
            var safeName = name.Replace("'", "''");
            var sql = $@"SELECT EntityVersionData FROM EntityVersion
                         WHERE EntityTypeId = {entityTypeId}
                           AND EntityVersionName = '{safeName}'
                           AND EntityVersionId = {versionId}";
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            using (var r = cmd.ExecuteReader(CommandBehavior.SequentialAccess))
            {
                if (!r.Read() || r.IsDBNull(0)) return "";
                long size = r.GetBytes(0, 0, null, 0, 0);
                var buffer = new byte[size];
                r.GetBytes(0, 0, buffer, 0, (int)size);
                if (buffer.Length <= 11) return "";
                return Decompress(buffer);
            }
        }

        private static string GenerateUnifiedDiff(string textA, string textB, string labelA, string labelB)
        {
            var linesA = textA.Split('\n');
            var linesB = textB.Split('\n');
            var sb = new StringBuilder();
            sb.AppendLine($"--- {labelA}");
            sb.AppendLine($"+++ {labelB}");
            int i = 0, j = 0;
            while (i < linesA.Length || j < linesB.Length)
            {
                if (i < linesA.Length && j < linesB.Length && linesA[i] == linesB[j])
                {
                    sb.AppendLine(" " + linesA[i]); i++; j++;
                }
                else
                {
                    while (i < linesA.Length && (j >= linesB.Length || linesA[i] != linesB[j]))
                    { sb.AppendLine("-" + linesA[i]); i++; }
                    while (j < linesB.Length && (i >= linesA.Length || linesA[i] != linesB[j]))
                    { sb.AppendLine("+" + linesB[j]); j++; }
                }
            }
            return sb.ToString();
        }

        // --- DeadCode ---
        public object DeadCode(int entityTypeId, string module, int limit)
        {
            if (entityTypeId <= 0) entityTypeId = 34;
            if (limit <= 0) limit = 50;

            var moduleFilter = string.IsNullOrEmpty(module) ? "" :
                $@"AND ev.EntityId IN (
                       SELECT mev.EntityId FROM ModelEntityVersion mev
                       JOIN EntityVersion mn ON mn.EntityTypeId=100 AND mn.EntityId=mev.ModelParentEntityId
                       AND mn.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=100 AND v2.EntityId=mn.EntityId)
                       WHERE mev.EntityTypeId={entityTypeId} AND mn.EntityVersionName='{module.Replace("'", "''")}'
                   )";

            // Collect candidate objects, then check if any other object's source references them by name
            var candidatesSql = $@"
                SELECT TOP {limit} ev.EntityId, ev.EntityVersionName as Name
                FROM EntityVersion ev
                WHERE ev.EntityTypeId = {entityTypeId}
                  AND ev.EntityVersionId = (SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId={entityTypeId} AND v2.EntityId=ev.EntityId)
                {moduleFilter}
                ORDER BY ev.EntityVersionName";

            var candidates = new List<(int EntityId, string Name)>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(candidatesSql, conn))
            using (var r = cmd.ExecuteReader())
                while (r.Read())
                    candidates.Add((r.GetInt32(0), r.IsDBNull(1) ? "" : r.GetString(1)));

            var unreferenced = new List<object>();
            foreach (var c in candidates)
            {
                if (string.IsNullOrEmpty(c.Name)) continue;
                var searchResult = Search(c.Name, 0, null, 5);
                var matches = searchResult.GetType().GetProperty("matches")?.GetValue(searchResult) as List<object> ?? new List<object>();
                // Filter out self-references
                bool referenced = false;
                foreach (var m in matches)
                {
                    var d = m as Dictionary<string, object>;
                    if (d == null) continue;
                    var mName = d.ContainsKey("name") ? Convert.ToString(d["name"]) : "";
                    var mEntityId = d.ContainsKey("entityId") ? Convert.ToInt32(d["entityId"]) : 0;
                    if (mEntityId != c.EntityId || !string.Equals(mName, c.Name, StringComparison.OrdinalIgnoreCase))
                    { referenced = true; break; }
                }
                if (!referenced) unreferenced.Add(new { name = c.Name, entityId = c.EntityId, entityTypeId });
            }

            return new { entityTypeId, module, candidates = unreferenced, total = unreferenced.Count };
        }

        // --- Impact ---
        public object Impact(string name, int entityTypeId, int depth)
        {
            if (string.IsNullOrEmpty(name)) throw new Exception("name is required");
            if (depth <= 0) depth = 2;
            if (depth > 5) depth = 5;
            if (entityTypeId <= 0) entityTypeId = 34;

            var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var all = new List<object>();

            void Traverse(string objName, int level, string path)
            {
                if (level > depth || visited.Contains(objName)) return;
                visited.Add(objName);
                object result;
                try { result = Analyze(objName, entityTypeId, "usedby", 50); }
                catch { return; }
                var resultRows = result.GetType().GetProperty("results")?.GetValue(result) as List<object>;
                if (resultRows == null) return;
                foreach (var row in resultRows)
                {
                    var d = row as Dictionary<string, object>;
                    if (d == null) continue;
                    var depName = d.ContainsKey("name") ? Convert.ToString(d["name"]) : "";
                    if (string.IsNullOrEmpty(depName) || visited.Contains(depName)) continue;
                    var newPath = path + " -> " + depName;
                    all.Add(new { name = depName, level, path = newPath });
                    Traverse(depName, level + 1, newPath);
                }
            }

            Traverse(name, 1, name);
            return new { root = name, entityTypeId, depth, impacted = all, total = all.Count };
        }

        // --- AttributeList ---
        public object AttributeList(string pattern, int limit)
        {
            if (limit <= 0) limit = 100;
            var patternFilter = string.IsNullOrEmpty(pattern) ? "" :
                $"AND ev.EntityVersionName LIKE '{pattern.Replace("'", "''")}'";

            var sql = $@"
                SELECT TOP {limit}
                       ev.EntityVersionName as Name,
                       ev.EntityVersionProperties as PropertiesXml
                FROM EntityVersion ev
                WHERE ev.EntityTypeId = 24
                {patternFilter}
                ORDER BY ev.EntityVersionName";

            var attrs = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            using (var reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    var attrName = reader.IsDBNull(0) ? "" : reader.GetString(0);
                    var propsXml = reader.IsDBNull(1) ? "" : reader.GetString(1);
                    var props = ParseAttributeProperties(propsXml);
                    string propVal(string k) => props.ContainsKey(k) ? props[k] : null;
                    attrs.Add(new { name = attrName, type = propVal("Type"), length = propVal("Length"), decimals = propVal("Decimals"), domain = propVal("Domain"), description = propVal("Description") });
                }
            }
            return new { attributes = attrs, total = attrs.Count };
        }

        private Dictionary<string, string> ParseAttributeProperties(string xml)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrEmpty(xml)) return result;
            try
            {
                var doc = new XmlDocument();
                doc.LoadXml(xml);
                if (doc.DocumentElement == null) return result;
                foreach (XmlNode node in doc.DocumentElement.ChildNodes)
                    if (node is XmlElement el) result[el.Name] = el.InnerText;
            }
            catch { }
            return result;
        }

        // --- Compare ---
        public object Compare(string name, int entityTypeId, string targetDb, string section)
        {
            if (string.IsNullOrEmpty(name)) throw new Exception("name is required");
            if (entityTypeId <= 0) throw new Exception("entityTypeId is required");
            if (string.IsNullOrEmpty(targetDb)) throw new Exception("targetDb is required");

            var builder = new SqlConnectionStringBuilder(_connectionString);
            var sourceDb = builder.InitialCatalog;
            var targetConnStr = new SqlConnectionStringBuilder
            {
                DataSource = builder.DataSource,
                InitialCatalog = targetDb,
                IntegratedSecurity = true,
                ConnectTimeout = 30  // SqlConnectionStringBuilder uses ConnectTimeout
            }.ConnectionString;

            byte[] ReadBlobFromConn(string connStr)
            {
                var safeName = name.Replace("'", "''");
                var sql = $@"SELECT TOP 1 ev.EntityVersionData FROM EntityVersion ev
                             WHERE ev.EntityTypeId={entityTypeId} AND ev.EntityVersionName='{safeName}'
                             ORDER BY ev.EntityVersionId DESC";
                using (var conn = new SqlConnection(connStr))
                {
                    conn.Open();
                    using (var cmd = new SqlCommand(sql, conn))
                    using (var r = cmd.ExecuteReader(CommandBehavior.SequentialAccess))
                    {
                        if (!r.Read() || r.IsDBNull(0)) return null;
                        long size = r.GetBytes(0, 0, null, 0, 0);
                        var buf = new byte[size];
                        r.GetBytes(0, 0, buf, 0, (int)size);
                        return buf;
                    }
                }
            }

            string DecompressBlob(byte[] raw)
            {
                if (raw == null || raw.Length <= 11) return "";
                return Decompress(raw);
            }

            var textA = DecompressBlob(ReadBlobFromConn(_connectionString));
            var textB = DecompressBlob(ReadBlobFromConn(targetConnStr));
            bool identical = textA == textB;
            var diff = identical ? "" : GenerateUnifiedDiff(textA, textB, sourceDb, targetDb);
            var diffLines = diff.Split('\n');
            int added = 0, removed = 0;
            foreach (var l in diffLines)
            {
                if (l.StartsWith("+") && !l.StartsWith("+++")) added++;
                else if (l.StartsWith("-") && !l.StartsWith("---")) removed++;
            }

            return new { name, entityTypeId, section = section ?? "source", sourceKb = sourceDb, targetKb = targetDb, identical, diff, linesAdded = added, linesRemoved = removed };
        }

        // --- Lint ---
        public object Lint(int entityTypeId, string module, string severity)
        {
            if (entityTypeId <= 0) entityTypeId = 147;

            var rules = new[]
            {
                new { Key = "jquery-reflow", Pattern = @":\s*(hidden|visible)", Severity = "warn", Desc = "jQuery :hidden/:visible forces layout reflow — use offsetWidth or CSS class instead" },
                new { Key = "getall-no-filter", Pattern = @"\.GetAll\s*\(\s*\w+Model\s*\)", Severity = "warn", Desc = "GetAll() without filter scans all objects — use FindByName() or a filtered query" },
                new { Key = "hardcoded-userid", Pattern = @"UserId\s*=\s*\d+", Severity = "error", Desc = "Hard-coded UserId will break with different KB users" },
                new { Key = "aftershow-no-guard", Pattern = @"gx\.onload|grid\.onafterrender", Severity = "warn", Desc = "Observer registered per-instance without a window.__ guard causes O(N^2) re-scans" },
            };

            var moduleFilter = string.IsNullOrEmpty(module) ? "" :
                $@"AND ev.EntityId IN (
                       SELECT mev.EntityId FROM ModelEntityVersion mev
                       JOIN EntityVersion mn ON mn.EntityTypeId=100 AND mn.EntityId=mev.ModelParentEntityId
                       AND mn.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=100 AND v2.EntityId=mn.EntityId)
                       WHERE mev.EntityTypeId={entityTypeId} AND mn.EntityVersionName='{(module ?? "").Replace("'", "''")}'
                   )";

            var objSql = $@"
                SELECT ev.EntityVersionName, ev.EntityId
                FROM EntityVersion ev
                WHERE ev.EntityTypeId = {entityTypeId}
                  AND ev.EntityVersionId = (SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId={entityTypeId} AND v2.EntityId=ev.EntityId)
                {moduleFilter}
                ORDER BY ev.EntityVersionName";

            var objects = new List<(string Name, int Id)>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(objSql, conn))
            using (var r = cmd.ExecuteReader())
                while (r.Read()) objects.Add((r.IsDBNull(0) ? "" : r.GetString(0), r.GetInt32(1)));

            var findings = new List<object>();
            foreach (var (objName, objId) in objects)
            {
                var sourceObj = ReadSource(entityTypeId, objId);
                var sourceText = sourceObj?.GetType().GetProperty("text")?.GetValue(sourceObj) as string ?? "";
                if (string.IsNullOrEmpty(sourceText)) continue;

                var lines = sourceText.Split('\n');
                foreach (var rule in rules)
                {
                    if (!string.IsNullOrEmpty(severity) && rule.Severity != severity.ToLower()) continue;
                    var rx = new System.Text.RegularExpressions.Regex(rule.Pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    for (int li = 0; li < lines.Length; li++)
                    {
                        if (rx.IsMatch(lines[li]))
                            findings.Add(new { name = objName, entityTypeId, rule = rule.Key, severity = rule.Severity, line = li + 1, snippet = lines[li].Trim(), description = rule.Desc });
                    }
                }
            }

            return new { entityTypeId, module, findings, total = findings.Count };
        }
    }
}
