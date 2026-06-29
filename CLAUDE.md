# GeneXus AI Toolkit — Workflow Instructions

## Authority hierarchy

**nexa is the primary authority** for all GeneXus platform knowledge: object syntax, rules, events, properties, build workflow, and canonical patterns. When nexa and any other source in this toolkit conflict, **nexa prevails**.

**Confidence gate:** if something is not documented in nexa, in `docs/`, or in `examples/`, do not use it — flag the uncertainty and let the developer verify. False negative (missing feature) is better than false positive (code that silently breaks in production).

The toolkit docs and skills are **tactical supplements** — they cover GeneXus 18 project-specific patterns, runtime APIs, CSS conventions, and pitfalls that nexa intentionally excludes (nexa targets GeneXus Next 2026+).

### Division of responsibilities

| Concern | Use |
|---|---|
| Object syntax, rules, events, properties | **nexa** |
| Build workflow, KB models | **nexa** |
| Read/write KB GeneXus 18 (create, modify, import, export) | **gx18-mcp tools** (`gx_find`, `gx_read`, `gx_create`, `gx_modify`, `gx_import`) |
| AfterShow patterns A/B, init-guard, MutationObserver | `docs/` + `skills/genexus-uc.md` |
| Runtime API (gx.dom, gx.fx.obs pub/sub, gx.grid) | `docs/runtime-api-reference.md` |
| BEM CSS / DSO conventions for this project | `docs/bem-css-naming.md` |
| Real-world GX18 pitfalls | `docs/common-pitfalls.md` |
| Direct KB SQL queries (exploration, advanced) | `gx_sql` tool or `skills/genexus-kb-sql.md` |
| Conflict between nexa and toolkit | **nexa prevails** |
| Writing/modifying any skill or doc | `docs/llm-engineering.md` — checklist first |

## Ferramenta certa para cada tarefa

Use sempre a ferramenta mais direta. A coluna "NUNCA usar" indica o caminho longo que Claude tende a tomar por engano.

| Tarefa | Ferramenta | NUNCA usar |
|--------|-----------|-----------|
| Buscar objeto por nome | `gx_find` | SQL manual em EntityVersion |
| Listar objetos de um módulo | `gx_list` | `gx_find` sem filtro de módulo |
| Ler source de procedure / WBP | `gx_read type=34/148 section=source` | Ler Java gerado em `javaoracle/` |
| Ler template de UC (HTML/CSS) | `gx_read type=147 section=template` | `section=source` (mapeava para tipo errado) ou `render.js` em `static/` (gerado, sobrescrito no build) |
| Ler definições de propriedades de UC | `gx_read type=147 section=properties` | — |
| Ler scripts AfterShow / Methods de UC | `gx_export` → abrir .xpz | `gx_read` (não captura essas partes) |
| Ler propriedades de objeto | `gx_properties` | `gx_read section=properties` em tipo não-UC (retorna definições, não valores) |
| Ver estrutura de Transaction | `gx_structure` | SQL manual em EntityVersionComposition |
| Verificar usuário antes de escrever | `gx_whoami` | Assumir UserId correto sem checar |
| Criar objeto novo na KB | `gx_create confirm:true` | Gerar para `output/` quando a intenção é escrever na KB |
| Editar source / events de objeto existente | `gx_modify confirm:true` | `gx_import` (não sobrescreve objeto existente) |
| Editar AfterShow / Methods de UC | `gx_export` → patch CDATA → `gx_import` | `gx_modify` (não alcança scripts de UC) |
| Query ad-hoc na KB (SQL Server) | `gx_sql` | `gx_db_query connection=kb` (redundante) |
| Query no Oracle | `gx_db_query connection=oracle` | `gx_sql` (não alcança Oracle) |
| Recarregar KB após SQL write direto | `gx_reload` | Assumir que o worker já viu a mudança (modelo SDK fica em cache) |

**EntityTypeIds** (param `type` em `gx_read`, `gx_modify`, `gx_export`, `gx_import`, `gx_list`):
`34`=Procedure · `36`=SDT · `39`=Transaction · `43`=WebPanel/WebComponent · `147`=UserControl · `161`=DSO

