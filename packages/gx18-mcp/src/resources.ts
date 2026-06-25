import { Resource } from '@modelcontextprotocol/sdk/types.js';
import quickReference from './docs/quick-reference.md';
import usageGuide from './docs/usage-guide.md';
import xpzWorkflow from './docs/xpz-workflow.md';
import genexusKnowledge from './docs/genexus-knowledge.md';
import writeSafetyChecklist from './docs/write-safety-checklist.md';
import xpzFormatRef from './docs/xpz-format-reference.md';
import spec from '../spec/entity-types.json';
import userControlsGuide from '../../../docs/user-controls-guide.md';
import runtimeApi from '../../../docs/runtime-api-reference.md';
import commonPitfalls from '../../../docs/common-pitfalls.md';
import bemCssNaming from '../../../docs/bem-css-naming.md';
import kbSqlReference from '../../../docs/kb-sql-reference.md';
import skillUc from '../../../skills/genexus-uc.md';
import skillKbSql from '../../../skills/genexus-kb-sql.md';
import skillExpert from '../../../skills/genexus-expert.md';

// Both .md imports are resolved by esbuild at build time (loader: { '.md': 'text' })
// and inlined as string literals — no file system access at runtime.

const QUICK_REFERENCE_URI = 'gx18://docs/quick-reference';
const USAGE_GUIDE_URI = 'gx18://docs/usage-guide';
const ENTITY_TYPES_URI = 'gx18://docs/entity-types';
const XPZ_WORKFLOW_URI = 'gx18://docs/xpz-workflow';
const GENEXUS_KNOWLEDGE_URI = 'gx18://docs/genexus-knowledge';
const WRITE_SAFETY_URI = 'gx18://docs/write-safety';
const XPZ_FORMAT_REF_URI = 'gx18://docs/xpz-format-reference';
const USER_CONTROLS_URI = 'gx18://docs/user-controls';
const RUNTIME_API_URI = 'gx18://docs/runtime-api';
const COMMON_PITFALLS_URI = 'gx18://docs/pitfalls';
const BEM_CSS_URI = 'gx18://docs/css-conventions';
const KB_SQL_URI = 'gx18://docs/kb-sql';
const SKILL_UC_URI = 'gx18://skills/genexus-uc';
const SKILL_KB_SQL_URI = 'gx18://skills/kb-sql';
const SKILL_EXPERT_URI = 'gx18://skills/expert';

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
  {
    uri: XPZ_WORKFLOW_URI,
    name: 'XPZ Round-Trip Workflow',
    description:
      'Full annotated guide for the gx_export → gx_read_xpz → gx_patch_xpz → gx_import round-trip. ' +
      'The only path to read or edit UserControl AfterShow and Methods scripts. ' +
      'Covers pitfalls (CDATA ]]> restriction, fullOverwrite requirement, build-after-import).',
    mimeType: 'text/markdown',
  },
  {
    uri: GENEXUS_KNOWLEDGE_URI,
    name: 'GeneXus 18 Platform Knowledge',
    description:
      'GeneXus 18 platform reference for LLMs: object model, event lifecycle (Start/Refresh/Load/OnMessage), ' +
      'procedure and WebPanel syntax, UserControl AfterShow/MutationObserver patterns, DSO styles, ' +
      'Submit async pattern, special variables, module structure, and KB SQL key tables.',
    mimeType: 'text/markdown',
  },
  {
    uri: WRITE_SAFETY_URI,
    name: 'Write Safety Checklist',
    description:
      'MANDATORY pre-flight checklist before gx_modify, gx_import, or gx_export on existing objects. ' +
      'Covers: part blob validation, EntityVersionProperties check, worker kill after SQL, ' +
      'silent import failure diagnosis, GUID collision detection, SDT ATTCUSTOMTYPE vs idBasedOn, ' +
      'and GeneXus 18 syntax pitfalls. Read this before any write operation to avoid silent failures.',
    mimeType: 'text/markdown',
  },
  {
    uri: XPZ_FORMAT_REF_URI,
    name: 'XPZ Format Reference',
    description:
      'Complete XPZ archive format reference: XML schema (ExportFile root, Object attributes), ' +
      'EntityType GUIDs, Part type GUIDs, per-object structure (UC/SDT/Procedure/WBC), ' +
      'variable typing (ATTCUSTOMTYPE vs idBasedOn), silent-import failure modes, ' +
      'and PowerShell snippets for reading and generating XPZ files.',
    mimeType: 'text/markdown',
  },
  {
    uri: USER_CONTROLS_URI,
    name: 'User Controls Guide',
    description:
      'GeneXus 18 User Control guide: AfterShow patterns A/B, init-guard, MutationObserver, ' +
      'jQuery namespacing, Control Type constants, CSS prefixes, property types, ' +
      'passagem de dados entre UC e Web Panel, and project UC catalog.',
    mimeType: 'text/markdown',
  },
  {
    uri: RUNTIME_API_URI,
    name: 'GeneXus Runtime API Reference',
    description:
      'GeneXus 18 client-side runtime API: gx.dom (element access), gx.grid (grid control), ' +
      'gx.fx.obs pub/sub event bus, GeneXus object lifecycle hooks, and grid.onafterrender.',
    mimeType: 'text/markdown',
  },
  {
    uri: COMMON_PITFALLS_URI,
    name: 'Common GX18 Pitfalls',
    description:
      'Real-world GeneXus 18 pitfalls: event timing issues, AJAX Refresh edge cases, ' +
      'property type mismatches, UC lifecycle traps, and known SDK limitations.',
    mimeType: 'text/markdown',
  },
  {
    uri: BEM_CSS_URI,
    name: 'CSS & DSO Naming Conventions',
    description:
      'BEM CSS naming conventions for DSO and project styles: block/element/modifier rules, ' +
      'DSO import hierarchy, token usage, and GeneXus override patterns.',
    mimeType: 'text/markdown',
  },
  {
    uri: KB_SQL_URI,
    name: 'KB SQL Table Reference',
    description:
      'GeneXus 18 KB SQL table reference: EntityVersion, ModelEntityVersion, EntityVersionComposition, ' +
      'EntityPart, GZip blob decoding, and advanced query patterns for KB exploration.',
    mimeType: 'text/markdown',
  },
  {
    uri: SKILL_UC_URI,
    name: 'User Control Specialist Skill',
    description:
      'Skill for creating, refactoring, and debugging GeneXus 18 User Control objects: ' +
      'property definitions, Screen Template, AfterShow, data passing, MutationObserver, ' +
      'jQuery, Control Type, CSS conventions, and the project UC catalog.',
    mimeType: 'text/markdown',
  },
  {
    uri: SKILL_KB_SQL_URI,
    name: 'KB SQL Query Skill',
    description:
      'Skill for writing direct SQL queries against the GeneXus 18 KB (SQL Server): ' +
      'table mapping, GZip blob decoding, EntityTypeId reference, and query patterns.',
    mimeType: 'text/markdown',
  },
  {
    uri: SKILL_EXPERT_URI,
    name: 'GeneXus Expert Skill',
    description:
      'General GeneXus platform expertise skill: KB management, object modeling, ' +
      'artifact generation, build workflows, and technical guidance.',
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
    case XPZ_WORKFLOW_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: xpzWorkflow }] };
    case GENEXUS_KNOWLEDGE_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: genexusKnowledge }] };
    case WRITE_SAFETY_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: writeSafetyChecklist }] };
    case XPZ_FORMAT_REF_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: xpzFormatRef }] };
    case USER_CONTROLS_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: userControlsGuide }] };
    case RUNTIME_API_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: runtimeApi }] };
    case COMMON_PITFALLS_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: commonPitfalls }] };
    case BEM_CSS_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: bemCssNaming }] };
    case KB_SQL_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: kbSqlReference }] };
    case SKILL_UC_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: skillUc }] };
    case SKILL_KB_SQL_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: skillKbSql }] };
    case SKILL_EXPERT_URI:
      return { contents: [{ uri, mimeType: 'text/markdown', text: skillExpert }] };
    default:
      return null;
  }
}
