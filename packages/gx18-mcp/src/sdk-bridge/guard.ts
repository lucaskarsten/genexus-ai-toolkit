import { bridge } from './bridge';
import { SqlQueryResult } from './protocol';

/**
 * Post-save assertion: verifies the recent EntityVersion rows created for an object
 * have the expected UserId. Throws if there is a mismatch to prevent Team Development
 * history corruption.
 */
export async function assertUserId(
  entityTypeId: number,
  entityId: number,
  expectedUserId: number
): Promise<void> {
  // Skip if entityId is unknown (caller couldn't resolve it)
  if (!entityId) return;

  const result = await bridge.send<SqlQueryResult>(
    'sql_query',
    {
      query:
        `SELECT TOP 5 UserId, CONVERT(varchar, EntityVersionTimestamp, 120) AS EntityVersionTimestamp ` +
        `FROM EntityVersion ` +
        `WHERE EntityTypeId=${entityTypeId} AND EntityId=${entityId} ` +
        `AND EntityVersionTimestamp >= DATEADD(second, -15, GETDATE()) ` +
        `ORDER BY EntityVersionTimestamp DESC`,
      readOnly: true,
    }
  );

  const recent = result.rows as Array<{ UserId: number; EntityVersionTimestamp: string }>;

  // No recent versions means the write used UPDATE (no new row), which is fine
  if (recent.length === 0) return;

  for (const row of recent) {
    if (row.UserId !== expectedUserId) {
      throw new Error(
        `UserId mismatch after save! Expected ${expectedUserId}, got ${row.UserId}.\n` +
        `This would corrupt Team Development history.\n` +
        `Recent rows: ${JSON.stringify(recent, null, 2)}`
      );
    }
  }
}
