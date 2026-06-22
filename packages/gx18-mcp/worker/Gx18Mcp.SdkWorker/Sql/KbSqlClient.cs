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
            _connectionString = $"Data Source={server};Initial Catalog={database};Integrated Security=True;Connection Timeout=30";
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
    }
}