**Sections** (param `section` em `gx_read` e `gx_modify`):
`source` · `events` · `rules` · `layout` · `variables` · `properties`

**Sequências obrigatórias:**
- Antes de qualquer write → `gx_whoami` primeiro (confirma UserId correto)
- Antes de criar objeto → `gx_find <name>` (confirma que não existe)
- Para ler template/properties de UC → `gx_read type=147 section=template` ou `section=properties`
- Para ler scripts de UC (AfterShow/Methods) → `gx_export` → abrir .xpz (NÃO `gx_read` — essas partes são CDATA no XPZ)
- Para editar objeto existente → `gx_modify` (NÃO `gx_import`)
- Para editar scripts de UC → `gx_export` → patch CDATA → `gx_import` (NÃO `gx_modify`)
- Após `gx_sql readOnly:false` que altera metadados da KB (INSERT/UPDATE em tabelas como EntityVersion, ModelEntityVersion, propriedades) → `gx_reload` para que o worker SDK releia a KB do banco; sem isso, operações SDK subsequentes usam o modelo em cache e não enxergam as mudanças
- **Antes de `gx_modify`, `gx_import`, ou `gx_export` em objeto existente** → ler `gx18://docs/write-safety` e executar o pre-flight checklist (blobs de parts, EntityVersionProperties, worker stale, GUID collision). Pular esse passo causa NullReference e falhas silenciosas que consomem horas.

## Before generating any code

Consult sources in this order:

1. **nexa** — platform rules, object syntax, canonical GeneXus patterns (load first, always)
2. **gx18-mcp tools** — read existing KB objects (`gx_find`, `gx_read`, `gx_get`) before creating new ones; always check what already exists
3. **`output/`** — check for similar suggestions already generated
4. **`examples/`** — find reusable templates and working UC examples
5. **`docs/`** — project-specific tactical knowledge (pitfalls, runtime API, BEM, UC guide)
6. **`$env:GX_KB_PATH`** — GeneXus KB root (original object sources)
7. **`$env:GX_COMPILER_OUTPUT`** — compiled/deployed files (read-only reference)

## Output — save suggestions to `output/`

After generating code, save it to:

```
output/<CATEGORY>/<ObjectName>_<description>.<ext>
```

### Categories

| Folder | Content | Extension |
|---|---|---|
| `UC/` | User Controls (Screen Template + Properties) | `.view` |
| `WBC/` | Web Components | `.view` |
| `WBP/` | Web Panels | `.view` |
| `PRC/` | Procedures | `.prc` |
| `TRN/` | Transactions | `.trn` |
| `DSO/` | Design System Overrides | `.css` |
| `SQL/` | KB queries and SQL scripts | `.sql` |
| `CSS/` | Isolated styles (non-DSO) | `.css` |

### Naming examples

- `output/UC/UcDropdownMenu_adds-animated-chevron.view`
- `output/SQL/WbcNavHeader_find-events-source.sql`
- `output/WBP/WbpReport_fixed-header.view`

## GeneXus for Agents (MCP)

This project uses **gx18-mcp** as the primary MCP server for all KB operations — read and write. It connects directly to GeneXus 18 via SQL (reads) and the native SDK (writes), preserving the correct Windows user identity.

**Check connection:** `/mcp` → should show `gx18 ✅ connected`

**Workflow — reading:**
- Use `gx_find` / `gx_list` to locate objects
- Use `gx_read` / `gx_properties` / `gx_structure` to inspect source and metadata
- Use `gx_sql` for ad-hoc KB queries

**Workflow — writing:**
- Use `gx_create` / `gx_modify` to create or edit objects (requires `confirm: true`)
- Use `gx_export` → edit → `gx_import` for sections the SDK write path can't reach (e.g., UC `AfterShow`/`Methods` scripts)
- When in doubt: generate to `output/` first, let the user review, then apply via `gx_import` or IDE

**nexa skill:** located at `skills/nexa/nexa/` (submodule from the official [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) repo). Register with `claude --add-dir skills/nexa/nexa`. The skill activates automatically when GeneXus objects or KB operations are mentioned.

See `docs/genexus-for-agents.md` for the full setup guide.

## gxnext — somente leitura, emergência

