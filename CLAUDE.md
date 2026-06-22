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

## Learnings

If you discover something new about the project environment during a session (a new path, an undocumented API, unexpected SQL structure), record it using the project memory system.

**Project-specific knowledge** (KB paths, object locations, new objects created, SQL findings, deploy paths, naming patterns) goes into `CLAUDE.local.md` at the project root — not in memory. That file is local-only (`*.local.*` is gitignored) and is the single source of truth for the active project's context. Update it proactively whenever you learn something that would help a future session understand the environment faster.

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
