# output/

This folder is the **staging area** for AI-generated GeneXus code, organized by object type.

## Workflow

1. AI consults `output/`, `examples/`, `docs/`, KB paths, and SQL before generating
2. AI generates the code and saves it here, categorized by type
3. You open the file, copy the content
4. Paste into your GeneXus IDE (Screen Template / Properties / DSO editor)
5. Build and test

## Folder structure

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

### File naming

```
output/<CATEGORY>/<ObjectName>_<description>.<ext>
```

Examples:
- `output/UC/UcDropdownMenu_adiciona-chevron-animado.view`
- `output/SQL/GXC_ClientesCidade_busca-por-estado.sql`

## This folder is NOT versioned

`/output/*` is in `.gitignore` (except this README and `.gitkeep`).
Your generated code stays local — don't commit it unless you intentionally move it to `examples/`.
