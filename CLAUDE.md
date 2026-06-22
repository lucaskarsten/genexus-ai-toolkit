# GeneXus AI Toolkit — Workflow Instructions

## Authority hierarchy

**nexa is the primary authority** for all GeneXus platform knowledge: object syntax, rules, events, properties, build workflow, and canonical patterns. When nexa and any other source in this toolkit conflict, **nexa prevails**.

**Confidence gate:** if something is not documented in nexa, in `docs/`, or in `examples/`, do not use it — flag the uncertainty and let the developer verify. False negative (missing feature) is better than false positive (code that silently breaks in production).

The toolkit docs and skills are **tactical supplements** — they cover GeneXus 18 project-specific patterns, runtime APIs, CSS conventions, and pitfalls that nexa intentionally excludes (nexa targets GeneXus Next 2026+).

### Division of responsibilities

| Concern | Use |
|---|---|
| Object syntax, rules, events, properties | **nexa** |
| Build, gxnext/MCP workflow, KB models | **nexa** |
| AfterShow patterns A/B, init-guard, MutationObserver | `docs/` + `skills/genexus-uc.md` |
| Runtime API (gx.dom, gx.fx.obs pub/sub, gx.grid) | `docs/runtime-api-reference.md` |
| BEM CSS / DSO conventions for this project | `docs/bem-css-naming.md` |
| Real-world GX18 pitfalls | `docs/common-pitfalls.md` |
| Direct KB SQL + PowerShell access (no IDE) | `skills/genexus-kb-sql.md` |
| Conflict between nexa and toolkit | **nexa prevails** |
| Writing/modifying any skill or doc | `docs/llm-engineering.md` — checklist first |

## Before generating any code

Consult sources in this order:

1. **nexa** — platform rules, object syntax, canonical GeneXus patterns (load first, always)
2. **`output/`** — check for similar suggestions already generated
3. **`examples/`** — find reusable templates and working UC examples
4. **`docs/`** — project-specific tactical knowledge (pitfalls, runtime API, BEM, UC guide)
5. **`$env:GX_KB_PATH`** — GeneXus KB root (original object sources)
6. **`$env:GX_COMPILER_OUTPUT`** — compiled/deployed files (read-only reference)
7. **SQL on `$env:GX_KB_DATABASE`** — real object and attribute structure

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

This project includes `.mcp.json` with the `gxnext` server pre-configured (`http://localhost:8001/mcp`). Requires GeneXus Next 2026.01+ running.

**Check connection:** `/mcp` → should show `gxnext ✅ connected`

**When to use gxnext vs. file output:**
- Use `gxnext` tools to create/modify objects directly in the KB (Transaction, WebPanel, Procedure, build) — nexa's hierarchical `src/` paths apply here
- Use the `output/` file approach when the user wants to review before applying — flat `output/<CATEGORY>/` paths are local staging (gitignored)

**nexa skill:** located at `skills/nexa/nexa/` (submodule from the official [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) repo). Register with `claude --add-dir skills/nexa/nexa`. The skill activates automatically when GeneXus objects or KB operations are mentioned.

See `docs/genexus-for-agents.md` for the full setup guide.

## Ferramentas gxnext: regras de segurança

**Nunca chame as ferramentas abaixo sem confirmação explícita do usuário na mensagem atual.** Cada chamada cria revisões na KB para todos os objetos processados — mesmo que o conteúdo não mude. Isso polui o histórico do Team Development e é irreversível sem revert manual.

| Ferramenta | Risco |
|---|---|
| `import_text_to_kb` | Cria revisões na KB para todos os objetos importados |
| `import_knowledge_manager` | Importação em massa na KB |
| `reorganize` | Reescreve estrutura interna da KB |
| `create_or_impact_database` | Altera banco de dados de deploy |
| `set_kb_property` / `reset_kb_property` | Altera configurações da KB |
| `install_module` / `update_module` / `restore_module` / `add_modules_server` | Instala/atualiza módulos na KB |
| `build_all` / `build_one` / `compile_object` | Compila objetos (salva implicitamente na KB) |

**Ferramentas seguras (somente leitura):** `export_kb_to_text`, `export_knowledge_manager`, `validate_kb_text_files`, `get_kb_property`, `search_modules`, `open_knowledge_base`, `close_knowledge_base`.

**Regra:** se o usuário não pediu explicitamente uma operação de escrita nesta mensagem, não a execute. Use `output/` como staging e deixe o usuário aplicar manualmente via IDE.

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

See `.env` for the current values. Copy `.env.example` to `.env` if it does not exist.
