import { Resource } from '@modelcontextprotocol/sdk/types.js';
import quickReference from './docs/quick-reference.md';
import usageGuide from './docs/usage-guide.md';
import spec from '../spec/entity-types.json';

// Both .md imports are resolved by esbuild at build time (loader: { '.md': 'text' })
// and inlined as string literals — no file system access at runtime.

const QUICK_REFERENCE_URI = 'gx18://docs/quick-reference';
const USAGE_GUIDE_URI = 'gx18://docs/usage-guide';
const ENTITY_TYPES_URI = 'gx18://docs/entity-types';

export const RESOURCES: Resource[] = [
  {
    uri: QUICK_REFERENCE_URI,
    name: 'gx18-mcp Quick Reference',
    description:
      'Task→tool decision table, EntityTypeIds, sections, mandatory sequences, and safety rules. ' +
      'Read this first to know which tool to use for each GeneXus KB operation.',
    mimeType: 'text/markdown',
  },
  {
    uri: USAGE_GUIDE_URI,
    name: 'gx18-mcp Usage Guide',
    description:
      'Complete usage guide: tool reference, anti-patterns with rationale, full workflow sequences, ' +
      'write tool examples, and security rules.',
    mimeType: 'text/markdown',
  },
  {
    uri: ENTITY_TYPES_URI,
    name: 'GeneXus 18 Entity Types Reference',
    description:
      'All supported object types with their EntityTypeId, SDK type, write support status, ' +
      'and available sections. Derived from the canonical entity-types.json spec.',
    mimeType: 'text/markdown',
  },
];

function buildEntityTypesDoc(): string {
  const lines: string[] = [
    '# GeneXus 18 Entity Types Reference',
    '',
    'Derived from the canonical `spec/entity-types.json`. Use the EntityTypeId as the `type`',
    'parameter in `gx_read`, `gx_modify`, `gx_export`, `gx_import`, and `gx_list`.',
    '',
    '## Object Types',
    '',
    '| EntityTypeId | Key | Display Name | Write Supported | Sections |',
    '|---|---|---|---|---|',
  ];

  for (const t of spec.objectTypes) {
    const sections = t.sections.map((s: { key: string }) => `\`${s.key}\``).join(', ');
    const write = t.writeSupported ? '✅' : '⛔';
    lines.push(`| ${t.entityTypeId} | \`${t.key}\` | ${t.displayName} | ${write} | ${sections} |`);
  }

  lines.push('', '## EntityType Names (from KB SQL)', '');
  lines.push('These are the raw names returned by `gx_find` and `gx_list`:', '');
  lines.push('| EntityTypeId | Name |');
  lines.push('|---|---|');
  for (const [id, name] of Object.entries(spec.entityTypeNames)) {
    lines.push(`| ${id} | ${name} |`);
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- `43` is the SDK EntityTypeId for **both** WebPanel and WebComponent.',
    '  Raw SQL on `EntityVersion` may return different values depending on the KB version.',
    '  Always use `43` when calling gx18-mcp tools.',
    '- `gx_modify` accepts `type` as a numeric EntityTypeId and resolves it to the type key internally.',
    '- `gx_create` accepts `type` as a string key (e.g. `"procedure"`, `"webpanel"`).',
    '- `gx_import` accepts `type` as a string key (same as `gx_create`).',
  );

  return lines.join('\n');
}

interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

export function readResource(uri: string): { contents: ResourceContents[] } | null {
  switch (uri) {
    case QUICK_REFERENCE_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: quickReference }] };
    case USAGE_GUIDE_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: usageGuide }] };
    case ENTITY_TYPES_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: buildEntityTypesDoc() }] };
    default:
      return null;
  }
}
