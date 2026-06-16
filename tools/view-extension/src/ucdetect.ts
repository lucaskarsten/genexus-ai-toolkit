const WBC_PREFIX = /^(Event |Sub |Do Case)/i;
const UC_MARKER = /<(Definition|Property|Event|Script)[\s>/]/;

export function isUcDocument(text: string): boolean {
  const trimmed = text.trimStart();
  if (WBC_PREFIX.test(trimmed)) {
    return false;
  }
  return UC_MARKER.test(text);
}
