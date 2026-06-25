// Golden object catalog — 2 stable, well-documented objects per GeneXus type.
// EntityIds marked null need verification via `npm run benchmark:drift` before first capture.

export interface GoldenObject {
  /** Stable key used in fixture filenames, e.g. "PrcNucIncrementaContagem" */
  key: string;
  name: string;
  entityTypeId: number;
  typeKey: string;
  /** Known entityId — cross-checked by drift command. null = needs verification. */
  entityId: number | null;
  /** Sections to exercise with gx_read (per spec/entity-types.json). */
  readSections: string[];
  hasStructure: boolean;  // gx_structure applies (SDT, Transaction)
  hasVariables: boolean;  // gx_variable action:list applies (PRC, WBP/WBC, UC)
  hasLint: boolean;       // gx_lint is type-scoped, flag marks UC/DSO objects
  hasXpz: boolean;        // gx_export + gx_read_xpz listing applies (UC only)
}

export const GOLDEN_CATALOG: GoldenObject[] = [
  // ── Procedure (EntityTypeId 34) ─────────────────────────────────────────────
  {
    key: 'PrcNucIncrementaContagem',
    name: 'PrcNucIncrementaContagem',
    entityTypeId: 34,
    typeKey: 'procedure',
    entityId: 7051,
    readSections: ['source', 'rules'],
    hasStructure: false,
    hasVariables: true,
    hasLint: false,
    hasXpz: false,
  },
  {
    key: 'PrcNucRetMaisUsados',
    name: 'PrcNucRetMaisUsados',
    entityTypeId: 34,
    typeKey: 'procedure',
    entityId: 7052,
    readSections: ['source', 'rules'],
    hasStructure: false,
    hasVariables: true,
    hasLint: false,
    hasXpz: false,
  },

  // ── SDT (EntityTypeId 36) ────────────────────────────────────────────────────
  {
    key: 'SdtNucAcessoPrograma',
    name: 'SdtNucAcessoPrograma',
    entityTypeId: 36,
    typeKey: 'sdt',
    entityId: 1788,
    readSections: [],
    hasStructure: true,
    hasVariables: false,
    hasLint: false,
    hasXpz: false,
  },
  {
    key: 'SdtNucContext',
    name: 'SdtNucContext',
    entityTypeId: 36,
    typeKey: 'sdt',
    entityId: 615,
    readSections: [],
    hasStructure: true,
    hasVariables: false,
    hasLint: false,
    hasXpz: false,
  },

  // ── Transaction (EntityTypeId 39) ────────────────────────────────────────────
  {
    key: 'TrnNucLoja',
    name: 'TrnNucLoja',
    entityTypeId: 39,
    typeKey: 'transaction',
    entityId: 205,
    readSections: ['rules', 'events'],
    hasStructure: true,
    hasVariables: false,
    hasLint: false,
    hasXpz: false,
  },
  {
    key: 'TrnNucPais',
    name: 'TrnNucPais',
    entityTypeId: 39,
    typeKey: 'transaction',
    entityId: 138,
    readSections: ['rules'],
    hasStructure: true,
    hasVariables: false,
    hasLint: false,
    hasXpz: false,
  },

  // ── WebPanel / WebComponent (EntityTypeId 43) ────────────────────────────────
  {
    key: 'WbcVenMeusClientesRecentes',
    name: 'WbcVenMeusClientesRecentes',
    entityTypeId: 43,
    typeKey: 'webpanel',
    entityId: 1091,
    readSections: ['events', 'rules', 'layout'],
    hasStructure: false,
    hasVariables: true,
    hasLint: false,
    hasXpz: false,
  },
  {
    key: 'WbcNucMenu',
    name: 'WbcNucMenu',
    entityTypeId: 43,
    typeKey: 'webpanel',
    entityId: 1432,
    readSections: ['events', 'layout'],
    hasStructure: false,
    hasVariables: true,
    hasLint: false,
    hasXpz: false,
  },

  // ── UserControl (EntityTypeId 147) ───────────────────────────────────────────
  {
    key: 'UCTooltip',
    name: 'UCTooltip',
    entityTypeId: 147,
    typeKey: 'usercontrol',
    entityId: 5,
    readSections: ['template', 'properties'],
    hasStructure: false,
    hasVariables: false,
    hasLint: true,
    hasXpz: true,
  },
  {
    key: 'UcNucIAInsight',
    name: 'UcNucIAInsight',
    entityTypeId: 147,
    typeKey: 'usercontrol',
    entityId: 56,
    readSections: ['template', 'properties'],
    hasStructure: false,
    hasVariables: false,
    hasLint: true,
    hasXpz: true,
  },

  // ── DSO (EntityTypeId 161) ───────────────────────────────────────────────────
  {
    key: 'DsoFoccoLojas',
    name: 'DsoFoccoLojas',
    entityTypeId: 161,
    typeKey: 'dso',
    entityId: 9,
    readSections: ['source'],
    hasStructure: false,
    hasVariables: false,
    hasLint: true,
    hasXpz: false,
  },
  {
    key: 'DsoBase',
    name: 'DsoBase',
    entityTypeId: 161,
    typeKey: 'dso',
    entityId: 12,
    readSections: ['source'],
    hasStructure: false,
    hasVariables: false,
    hasLint: true,
    hasXpz: false,
  },
];
