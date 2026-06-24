using System;
using System.Collections.Generic;
using Oracle.ManagedDataAccess.Client;

namespace Gx18Mcp.SdkWorker.Oracle
{
    public class OracleClient
    {
        private readonly string _connectionString;

        public OracleClient(string host, int port, string service, string user, string password)
        {
            // EZConnect format: host:port/service
            _connectionString = $"Data Source={host}:{port}/{service};User Id={user};Password={password};";
        }

        public static OracleClient FromEnv()
        {
            var host = Environment.GetEnvironmentVariable("ORACLE_HOST");
            if (string.IsNullOrEmpty(host)) return null;
            var port = int.Parse(Environment.GetEnvironmentVariable("ORACLE_PORT") ?? "1521");
            var service = Environment.GetEnvironmentVariable("ORACLE_SERVICE") ?? "";
            var user = Environment.GetEnvironmentVariable("ORACLE_USER") ?? "";
            var password = Environment.GetEnvironmentVariable("ORACLE_PASSWORD") ?? "";
            return new OracleClient(host, port, service, user, password);
        }

        public bool TestConnection()
        {
            try { using (Open()) return true; } catch { return false; }
        }

        private OracleConnection Open()
        {
            var conn = new OracleConnection(_connectionString);
            conn.Open();
            return conn;
        }

        // Strip sensitive fields (host, credentials) from Oracle exception messages
        // before the error propagates to the client.
        private static string SanitizeError(Exception ex)
        {
            var msg = ex.Message ?? "";
            // OracleException often includes the EZConnect DSN in the message
            var idx = msg.IndexOf("Data Source=", StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
                msg = msg.Substring(0, idx).TrimEnd(';', ' ') + " [connection details redacted]";
            // Also strip "User Id=" occurrences
            idx = msg.IndexOf("User Id=", StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
                msg = msg.Substring(0, idx).TrimEnd(';', ' ') + " [credentials redacted]";
            return msg;
        }

        public object Query(string query, bool readOnly, int limit, Dictionary<string, object> parameters = null)
        {
            if (!readOnly)
            {
                var upper = (query ?? "").TrimStart().ToUpperInvariant();
                if (upper.StartsWith("DROP ") || upper.StartsWith("DROP\t") ||
                    upper.StartsWith("TRUNCATE ") || upper.StartsWith("TRUNCATE\t"))
                    throw new Exception("Blocked: DROP/TRUNCATE not allowed via oracle_query");
            }

            try
            {
                var rows = new List<object>();
                using (var conn = Open())
                using (var cmd = new OracleCommand(query, conn))
                {
                    cmd.CommandTimeout = 30;
                    cmd.FetchSize = cmd.FetchSize * 4;
                    if (parameters != null)
                        foreach (var kv in parameters)
                            cmd.Parameters.Add(new OracleParameter(kv.Key, kv.Value ?? DBNull.Value));
                    using (var r = cmd.ExecuteReader())
                    {
                        int count = 0;
                        while (r.Read() && count < limit)
                        {
                            var row = new Dictionary<string, object>();
                            for (int i = 0; i < r.FieldCount; i++)
                            {
                                var val = r.IsDBNull(i) ? null : r.GetValue(i);
                                if (val is DateTime dt) val = dt.ToString("yyyy-MM-dd HH:mm:ss");
                                else if (val != null && !(val is string || val is int || val is long ||
                                          val is double || val is float || val is decimal || val is bool))
                                    val = val.ToString();
                                row[r.GetName(i)] = val;
                            }
                            rows.Add(row);
                            count++;
                        }
                    }
                }
                return new { rows, count = rows.Count };
            }
            catch (OracleException ex)
            {
                throw new Exception("Oracle error: " + SanitizeError(ex));
            }
        }
    }
}
