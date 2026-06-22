using System;
using Gx18Mcp.SdkWorker.Sql;

namespace Gx18Mcp.SdkWorker.Identity
{
    public class IdentityResolver
    {
        private readonly string _windowsUser;
        private readonly KbSqlClient _sql;
        private int? _kbUserId;

        public IdentityResolver(string windowsUser, KbSqlClient sql)
        {
            _windowsUser = windowsUser;
            _sql = sql;
        }

        public int GetKbUserId()
        {
            if (_kbUserId.HasValue) return _kbUserId.Value;
            // KB users are entities of EntityTypeId 7 (KBUser); EntityVersionName == Windows identity.
            try { _kbUserId = _sql.FindUserIdByName(_windowsUser); }
            catch { _kbUserId = 0; }
            return _kbUserId.Value;
        }

        public object GetInfo(bool sdkReady, string kbPath, string gx18Dir)
        {
            return new
            {
                windowsUser = _windowsUser,
                kbUserId = GetKbUserId(),
                kbPath = kbPath ?? "",
                kbOpen = sdkReady,
                gx18Dir = gx18Dir ?? "",
                sdkReady
            };
        }
    }
}
