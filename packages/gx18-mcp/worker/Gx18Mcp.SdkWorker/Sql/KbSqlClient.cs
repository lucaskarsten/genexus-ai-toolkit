using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;

namespace Gx18Mcp.SdkWorker.Sql
{
    public class KbSqlClient
    {
        private readonly string _connectionString;

        private static readonly Dictionary<string, string> _colHints =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["EntityVersionUserId"]   = "UserId",
                ["EntityVersionAuthorId"] = "UserId",
                ["AuthorId"]              = "UserId",
                ["EntityVersionUser"]     = "UserId",
                ["LastUpdate"]            = "EntityVersionTimestamp",
                ["EntityVersionDate"]     = "EntityVersionTimestamp",
                ["CreatedAt"]             = "EntityVersionTimestamp",
                ["UpdatedAt"]             = "EntityVersionTimestamp",
                ["EntityName"]            = "EntityVersionName",
                ["Description"]           = "EntityVersionDescription",
            };

        private static string ColHint(string msg)
        {
            // Invalid column name → suggest known aliases
            var mCol = Regex.Match(msg, @"Invalid column name '([^']+)'");
            if (mCol.Success)
                return _colHints.TryGetValue(mCol.Groups[1].Value, out var suggestion)
                    ? $"Did you mean '{suggestion}'? (EntityVersion columns: EntityTypeId, EntityId, EntityVersionId, EntityVersionName, EntityVersionDescription, UserId, EntityVersionTimestamp, ParentVersionId, EntityVersionComment, EntityVersionProperties, EntityVersionData)"
                    : null;

            // Multi-part identifier not bound → alias scope problem
            var mAlias = Regex.Match(msg, @"The multi-part identifier ""([^""]+)"" could not be bound");
            if (mAlias.Success)
                return $"Alias '{mAlias.Groups[1].Value}' is out of scope — check that every table alias is defined in the same FROM/JOIN clause as the reference. " +
                       "Correlated subqueries that reference an outer alias must declare it as a parameter (e.g. WHERE inner.col = outer_alias.col inside the subquery).";

            // DECOMPRESS built-in on a GeneXus blob — header must be skipped
            if (msg.IndexOf("DECOMPRESS", StringComparison.OrdinalIgnoreCase) >= 0 &&
                (msg.IndexOf("Uncompressed", StringComparison.OrdinalIgnoreCase) >= 0 ||
                 msg.IndexOf("corrupted", StringComparison.OrdinalIgnoreCase) >= 0))
                return "GeneXus blobs have an 11-byte proprietary header before the GZip payload. " +
                       "Skip it with: DECOMPRESS(SUBSTRING(EntityVersionData, 12, DATALENGTH(EntityVersionData) - 11)). " +
                       "Check byte 7 first: CONVERT(int, SUBSTRING(blob, 7, 1)) — 1=GZip (use DECOMPRESS+offset), 2=raw UTF-8 (use SUBSTRING(blob, 8, ...) directly). " +
                       "Note: UC (type 147) root objects have NULL EntityVersionData — content is in parts via EntityVersionComposition (PartType 148=template, 149=scripts).";

            return null;
        }

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

