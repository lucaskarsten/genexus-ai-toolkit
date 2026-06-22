import { bridge } from '../sdk-bridge/bridge';
import { IdentityInfo } from '../sdk-bridge/protocol';

export async function gxWhoami(): Promise<string> {
  const info = await bridge.send<IdentityInfo>('whoami', {});
  return JSON.stringify(info, null, 2);
}