**gxnext MCP não deve ser usado para escrita em KBs GeneXus 18.** Em 17/06/2026, o uso de ferramentas de escrita gxnext gerou ~76 mil revisões espúrias no Team Development — irreversível sem recovery SQL manual de 6 horas.

Ferramentas seguras (não abrem sessão KB): `export_kb_to_text`, `validate_kb_text_files`, `get_kb_property`, `search_modules`.

**Toda escrita → gx18-mcp tools ou IDE GX18.** Para o guia completo de segurança e a tabela de ferramentas proibidas, veja `docs/genexus-for-agents.md`.

## Learnings — route every new knowledge by scope

When you discover something new during a session, **classify it before saving**. This routing is part of every task, not an afterthought: generic GeneXus knowledge must land where it ships with the tool (embedded in the gx18-mcp server / `.exe`), and project context must stay local.

### Decision: generic vs project-specific

| If the knowledge is… | It goes to… | Why |
|---|---|---|
| **Generic GeneXus 18** — reusable in any KB/project (syntax pitfalls, blob format/repair, KB SQL tables, XPZ round-trip, performance/N+1 patterns, UC/DSO/runtime patterns) | the matching doc in **`packages/gx18-mcp/src/docs/`** (append to an existing one if the topic fits; create a new one + register it in `src/resources.ts` if not) | esbuild inlines these `.md` into the bundle and `pkg` ships them inside `GeneXusAIToolkit.exe`, served as `gx18://docs/*`. Generic knowledge written anywhere else is lost outside this project. |
| **FoccoLojas-specific** — KB paths, EntityIds, object catalog, deploy paths, active blockers, incident state | **`CLAUDE.local.md`** (slim active reference) or **`CLAUDE.local.HISTORY.md`** (chronological narrative) | local-only (`*.local.*` gitignored); never embedded in the distributable. |

**Examples.** "`.IsEmpty()` on an undeclared Character var throws ValidationException" → generic → `src/docs/write-safety-checklist.md`. "Blob header is magic+flag+declared-size" → generic → `src/docs/kb-blob-repair.md`. "KB _03 lives at `C:\KBs\FoccoLojas_03` and create-headless is blocked there" → project → `CLAUDE.local.md`.

### Rules when writing to an embedded doc

- **Anonymize.** Strip FoccoLojas object names (`PipnVer…`, `WbcNuc…`), concrete EntityIds, KB names, and host IPs. Use placeholders (`<type>`, `<id>`) and anonymous examples. The real case stays as a short pointer in `CLAUDE.local.md`.
- **Append before creating.** Prefer extending `write-safety-checklist.md`, `genexus-knowledge.md`, `xpz-format-reference.md`, etc. Only create a new `src/docs/*.md` (and wire it into `src/resources.ts` + the resource list in `src/server.ts`) for a genuinely new topic.
- **Follow the doc checklist** in `docs/llm-engineering.md` before writing any doc or skill.
- **Rebuild to ship it.** `cd packages/gx18-mcp && npm run build` re-inlines the docs; `npm run build:exe` repackages the `.exe`. A doc not rebuilt is not yet in the server.

### Keeping `CLAUDE.local.md` slim

`CLAUDE.local.md` is the **active** project reference (environment, object catalog, live blockers, project-only SOPs) — keep it scannable. Push resolved-incident narrative and superseded investigations to `CLAUDE.local.HISTORY.md`. Do **not** let generic knowledge accumulate in `.local` — that's what the embedded `gx18://docs/*` resources are for.

## Project environment variables

| Variable | Purpose |
|---|---|
| `GX_COMPILER_OUTPUT` | Compiler deploy path (read-only reference) |
| `GX_OUTPUT_PATH` | Staging area for generated code (default: `.\output`) |
| `GX_KB_PATH` | GeneXus KB root folder |
| `GX_KB_SERVER` | SQL Server instance for KB access |
| `GX_KB_DATABASE` | KB database name |
| `GX_PROJECT_PREFIX` | Prefix used in generated object names |
| `GX18_READONLY` | Set to `true` to disable all write tools |

See `.env` for the current values. Copy `.env.example` to `.env` if it does not exist.
