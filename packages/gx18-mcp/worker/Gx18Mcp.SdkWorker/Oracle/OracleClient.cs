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

        private OracleConnection Open()
        {
            var conn = new OracleConnection(_connectionString);
            conn.Open();
            return conn;
        }

        public object Query(string query, bool readOnly, int limit)
        {
            if (!readOnly)
            {
                var upper = query.TrimStart().ToUpperInvariant();
                if (upper.StartsWith("DROP") || upper.StartsWith("TRUNCATE"))
                    throw new Exception("Blocked: DROP/TRUNCATE not allowed via oracle_query");
            }

            var rows = new List<object>();
            using (var conn = Open())
            using (var cmd = new OracleCommand(query, conn))
            {
                cmd.FetchSize = cmd.FetchSize * 4;
                using (var r = cmd.ExecuteReader())
                {
                    int count = 0;
                    while (r.Read() && count < limit)
                    {
                        var row = new Dictionary<string, object>();
                        for (int i = 0; i < r.FieldCount; i++)
                        {
                            var val = r.IsDBNull(i) ? null : r.GetValue(i);
                            // Convert Oracle-specific types to strings for JSON serialization
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
    }
}
