# GeneXus AI Toolkit — Workflow Instructions

## Before generating any code

Consult sources in this order:

1. **`output/`** — check for similar suggestions already generated
2. **`examples/`** — find reusable templates and working UC examples
3. **`docs/`** — consult the relevant technical guide before implementing
4. **`$env:GX_KB_PATH`** — GeneXus KB root (original object sources)
5. **`$env:GX_COMPILER_OUTPUT`** — compiled/deployed files (read-only reference)
6. **SQL on `$env:GX_KB_DATABASE`** — real object and attribute structure

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

## Learnings

If you discover something new about the project environment during a session (a new path, an undocumented API, unexpected SQL structure), record it using the project memory system.

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
