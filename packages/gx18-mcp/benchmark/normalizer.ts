// Normalizer — masks volatile fields before diff and checksum computation.
// Pure function, no I/O.

import { createHash } from 'node:crypto';

const MASKED = '<masked>';
const ENTITY_VERSION_ID_SENTINEL = '<entityVersionId>';

// Fields whose values change across runs and must be masked before diffing.
const VOLATILE_KEYS = new Set([
  'lastModified',
  'timestamp',
  'capturedAt',
  'startedAt',
  'runAt',
]);

// Preserved as a sentinel so the drift command can still extract the raw value
// before normalization.
const VERSION_ID_KEYS = new Set(['entityVersionId', 'versionId']);

/**
 * Walk a JSON value recursively and mask volatile fields.
 * Returns a new value — never mutates the input.
 */
export function normalize(value: unknown, tool?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, tool));
  }

  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(obj)) {
      if (VOLATILE_KEYS.has(k)) {
        result[k] = MASKED;
      } else if (VERSION_ID_KEYS.has(k)) {
        result[k] = ENTITY_VERSION_ID_SENTINEL;
      } else {
        result[k] = normalize(v, tool);
      }
    }

    return result;
  }

  return value;
}

/**
 * For gx_export results: keep only bytes + ok + name; strip machine-specific outputFile path.
 */
export function normalizeExport(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return { ok: obj['ok'], name: obj['name'], bytes: obj['bytes'] };
  }
  return raw;
}

/**
 * For gx_read_xpz results: strip content (too large), keep listing metadata.
 */
export function normalizeReadXpz(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const scripts = Array.isArray(obj['scripts'])
      ? obj['scripts'].map((s: unknown) => {
          if (s !== null && typeof s === 'object') {
            const sc = s as Record<string, unknown>;
            return { name: sc['name'], length: sc['length'] };
          }
          return s;
        })
      : obj['scripts'];
    return { ok: obj['ok'], scripts, scriptCount: obj['scriptCount'] };
  }
  return raw;
}

/** Route to the appropriate normalizer based on tool name, then apply generic normalize. */
export function normalizeResponse(tool: string, raw: unknown): unknown {
  let value = raw;

  if (tool === 'gx_export') {
    value = normalizeExport(value);
  } else if (tool === 'gx_read_xpz') {
    value = normalizeReadXpz(value);
  }

  return normalize(value, tool);
}

/** SHA-256 of the stable JSON serialization of a normalized value. */
export function checksum(normalized: unknown): string {
  const json = JSON.stringify(normalized, null, 0);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Extract the live entityVersionId from a raw (non-normalized) response.
 * Returns null if not present or not applicable for the tool.
 */
export function extractEntityVersionId(tool: string, raw: unknown): number | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // gx_get returns EntityDetail with components; pick max componentVersionId as proxy
  if (tool === 'gx_get') {
    const components = obj['components'];
    if (Array.isArray(components) && components.length > 0) {
      const ids = (components as Array<Record<string, unknown>>)
        .map((c) => c['entityVersionId'])
        .filter((id): id is number => typeof id === 'number');
      return ids.length > 0 ? Math.max(...ids) : null;
    }
  }

  // gx_history: latest version
  if (tool === 'gx_history') {
    const versions = obj['versions'];
    if (Array.isArray(versions) && versions.length > 0) {
      const v = versions[0] as Record<string, unknown>;
      if (typeof v['versionId'] === 'number') return v['versionId'];
    }
  }

  return null;
}