        public object QueryByName(string sql, string name)
        {
            var rows = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@name", name ?? "");
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var row = new Dictionary<string, object>();
                        for (int i = 0; i < r.FieldCount; i++)
                            row[r.GetName(i)] = r.IsDBNull(i) ? (object)null : r.GetValue(i);
                        rows.Add(row);
                    }
                }
            }
            return new { rows, count = rows.Count };
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

        public int Execute(string sql)
        {
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
                return cmd.ExecuteNonQuery();
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

        public List<object> FindMulti(string pattern, int[] types, int limit, string module = null, string exclude = null)
        {
            var typeFilter = types != null && types.Length > 0
                ? $" AND e.EntityTypeId IN ({string.Join(",", types)})"
                : "";
            var modFilter = !string.IsNullOrEmpty(module) ? " AND evmod.EntityVersionName=@mod" : "";
            var exclFilter = !string.IsNullOrEmpty(exclude) ? " AND ev.EntityVersionName NOT LIKE @excl" : "";
            var sql = $"SELECT TOP {limit} e.EntityTypeId, e.EntityId, ev.EntityVersionName, CONVERT(varchar,ev.EntityVersionTimestamp,120) as ts, ISNULL(evmod.EntityVersionName,'') as module FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId LEFT JOIN ModelEntityVersion mev ON mev.EntityTypeId=e.EntityTypeId AND mev.EntityId=e.EntityId AND mev.EntityVersionId=(SELECT MAX(v3.EntityVersionId) FROM EntityVersion v3 WHERE v3.EntityTypeId=e.EntityTypeId AND v3.EntityId=e.EntityId) LEFT JOIN EntityVersion evmod ON evmod.EntityTypeId=100 AND evmod.EntityId=mev.ModelParentEntityId AND evmod.EntityVersionId=(SELECT MAX(v4.EntityVersionId) FROM EntityVersion v4 WHERE v4.EntityTypeId=100 AND v4.EntityId=mev.ModelParentEntityId) WHERE ev.EntityVersionName LIKE @pat{typeFilter}{modFilter}{exclFilter} AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId) ORDER BY ev.EntityVersionName";

            var results = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@pat", pattern != null && pattern.Contains("%") ? pattern : $"%{pattern}%");
                if (!string.IsNullOrEmpty(module)) cmd.Parameters.AddWithValue("@mod", module);
                if (!string.IsNullOrEmpty(exclude)) cmd.Parameters.AddWithValue("@excl", exclude.Contains("%") ? exclude : $"%{exclude}%");
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        results.Add(new { entityTypeId = r.GetInt32(0), typeName = TypeName(r.GetInt32(0)), entityId = r.GetInt32(1), name = r.GetString(2), lastModified = r.GetString(3), module = r.GetString(4) });
            }
            return results;
        }

        public List<object> Find(string pattern, int type, int limit, string module = null, string exclude = null)
        {
            var typeFilter = type > 0 ? $" AND e.EntityTypeId={type}" : "";
            var modFilter = !string.IsNullOrEmpty(module) ? " AND evmod.EntityVersionName=@mod" : "";
            var exclFilter = !string.IsNullOrEmpty(exclude) ? " AND ev.EntityVersionName NOT LIKE @excl" : "";
            var sql = $"SELECT TOP {limit} e.EntityTypeId, e.EntityId, ev.EntityVersionName, CONVERT(varchar,ev.EntityVersionTimestamp,120) as ts, ISNULL(evmod.EntityVersionName,'') as module FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId LEFT JOIN ModelEntityVersion mev ON mev.EntityTypeId=e.EntityTypeId AND mev.EntityId=e.EntityId AND mev.EntityVersionId=(SELECT MAX(v3.EntityVersionId) FROM EntityVersion v3 WHERE v3.EntityTypeId=e.EntityTypeId AND v3.EntityId=e.EntityId) LEFT JOIN EntityVersion evmod ON evmod.EntityTypeId=100 AND evmod.EntityId=mev.ModelParentEntityId AND evmod.EntityVersionId=(SELECT MAX(v4.EntityVersionId) FROM EntityVersion v4 WHERE v4.EntityTypeId=100 AND v4.EntityId=mev.ModelParentEntityId) WHERE ev.EntityVersionName LIKE @pat{typeFilter}{modFilter}{exclFilter} AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId) ORDER BY ev.EntityVersionName";

            var results = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@pat", pattern != null && pattern.Contains("%") ? pattern : $"%{pattern}%");
                if (!string.IsNullOrEmpty(module)) cmd.Parameters.AddWithValue("@mod", module);
                if (!string.IsNullOrEmpty(exclude)) cmd.Parameters.AddWithValue("@excl", exclude.Contains("%") ? exclude : $"%{exclude}%");
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        results.Add(new { entityTypeId = r.GetInt32(0), typeName = TypeName(r.GetInt32(0)), entityId = r.GetInt32(1), name = r.GetString(2), lastModified = r.GetString(3), module = r.GetString(4) });
            }
            return results;
        }

        public List<object> List(int type, string module, int limit, int offset, string exclude = null)
        {
            var moduleFilter = string.IsNullOrEmpty(module) ? "" : " AND evmod.EntityVersionName=@mod";
            var exclFilter = string.IsNullOrEmpty(exclude) ? "" : " AND ev.EntityVersionName NOT LIKE @excl";
            var sql = $"SELECT e.EntityTypeId, e.EntityId, ev.EntityVersionName, CONVERT(varchar,ev.EntityVersionTimestamp,120) as ts, ISNULL(evmod.EntityVersionName,'') as module FROM Entity e JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId LEFT JOIN ModelEntityVersion mev ON mev.EntityTypeId=e.EntityTypeId AND mev.EntityId=e.EntityId AND mev.EntityVersionId=(SELECT MAX(v3.EntityVersionId) FROM EntityVersion v3 WHERE v3.EntityTypeId=e.EntityTypeId AND v3.EntityId=e.EntityId) LEFT JOIN EntityVersion evmod ON evmod.EntityTypeId=100 AND evmod.EntityId=mev.ModelParentEntityId AND evmod.EntityVersionId=(SELECT MAX(v4.EntityVersionId) FROM EntityVersion v4 WHERE v4.EntityTypeId=100 AND v4.EntityId=mev.ModelParentEntityId) WHERE e.EntityTypeId=@type AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId){moduleFilter}{exclFilter} ORDER BY ev.EntityVersionName OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY";
            var results = new List<object>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@off", offset);
                cmd.Parameters.AddWithValue("@lim", limit);
                if (!string.IsNullOrEmpty(module)) cmd.Parameters.AddWithValue("@mod", module);
                if (!string.IsNullOrEmpty(exclude)) cmd.Parameters.AddWithValue("@excl", exclude.Contains("%") ? exclude : $"%{exclude}%");
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        results.Add(new { entityTypeId = r.GetInt32(0), typeName = TypeName(r.GetInt32(0)), entityId = r.GetInt32(1), name = r.GetString(2), lastModified = r.GetString(3), module = r.GetString(4) });
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
            // GeneXus blob header: bytes 0-5 = magic+version, byte 6 = compression flag
            // 0x01 = GZip compressed (11-byte header, data from offset 11)
            // 0x02 = raw UTF-8 text  ( 7-byte header, data from offset 7)
            if (data == null || data.Length < 7)
                throw new Exception($"Blob too short to decompress ({data?.Length ?? 0} bytes — expected ≥7)");
            byte flag = data[6];
            if (flag == 0x02)
                return Encoding.UTF8.GetString(data, 7, data.Length - 7);
            if (flag == 0x01)
            {
                if (data.Length < 11)
                    throw new Exception($"GZip blob too short ({data.Length} bytes — expected ≥11)");
                using (var ms = new MemoryStream(data, 11, data.Length - 11))
                using (var gz = new GZipStream(ms, CompressionMode.Decompress))
                using (var reader = new StreamReader(gz, Encoding.UTF8))
                    return reader.ReadToEnd();
            }
            throw new Exception(
                $"Unknown GeneXus blob compression flag 0x{flag:X2} at byte[6]. " +
                "Known: 0x01=GZip, 0x02=raw-UTF8. Blob may be corrupt or from an unsupported GX version.");
        }

        // Writes a raw-UTF-8 text section blob (Events/Rules/Conditions) for any compound object
        // directly via SQL, bypassing the SDK compiler. Uses GeneXus blob format 0x02 (raw UTF-8,
        // 7-byte header). componentEntityTypeId: 64=Events, 69=Rules, 57=Conditions.
        // Caller must gx_reload after this write to invalidate the SDK in-memory model.
        public string WriteTextPartBlob(int compoundEntityTypeId, int compoundEntityId,
                                        int componentEntityTypeId, string newText)
        {
            int partEntityId = -1, partVersionId = -1;
            const string findSql = @"
                SELECT evc.ComponentEntityId, evc.ComponentEntityVersionId
                FROM EntityVersionComposition evc
                WHERE evc.CompoundEntityTypeId = @ct AND evc.CompoundEntityId = @cid
                  AND evc.ComponentEntityTypeId = @partType
                  AND evc.CompoundEntityVersionId = (
                      SELECT MAX(ev2.EntityVersionId) FROM EntityVersion ev2
                      WHERE ev2.EntityTypeId = @ct AND ev2.EntityId = @cid
                  )";
            using (var conn = Open())
            using (var cmd = new SqlCommand(findSql, conn))
            {
                cmd.Parameters.AddWithValue("@ct", compoundEntityTypeId);
                cmd.Parameters.AddWithValue("@cid", compoundEntityId);
                cmd.Parameters.AddWithValue("@partType", componentEntityTypeId);
                using (var r = cmd.ExecuteReader())
                {
                    if (!r.Read()) throw new Exception(
                        $"Part (type {componentEntityTypeId}) not found in composition for " +
                        $"object type={compoundEntityTypeId} id={compoundEntityId}");
                    partEntityId = r.GetInt32(0);
                    partVersionId = r.GetInt32(1);
                }
            }
            byte[] current = ReadBlob(componentEntityTypeId, partEntityId);
            if (current == null || current.Length < 7)
                throw new Exception(
                    $"Text blob missing or too short (entity {componentEntityTypeId}/{partEntityId})");
            var textBytes = Encoding.UTF8.GetBytes(newText);
            var newBlob = new byte[7 + textBytes.Length];
            Array.Copy(current, 0, newBlob, 0, 6);
            newBlob[6] = 0x02;
            Array.Copy(textBytes, 0, newBlob, 7, textBytes.Length);
            const string updateSql =
                "UPDATE EntityVersion SET EntityVersionData = @blob " +
                "WHERE EntityTypeId=@partType AND EntityId=@id AND EntityVersionId=@vid";
            using (var conn = Open())
            using (var cmd = new SqlCommand(updateSql, conn))
            {
                cmd.Parameters.AddWithValue("@partType", componentEntityTypeId);
                cmd.Parameters.AddWithValue("@id", partEntityId);
                cmd.Parameters.AddWithValue("@vid", partVersionId);
                var p = cmd.Parameters.Add("@blob", SqlDbType.VarBinary, -1);
                p.Value = newBlob;
                int rows = cmd.ExecuteNonQuery();
                if (rows == 0) throw new Exception(
                    $"UPDATE affected 0 rows for part {componentEntityTypeId}/{partEntityId}@{partVersionId}");
            }
            return $"text-part-written:{componentEntityTypeId}/{partEntityId}@{partVersionId} " +
                   $"({newBlob.Length} bytes, raw-utf8)";
        }

        // Convenience wrapper — keeps callers that pass events (component 64) unchanged.
        public string WriteEventsBlob(int compoundEntityTypeId, int compoundEntityId, string newText)
            => WriteTextPartBlob(compoundEntityTypeId, compoundEntityId, 64, newText);

        // NOTE: the SQL-based SqlCloneWbc/PatchWbcProps helpers were removed. They created type-43
        // objects via direct SQL INSERT, but those objects were not SDK-re-openable (NullRef in
        // Entity.EnsureDeserialization) and the approach was a losing game of replicating everything
        // the IDE writes across many tables. Type 43 is now created through the GX18 SDK
        // (ObjectFactory.CreateByKey), which produces complete, valid, SDK-re-editable objects.

        // Sets the Documentation part blob (EntityTypeId 62) to NULL when it exists but is 0/short.
        // A 0-byte Documentation blob causes NullReferenceException in the SDK when loading the object
        // headless (e.g. before a layout save). NULL is handled gracefully; an empty blob is not.
        public void NullOutDocumentationBlob(int compoundEntityTypeId, int compoundEntityId)
        {
            int docEntityId = -1, docVersionId = -1;
            const string findSql = @"
                SELECT evc.ComponentEntityId, evc.ComponentEntityVersionId
                FROM EntityVersionComposition evc
                WHERE evc.CompoundEntityTypeId = @ct AND evc.CompoundEntityId = @cid
                  AND evc.ComponentEntityTypeId = 62
                  AND evc.CompoundEntityVersionId = (
                      SELECT MAX(ev2.EntityVersionId) FROM EntityVersion ev2
                      WHERE ev2.EntityTypeId = @ct AND ev2.EntityId = @cid
                  )";
            using (var conn = Open())
            using (var cmd = new SqlCommand(findSql, conn))
            {
                cmd.Parameters.AddWithValue("@ct", compoundEntityTypeId);
                cmd.Parameters.AddWithValue("@cid", compoundEntityId);
                using (var r = cmd.ExecuteReader())
                {
                    if (!r.Read()) return; // no Documentation part — nothing to fix
                    docEntityId = r.GetInt32(0);
                    docVersionId = r.GetInt32(1);
                }
            }
            byte[] blob = ReadBlob(62, docEntityId);
            if (blob != null && blob.Length >= 11) return; // blob is non-trivial — leave it alone
            const string updateSql =
                "UPDATE EntityVersion SET EntityVersionData = NULL " +
                "WHERE EntityTypeId=62 AND EntityId=@id AND EntityVersionId=@vid";
            using (var conn = Open())
            using (var cmd = new SqlCommand(updateSql, conn))
            {
                cmd.Parameters.AddWithValue("@id", docEntityId);
                cmd.Parameters.AddWithValue("@vid", docVersionId);
                cmd.ExecuteNonQuery();
            }
            Console.Error.WriteLine(
                $"[gx18-worker] NullOutDocumentationBlob: zeroed 62/{docEntityId}@{docVersionId} " +
                $"(was {blob?.Length ?? 0} bytes)");
        }

        // Looks up the latest EntityId for an object by EntityTypeId + name (case-insensitive).
        public int FindEntityId(int entityTypeId, string name)
        {
            const string sql = "SELECT TOP 1 ev.EntityId FROM EntityVersion ev " +
                "WHERE ev.EntityTypeId=@tid AND ev.EntityVersionName=@name " +
                "AND ev.EntityVersionId=(SELECT MAX(ev2.EntityVersionId) FROM EntityVersion ev2 " +
                "WHERE ev2.EntityTypeId=@tid AND ev2.EntityId=ev.EntityId)";
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@tid", entityTypeId);
                cmd.Parameters.AddWithValue("@name", name ?? "");
                var val = cmd.ExecuteScalar();
                if (val == null || val == DBNull.Value)
                    throw new Exception($"Object '{name}' (EntityTypeId {entityTypeId}) not found in KB");
                return Convert.ToInt32(val);
            }
        }

        // Patches a <Script Name="scriptName"><![CDATA[...]]></Script> block in the UC Properties
        // blob (EntityTypeId 149) directly via SQL. Used as fallback when IKnowledgeManagerService
        // fails headless for UC type=147 (same root cause as export, which already has a SQL bypass).
        // Preserves the 11-byte GeneXus header and re-GZips the patched XML.
        public string PatchUCScriptBlob(int ucEntityId, string scriptName, string newContent)
        {
            int partEntityId = -1, partVersionId = -1;
            const string findSql = @"
                SELECT evc.ComponentEntityId, evc.ComponentEntityVersionId
                FROM EntityVersionComposition evc
                WHERE evc.CompoundEntityTypeId = 147 AND evc.CompoundEntityId = @cid
                  AND evc.ComponentEntityTypeId = 149
                  AND evc.CompoundEntityVersionId = (
                      SELECT MAX(ev2.EntityVersionId) FROM EntityVersion ev2
                      WHERE ev2.EntityTypeId = 147 AND ev2.EntityId = @cid
                  )";
            using (var conn = Open())
            using (var cmd = new SqlCommand(findSql, conn))
            {
                cmd.Parameters.AddWithValue("@cid", ucEntityId);
                using (var r = cmd.ExecuteReader())
                {
                    if (!r.Read()) throw new Exception(
                        $"Properties part (type 149) not found for UC EntityId={ucEntityId}");
                    partEntityId = r.GetInt32(0);
                    partVersionId = r.GetInt32(1);
                }
            }
            byte[] current = ReadBlob(149, partEntityId);
            if (current == null || current.Length < 11)
                throw new Exception($"Properties blob missing or too short for UC EntityId={ucEntityId}");
            string xml = Decompress(current);
            // Raw blob may store scripts without CDATA (only gx_export adds CDATA wrappers).
            // Match both: <Script Name="X">raw content</Script> and <Script Name="X"><![CDATA[...]]></Script>
            var rx = new Regex(
                @"(<Script\b[^>]*\bName=""" + Regex.Escape(scriptName) + @"""[^>]*>)(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?(</Script>)",
                RegexOptions.Compiled);
            if (!rx.IsMatch(xml))
                throw new Exception($"Script '{scriptName}' not found in UC Properties blob. " +
                    "Use gx_read_xpz to list available scripts.");
            // The RAW KB Properties blob stores <Script> bodies WITHOUT a CDATA wrapper — the
            // whole Definition is the content, and the GX parser tolerates raw <, >, & inside a
            // <Script> element (it just must not contain the literal ]]> ... but only because, in
            // the IDE's XPZ form, the entire Definition is itself wrapped in one outer CDATA).
            // Writing an INNER <![CDATA[...]]> here nests CDATA: the inner ]]> closes the OUTER
            // CDATA prematurely when the object is later exported/opened → "Invalid User Control
            // Definition" + NullRef in the IDE. So we insert the body RAW, never CDATA-wrapped.
            // (gx_export is the only path that adds CDATA, and it does so around the whole part.)
            // Guard: a body containing ]]> would still break the eventual outer CDATA on export —
            // reject it rather than silently corrupt.
            if (newContent.IndexOf("]]>", StringComparison.Ordinal) >= 0)
                throw new Exception("UC script body contains ']]>', which would corrupt the Properties " +
                    "definition on export. Remove the ']]>' sequence from the script.");
            string newXml = rx.Replace(xml,
                m => m.Groups[1].Value + newContent + m.Groups[3].Value);
            byte[] textBytes = Encoding.UTF8.GetBytes(newXml);
            byte[] compressed;
            using (var ms = new MemoryStream())
            {
                using (var gz = new GZipStream(ms, CompressionLevel.Optimal))
                    gz.Write(textBytes, 0, textBytes.Length);
                compressed = ms.ToArray();
            }
            // Header is magic(6) + flag(1) + uncompressed-size LE(4). The size MUST match the new
            // uncompressed length, or the IDE throws "Memory stream is not expandable". Copy magic+flag
            // from the original, then write the freshly-computed size — do NOT reuse the old size bytes.
            var newBlob = new byte[11 + compressed.Length];
            Array.Copy(current, 0, newBlob, 0, 7); // magic (6) + flag (1)
            byte[] sizeLE = BitConverter.GetBytes(textBytes.Length); // LE on x86/x64
            Array.Copy(sizeLE, 0, newBlob, 7, 4);
            Array.Copy(compressed, 0, newBlob, 11, compressed.Length);
            const string updateSql =
                "UPDATE EntityVersion SET EntityVersionData = @blob " +
                "WHERE EntityTypeId=149 AND EntityId=@id AND EntityVersionId=@vid";
            using (var conn = Open())
            using (var cmd = new SqlCommand(updateSql, conn))
            {
                cmd.Parameters.AddWithValue("@id", partEntityId);
                cmd.Parameters.AddWithValue("@vid", partVersionId);
                var p = cmd.Parameters.Add("@blob", SqlDbType.VarBinary, -1);
                p.Value = newBlob;
                int rows = cmd.ExecuteNonQuery();
                if (rows == 0) throw new Exception(
                    $"UPDATE affected 0 rows for UC Properties part 149/{partEntityId}");
            }
            return $"uc-script-patched:149/{partEntityId}@{partVersionId} script={scriptName} ({newBlob.Length} bytes, gzip)";
        }

        // Reads all <Script Name="..."> elements from the UC Properties blob (EntityTypeId=149).
        // List mode (scriptName null/empty): returns {ok, name, scripts:[{name,charCount}], scriptCount}.
        // Single mode (scriptName provided): returns {ok, name, scripts:[{name,charCount,content}], scriptCount=1}.
        public object ReadUcScripts(string name, string scriptName)
        {
            // Find UC EntityId (EntityTypeId=147).
            int ucEntityId;
            const string findUcSql = "SELECT TOP 1 ev.EntityId FROM EntityVersion ev " +
                "WHERE ev.EntityTypeId=147 AND ev.EntityVersionName=@name " +
                "AND ev.EntityVersionId=(SELECT MAX(ev2.EntityVersionId) FROM EntityVersion ev2 " +
                "WHERE ev2.EntityTypeId=147 AND ev2.EntityId=ev.EntityId)";
            using (var conn = Open())
            using (var cmd = new SqlCommand(findUcSql, conn))
            {
                cmd.Parameters.AddWithValue("@name", name ?? "");
                var val = cmd.ExecuteScalar();
                if (val == null || val == DBNull.Value)
                    throw new Exception($"UC '{name}' not found in KB (EntityTypeId=147)");
                ucEntityId = Convert.ToInt32(val);
            }

            // Find the Properties part (EntityTypeId=149) via EntityVersionComposition.
            int partEntityId = -1;
            const string findSql = @"
                SELECT evc.ComponentEntityId
                FROM EntityVersionComposition evc
                WHERE evc.CompoundEntityTypeId = 147 AND evc.CompoundEntityId = @cid
                  AND evc.ComponentEntityTypeId = 149
                  AND evc.CompoundEntityVersionId = (
                      SELECT MAX(ev2.EntityVersionId) FROM EntityVersion ev2
                      WHERE ev2.EntityTypeId = 147 AND ev2.EntityId = @cid
                  )";
            using (var conn = Open())
            using (var cmd = new SqlCommand(findSql, conn))
            {
                cmd.Parameters.AddWithValue("@cid", ucEntityId);
                using (var r = cmd.ExecuteReader())
                {
                    if (r.Read()) partEntityId = r.GetInt32(0);
                }
            }

            if (partEntityId < 0)
            {
                // UC has no Properties part — return empty result, don't throw.
                return new { ok = true, name, scripts = new object[0], scriptCount = 0 };
            }

            byte[] blob = ReadBlob(149, partEntityId);
            if (blob == null || blob.Length < 11)
                return new { ok = true, name, scripts = new object[0], scriptCount = 0 };

            string xml = Decompress(blob);

            // Extract all <Script Name="...">...</Script> blocks (with or without CDATA).
            var rx = new Regex(
                @"<Script\b[^>]*\bName=""([^""]+)""[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</Script>",
                RegexOptions.Singleline);

            var scripts = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (Match m in rx.Matches(xml))
                scripts[m.Groups[1].Value] = m.Groups[2].Value;

            if (!string.IsNullOrEmpty(scriptName))
            {
                // Single mode.
                if (!scripts.TryGetValue(scriptName, out var content))
                {
                    var available = string.Join(", ", scripts.Keys);
                    throw new Exception(
                        $"Script '{scriptName}' not found in UC '{name}'. " +
                        $"Available scripts: {(string.IsNullOrEmpty(available) ? "(none)" : available)}");
                }
                return new
                {
                    ok = true,
                    name,
                    scripts = new[] { new { name = scriptName, charCount = content.Length, content } },
                    scriptCount = 1
                };
            }

            // List mode — no System.Linq in this file, build the list manually.
            var scriptList = new List<object>();
            foreach (var kv in scripts)
                scriptList.Add(new { name = kv.Key, charCount = kv.Value.Length });
            return new
            {
                ok = true,
                name,
                scripts = scriptList,
                scriptCount = scripts.Count
            };
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

        public object Query(string query, bool readOnly, int maxRows = 1000)
        {
            if (maxRows <= 0 || maxRows > 5000) maxRows = 1000;
            // Block DDL regardless of readOnly mode — use IDE GX18 for schema changes.
            var upper = (query ?? "").TrimStart().ToUpperInvariant();
            if (upper.StartsWith("DROP ") || upper.StartsWith("DROP\t") ||
                upper.StartsWith("TRUNCATE ") || upper.StartsWith("TRUNCATE\t") ||
                upper.StartsWith("ALTER ") || upper.StartsWith("ALTER\t") ||
                upper.StartsWith("CREATE TABLE") || upper.StartsWith("CREATE INDEX") ||
                upper.StartsWith("EXEC ") || upper.StartsWith("EXEC\t") ||
                upper.StartsWith("EXECUTE ") || upper.StartsWith("EXECUTE\t"))
                throw new Exception(
                    "DDL statements (DROP, TRUNCATE, ALTER, CREATE TABLE, CREATE INDEX, EXEC) are blocked. " +
                    "Use the IDE GX18 for schema changes.");
            var rows = new List<object>();
            bool truncated = false;
            using (var conn = Open())
            using (var cmd = new SqlCommand(query, conn))
            {
                try
                {
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            if (rows.Count >= maxRows) { truncated = true; break; }
                            var row = new Dictionary<string, object>();
                            for (int i = 0; i < r.FieldCount; i++)
                                row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
                            rows.Add(row);
                        }
                    }
                }
                catch (SqlException ex)
                {
                    var hint = ColHint(ex.Message);
                    throw new Exception(hint != null ? $"{ex.Message} {hint}" : ex.Message);
                }
            }
            return new { rows, count = rows.Count, truncated };
        }

        // Search object sources for a text/regex pattern.
        // Reads and decompresses part blobs in memory — limited by `limit` to avoid timeouts.
        public object Search(string pattern, int type, string section, int limit, string module = null, string exclude = null)
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
            var modJoin = !string.IsNullOrEmpty(module) ? " JOIN Entity e ON e.EntityTypeId=c.CompoundEntityTypeId AND e.EntityId=c.CompoundEntityId" : "";
            var modFilter = !string.IsNullOrEmpty(module) ? " AND e.ModuleName=@mod" : "";
            var exclFilter = !string.IsNullOrEmpty(exclude) ? " AND pn.EntityVersionName NOT LIKE @excl" : "";
            var sql = $@"SELECT TOP {limit * 5}
                    c.CompoundEntityTypeId, c.CompoundEntityId,
                    p.EntityTypeId AS PartTypeId, p.EntityId AS PartEntityId,
                    pn.EntityVersionName AS PartName, pn.EntityVersionTimestamp
                FROM EntityVersionComposition c
                JOIN EntityVersion p ON p.EntityTypeId=c.ComponentEntityTypeId AND p.EntityId=c.ComponentEntityId
                    AND p.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId=p.EntityTypeId AND v2.EntityId=p.EntityId)
                JOIN EntityVersion pn ON pn.EntityTypeId=c.CompoundEntityTypeId AND pn.EntityId=c.CompoundEntityId
                    AND pn.EntityVersionId=c.CompoundEntityVersionId{modJoin}
                WHERE c.ComponentEntityTypeId IN ({partTypeIn}){typeFilter}{modFilter}{exclFilter}
                    AND c.CompoundEntityVersionId=(SELECT MAX(v3.EntityVersionId) FROM EntityVersion v3 WHERE v3.EntityTypeId=c.CompoundEntityTypeId AND v3.EntityId=c.CompoundEntityId)";

            var candidates = new List<(int compoundType, int compoundId, int partTypeId, int partEntityId, string parentName)>();
            using (var conn = Open())
            using (var cmd = new SqlCommand(sql, conn))
            {
                if (!string.IsNullOrEmpty(module)) cmd.Parameters.AddWithValue("@mod", module);
                if (!string.IsNullOrEmpty(exclude)) cmd.Parameters.AddWithValue("@excl", exclude.Contains("%") ? exclude : $"%{exclude}%");
                using (var r = cmd.ExecuteReader())
                    while (r.Read())
                        candidates.Add((r.GetInt32(0), r.GetInt32(1), r.GetInt32(2), r.GetInt32(3), r.IsDBNull(4) ? "" : r.GetString(4)));
            }

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
        public object Analyze(string name, int type, string action, int limit, string exclude = null)
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
                var searchResult = Search(name, 0, null, limit, null, exclude) as dynamic;
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
                    if (!string.IsNullOrEmpty(exclude) && MatchesLikePattern(refName, exclude.Contains("%") ? exclude : $"%{exclude}%")) continue;
                    if (src.IndexOf(refName, StringComparison.OrdinalIgnoreCase) >= 0)
                        referencedNames.Add(new { name = refName, entityTypeId = Convert.ToInt32(d["EntityTypeId"]), typeName = TypeName(Convert.ToInt32(d["EntityTypeId"])) });
                }
                return new { name, entityTypeId = type, entityId, action, results = referencedNames };
            }
            return new { name, entityTypeId = type, entityId, action, results = new List<object>(), note = $"Unknown action: {action}. Use usedby, uses, or dependencies." };
        }

        // SQL LIKE pattern matching with % wildcard (case-insensitive). Used for in-memory exclude filtering.
        private static bool MatchesLikePattern(string text, string pattern)
        {
            var regex = "^" + System.Text.RegularExpressions.Regex.Escape(pattern)
                .Replace("\\%", ".*").Replace("\\_", ".") + "$";
            return System.Text.RegularExpressions.Regex.IsMatch(text ?? "", regex,
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
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
        public object DeadCode(int entityTypeId, string module, int limit, string exclude = null)
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
            var excludeFilter = string.IsNullOrEmpty(exclude) ? "" :
                $"AND ev.EntityVersionName NOT LIKE N'{(exclude.Contains("%") ? exclude : $"%{exclude}%").Replace("'", "''")}'";

            // Collect candidate objects, then check if any other object's source references them by name
            var candidatesSql = $@"
                SELECT TOP {limit} ev.EntityId, ev.EntityVersionName as Name
                FROM EntityVersion ev
                WHERE ev.EntityTypeId = {entityTypeId}
                  AND ev.EntityVersionId = (SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2 WHERE v2.EntityTypeId={entityTypeId} AND v2.EntityId=ev.EntityId)
                {moduleFilter}
                {excludeFilter}
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

        // --- SQL-based XPZ export for object types whose SDK Export fails headlessly ---
        // Constructs a valid, importable XPZ by reading blobs directly from the KB SQL database.
        // Confirmed part-type GUIDs come from real IDE-exported XPZ files.
        public object SqlExportXpz(string name, int entityTypeId, string outputFile)
        {
            var _step = "init";
            try { return SqlExportXpzImpl(name, entityTypeId, outputFile, ref _step); }
            catch (Exception ex) { throw new Exception($"SqlExportXpz[{_step}]: {ex.GetType().Name}: {ex.Message}", ex); }
        }

        private object SqlExportXpzImpl(string name, int entityTypeId, string outputFile, ref string step)
        {
            if (string.IsNullOrEmpty(name)) throw new Exception("name is required");

            // Part GUID map: EntityTypeId → XPZ <Part type="..."> GUID
            var partGuids = new Dictionary<int, string>
            {
                { 57, "763f0d8b-d8ac-4db4-8dd4-de8979f2b5b9" },  // Conditions
                { 62, "babf62c5-0111-49e9-a1c3-cc004d90900a" },  // Documentation
                { 64, "c44bd5ff-f918-415b-98e6-aca44fed84fa" },  // Events
                { 65, "ad3ca970-19d0-44e1-a7b7-db05556e820c" },  // Help
                { 67, "528d1c06-a9c2-420d-bd35-21dca83f12ff" },  // ProcedureSource
                { 69, "9b0a32a3-de6d-4be1-a4dd-1b85d3741534" },  // Rules
                { 72, "e4c4ade7-53f0-4a56-bdfd-843735b66f47" },  // Variables
                { 74, "d24a58ad-57ba-41b7-9e6e-eaca3543c778" },  // WebForm
                // UserControl parts (confirmed from real IDE-exported XPZ files)
                { 148, "3dd92fe7-b095-44d3-9fa0-8488fa3f0c67" },  // UC ScreenTemplate
                { 149, "8e9e4a7c-a4d3-4c36-8e8e-fb6702402f63" },  // UC Properties (Definition XML)
            };
            // Code parts: tokenized source stored as GX tokens → TokensToText → wrap in <Source><![CDATA[]]></Source>
            var codeParts = new HashSet<int> { 57, 64, 67, 69 };
            // Layout parts: decompressed blob IS the content → wrap in <Source><![CDATA[]]></Source>
            var layoutParts = new HashSet<int> { 74, 148 };  // 149 handled by definitionParts below
            // Parts that need an extra <Properties> element after <Source> (UC ScreenTemplate pattern)
            var needsPartProperties = new HashSet<int> { 148 };
            // Definition parts: UC Properties blob — embed <Definition> XML directly (no <Source> wrapper);
            // <Script> element content is wrapped in CDATA for gx_read_xpz/gx_patch_xpz compatibility.
            var definitionParts = new HashSet<int> { 149 };
            // Structure parts: decompressed blob IS raw XML (<Variable>, <Help>, <Properties/>) → embed directly

            step = "metadata-query";
            // 1. Object metadata
            int entityId = 0, entityVersionId = 0;
            string description = "", timestamp = "", entityVersionProperties = "", entityGuid = "";
            var safeName = name.Replace("'", "''");
            using (var conn = Open())
            using (var cmd = new SqlCommand($@"
                SELECT ev.EntityId, ev.EntityVersionId,
                       ISNULL(ev.EntityVersionDescription, ''),
                       ISNULL(ev.EntityVersionProperties, ''),
                       e.EntityGuid
                FROM EntityVersion ev
                JOIN Entity e ON e.EntityTypeId = ev.EntityTypeId AND e.EntityId = ev.EntityId
                WHERE ev.EntityTypeId = {entityTypeId} AND ev.EntityVersionName = N'{safeName}'
                  AND ev.EntityVersionId = (SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2
                                             WHERE v2.EntityTypeId = {entityTypeId} AND v2.EntityId = ev.EntityId)", conn))
            using (var r = cmd.ExecuteReader())
            {
                if (!r.Read())
                    throw new Exception($"Object '{name}' (EntityTypeId {entityTypeId}) not found in KB. Run gx_find to confirm the exact name.");
                step = "metadata-read-cols";
                entityId = r.GetInt32(0);
                entityVersionId = r.GetInt32(1);
                description = r.GetString(2);
                entityVersionProperties = r.GetString(3);
                entityGuid = r.GetValue(4)?.ToString() ?? "";
            }
            timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ");

            step = "module-query";
            // 2. Module name and GUID
            string moduleName = "", parentGuid = "";
            using (var conn = Open())
            using (var cmd = new SqlCommand($@"
                SELECT ISNULL(ev2.EntityVersionName, ''), ISNULL(CAST(e2.EntityGuid AS varchar(40)), '')
                FROM ModelEntityVersion mev
                JOIN EntityVersion ev2 ON ev2.EntityTypeId = 100 AND ev2.EntityId = mev.ModelParentEntityId
                     AND ev2.EntityVersionId = (SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2
                                                 WHERE v2.EntityTypeId = 100 AND v2.EntityId = mev.ModelParentEntityId)
                JOIN Entity e2 ON e2.EntityTypeId = 100 AND e2.EntityId = mev.ModelParentEntityId
                WHERE mev.EntityTypeId = {entityTypeId} AND mev.EntityId = {entityId}
                  AND mev.ModelId = (SELECT TOP 1 ModelId FROM ModelEntityVersion
                                     WHERE EntityTypeId = {entityTypeId} AND EntityId = {entityId})", conn))
            using (var r = cmd.ExecuteReader())
            {
                if (r.Read()) { moduleName = r.GetString(0); parentGuid = r.GetString(1); }
            }

            step = "parts-query";
            // 3. Parts
            var partList = new List<(int typeId, int compEntityId)>();
            using (var conn = Open())
            using (var cmd = new SqlCommand($@"
                SELECT evc.ComponentEntityTypeId, evc.ComponentEntityId
                FROM EntityVersionComposition evc
                WHERE evc.CompoundEntityTypeId = {entityTypeId}
                  AND evc.CompoundEntityId = {entityId}
                  AND evc.CompoundEntityVersionId = {entityVersionId}
                ORDER BY evc.ComponentEntityTypeId", conn))
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read()) partList.Add((r.GetInt32(0), r.GetInt32(1)));
            }

            step = "build-parts-xml";
            // 4. Build Part XML
            Func<string, string> EscapeCdata = s => (s ?? "").Replace("]]>", "]]]]><![CDATA[>");
            Func<string, string> EscapeAttr = s => (s ?? "").Replace("&", "&amp;").Replace("\"", "&quot;").Replace("<", "&lt;").Replace(">", "&gt;");

            var partsSb = new StringBuilder();
            foreach (var (partTypeId, compEntityId) in partList)
            {
                if (!partGuids.TryGetValue(partTypeId, out var partGuid)) continue;

                var blob = ReadBlob(partTypeId, compEntityId);

                if (codeParts.Contains(partTypeId))
                {
                    // Code parts: TokensToText on decompressed blob → CDATA
                    string content = "";
                    if (blob != null && blob.Length > 11)
                    {
                        var xml = Decompress(blob);
                        content = TokensToText(xml);
                        if (string.IsNullOrEmpty(content)) content = xml; // fallback
                    }
                    partsSb.AppendLine($"      <Part type=\"{partGuid}\">");
                    partsSb.AppendLine($"        <Source><![CDATA[{EscapeCdata(content)}]]></Source>");
                    partsSb.AppendLine($"        <Properties><Property><Name>IsDefault</Name><Value>False</Value></Property></Properties>");
                    partsSb.AppendLine($"      </Part>");
                }
                else if (layoutParts.Contains(partTypeId))
                {
                    // Layout parts: decompressed blob IS the content (e.g. GxMultiForm XML, UC template/properties) → CDATA
                    string content = "";
                    if (blob != null && blob.Length > 11)
                        content = Decompress(blob);
                    partsSb.AppendLine($"      <Part type=\"{partGuid}\">");
                    partsSb.AppendLine($"        <Source><![CDATA[{EscapeCdata(content)}]]></Source>");
                    if (needsPartProperties.Contains(partTypeId))
                        partsSb.AppendLine($"        <Properties><Property><Name>IsDefault</Name><Value>False</Value></Property></Properties>");
                    partsSb.AppendLine($"      </Part>");
                }
                else if (definitionParts.Contains(partTypeId))
                {
                    // UC Properties: embed <Definition> XML directly (matches IDE XPZ format).
                    // Wrap each <Script> element's content in CDATA so gx_read_xpz / gx_patch_xpz
                    // can find and patch scripts by name.
                    string content = "";
                    if (blob != null && blob.Length > 11)
                    {
                        content = Decompress(blob);
                        content = Regex.Replace(content,
                            @"(<Script\b[^>]*>)([\s\S]*?)(</Script>)",
                            m =>
                            {
                                var body = m.Groups[2].Value;
                                if (body.TrimStart().StartsWith("<![CDATA[")) return m.Value;
                                return m.Groups[1].Value + "<![CDATA[" + body + "]]>" + m.Groups[3].Value;
                            });
                    }
                    partsSb.AppendLine($"      <Part type=\"{partGuid}\">");
                    if (!string.IsNullOrEmpty(content)) partsSb.Append(content);
                    partsSb.AppendLine();
                    partsSb.AppendLine($"      </Part>");
                }
                else
                {
                    // Structure parts (Variables, Help, Documentation): decompressed blob IS raw XML
                    string content = "";
                    if (blob != null && blob.Length > 11)
                        content = Decompress(blob);
                    partsSb.AppendLine($"      <Part type=\"{partGuid}\">");
                    if (!string.IsNullOrEmpty(content)) partsSb.Append(content);
                    partsSb.AppendLine();
                    partsSb.AppendLine($"      </Part>");
                }
            }

            step = "assemble-xml";
            // 5. Object-level Properties (pass-through from EntityVersionProperties)
            string objProps = string.IsNullOrEmpty(entityVersionProperties) ? "<Properties />" : entityVersionProperties;

            // KB name from connection string
            var csb = new System.Data.SqlClient.SqlConnectionStringBuilder(_connectionString);
            string kbName = csb.InitialCatalog;

            // Object type GUID varies by EntityTypeId (confirmed from IDE-exported XPZ files)
            var objectTypeGuidMap = new Dictionary<int, string>
            {
                { 43,  "c9584656-94b6-4ccd-890f-332d11fc2c25" },  // WebPanel / WebComponent
                { 147, "562f4793-aabe-449f-8821-fc77e550698e" },  // UserControl
            };
            string objectTypeGuid = objectTypeGuidMap.TryGetValue(entityTypeId, out var g)
                ? g : "c9584656-94b6-4ccd-890f-332d11fc2c25";

            // 6. Assemble XPZ XML
            string xpzXml = $"<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n" +
                $"<ExportFile>\r\n" +
                $"  <KMW kbname=\"{EscapeAttr(kbName)}\" />\r\n" +
                $"  <Source kb=\"{EscapeAttr(kbName)}\" UNCPath=\"\" />\r\n" +
                $"  <Dependencies />\r\n" +
                $"  <ObjectsIdentityMapping>\r\n" +
                $"    <ObjectIdentity Type=\"{objectTypeGuid}\" Name=\"{EscapeAttr(name)}\" parent=\"{EscapeAttr(moduleName)}\">\r\n" +
                $"      <Guid>{entityGuid}</Guid>\r\n" +
                $"    </ObjectIdentity>\r\n" +
                $"  </ObjectsIdentityMapping>\r\n" +
                $"  <Objects>\r\n" +
                $"    <Object parentGuid=\"{parentGuid}\" user=\"\" versionDate=\"{timestamp}\" lastUpdate=\"{timestamp}\" checksum=\"{new string('0', 32)}\" fullyQualifiedName=\"{EscapeAttr(name)}\" moduleGuid=\"\" guid=\"{entityGuid}\" name=\"{EscapeAttr(name)}\" type=\"{objectTypeGuid}\" description=\"{EscapeAttr(description)}\" parent=\"{EscapeAttr(moduleName)}\" parentType=\"00000000-0000-0000-0000-000000000008\">\r\n" +
                partsSb.ToString().Replace("\r\n", "\n").Replace("\n", "\r\n") +
                $"      {objProps}\r\n" +
                $"    </Object>\r\n" +
                $"  </Objects>\r\n" +
                $"</ExportFile>";

            step = "write-zip";
            // 7. Write ZIP (BOM UTF-8 + CRLF)
            Directory.CreateDirectory(Path.GetDirectoryName(outputFile) ?? ".");
            var bomUtf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
            byte[] zipBytes;
            using (var ms = new MemoryStream())
            {
                using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
                {
                    var entry = zip.CreateEntry(name + ".xml", CompressionLevel.Optimal);
                    using (var writer = new StreamWriter(entry.Open(), bomUtf8))
                    { writer.NewLine = "\r\n"; writer.Write(xpzXml); }
                }
                zipBytes = ms.ToArray();
            }
            File.WriteAllBytes(outputFile, zipBytes);

            long fileSize = new FileInfo(outputFile).Length;
            string typeName = entityTypeId == 147 ? "usercontrol" : "webpanel";
            return new { ok = true, name, type = typeName, outputFile, fileExists = true, bytes = fileSize,
                exportedNames = new[] { name }, fallback = "sql",
                note = $"Exported via SQL blob reader (SDK Export unavailable for EntityTypeId {entityTypeId} in headless mode)" };
        }
    }
}
