import { bridge } from '../sdk-bridge/bridge';
import { IdentityInfo } from '../sdk-bridge/protocol';

export async function gxWhoami(): Promise<string> {
  const info = await bridge.send<IdentityInfo>('whoami', {});
  const out: Record<string, unknown> = { ...info };
  if (!info.sdkReady) {
    out._sdkHint =
      'SDK not yet open — this is normal on cold-start. ' +
      'SQL read tools (gx_find, gx_read, gx_sql, gx_list, etc.) work normally without SDK. ' +
      'Write tools (gx_modify, gx_create, etc.) open the SDK automatically on first call — no manual step needed. ' +
      'Call gx_whoami again to complete SDK warm-up and confirm kbOpen=true before writing.';
  }
  return JSON.stringify(out, null, 2);
}
