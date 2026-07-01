# GeneXus for Agents — Setup Guide

This guide covers how to connect AI clients to your GeneXus 18 Knowledge Base using **gx18-mcp**, and how to load the GeneXus language skill (nexa) for richer context.

---

## 1. gx18-mcp — Primary MCP server

`gx18-mcp` is the MCP server for GeneXus 18. It connects directly to the KB via SQL (reads) and the native GX18 SDK (writes), using your Windows identity — no foreign user IDs, no revision storms.

### Setup

**Option A — Standalone exe (no Node.js required):**

1. Download and extract `GeneXusAIToolkit-windows.zip` from the [latest release](https://github.com/lucaskarsten/genexus-ai-toolkit/releases/latest)
2. Double-click `GeneXusAIToolkit.exe` → browser opens with the setup UI
3. Fill in KB paths (or click **Auto-detectar KBs**)
4. Go to **Connections** → click **Register** for your AI client
5. Restart the client — `gx18 ✅ connected`

**Option B — npm:**

```bash
npm install -g gx18-mcp
gx18-mcp setup
```

**Option C — From this repo:**

```bash
cd packages/gx18-mcp
npm install && npm run build
node dist/bin/gx18-mcp.js ui
```

### Manual MCP registration

If you prefer to register manually instead of using the UI Connections tab:

**Claude Code:**
```bash
# Copy .mcp.json.example → .mcp.json and edit KB path, or:
claude mcp add gx18 -- node /path/to/gx18-mcp/dist/bin/gx18-mcp.js start
```

**Claude Desktop** — add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "gx18": {
      "command": "C:\\Tools\\GeneXusAIToolkit\\GeneXusAIToolkit.exe",
      "args": ["start"]
    }
  }
}
```

**VS Code / Cursor** — add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "gx18": {
      "type": "stdio",
      "command": "C:\\Tools\\GeneXusAIToolkit\\GeneXusAIToolkit.exe",
      "args": ["start"]
    }
  }
}
```

**OpenAI Codex CLI** — `codex.toml` in this repo is pre-configured:
```toml
[mcp_servers.gx18]
type = "stdio"
command = "npx"
args   = ["-y", "gx18-mcp", "start"]
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `GX_KB_PATH` | — | GeneXus KB root folder |
| `GX_KB_SERVER` | `(localdb)\MSSQLLocalDB` | SQL Server instance (keep the parentheses) |
| `GX_KB_DATABASE` | — | KB database name |
| `GX_18_DIR` | auto-detected | GeneXus 18 install folder |
| `GX18_READONLY` | `false` | Set `true` to disable all write tools |
| `ORACLE_HOST/PORT/SERVICE/USER/PASSWORD` | — | Oracle connection (for `gx_db_query`) |

Copy `.env.example` → `.env` and set `GX_KB_PATH`, `GX_KB_DATABASE`.

### Tool reference

| Tool | Type | What it does |
|---|---|---|
| `gx_find` / `gx_list` / `gx_get` | Read | Search and list KB objects |
| `gx_read` / `gx_properties` / `gx_structure` | Read | Source code, properties, structure |
| `gx_whoami` | Read | Current Windows user → KB UserId |
| `gx_sql` | Read | Direct SQL against the KB |
| `gx_db_connections` / `gx_db_query` | Read | Query KB or Oracle via named connections |
| `gx_create` / `gx_modify` | Write | Create or edit objects via the GX18 SDK |
| `gx_export` / `gx_import` | Write | Export/import `.xpz` (round-trip for UC scripts) |
| `gx_save_config` | Config | Update KB paths and restart the worker |

Write tools require `confirm: true`. Architecture details: [docs/gx18-mcp.md](gx18-mcp.md).

### Typical workflow

```
Prompt
  ↓
gx_find / gx_read   ← locate and inspect existing objects first
  ↓
gx_create / gx_modify  ← write directly to KB (SDK, UserId-verified)
  OR
output/ → IDE import   ← generate locally, user reviews, applies via IDE
  ↓
Build in GeneXus 18 IDE (gx_build is still a stub)
```

### Troubleshooting

**Worker doesn't start:**
```bash
node dist/bin/gx18-mcp.js doctor
```

**Can't connect to SQL Server:** check that `GX_KB_SERVER` includes parentheses: `(localdb)\MSSQLLocalDB`.

**Write fails with `UserId` assertion:** the KB is open in another process using a different Windows user. Close GeneXus IDE and retry.

---

## 2. Skills from genexus-skills

`skills/nexa/` is a git submodule from [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) — the official skills repo maintained by GeneXus Labs. It ships 6 skills; all are already on disk once the submodule is initialized.

### nexa — GeneXus language authority

Covers 24+ object types, all rules/events/properties, and the full language spec.

**When to load:** any task involving Transaction structure, Procedure rules, SDT design, domain types, KB model decisions, or anything that requires the authoritative GeneXus language spec.

```bash
claude --add-dir skills/nexa/nexa
```

### Chameleon Controls Library — Web Panel UI components

60+ web components (`ch-accordion`, `ch-chat`, `ch-grid`, `ch-code-editor`, …) used in GeneXus 18 Web Panels. Covers Angular, React, Stencil, and vanilla JS/TS integration.

**When to load:** building or debugging any Web Panel UI that uses Chameleon components.

```bash
claude --add-dir skills/nexa/frontend/chameleon-controls-library
```

### Design System Builder + Mercury

Two complementary skills for enterprise CSS design systems atop Chameleon: `design-system-builder` covers ITCSS layers, tokens, multi-brand, light/dark from scratch; `mercury-design-system` is the pre-configured Mercury (blue) / Globant (green) theme with 39 CSS bundles, 500+ icons, and WCAG AA compliance.

**When to load:** DSO token design, custom design system work, or using the Mercury theme.

```bash
claude --add-dir skills/nexa/frontend/design-system-builder
claude --add-dir skills/nexa/frontend/mercury-design-system
```

### Update submodule

```bash
git submodule update --remote skills/nexa
```

For quick GX18 patterns (JS ES5, AfterShow, DSO), `skills/genexus-expert.md` is sufficient without loading the submodule skills.

---

## 3. gxnext — optional, read-only only

The official GeneXus MCP server (GeneXus Next 2026+). **Not required** for gx18-mcp workflow. Use it only if you also run GeneXus Next and need its specific tooling.

> **Critical — do NOT use gxnext write tools against a GeneXus 18 KB.** On 2026-06-17, using write tools on a GX18 KB generated ~76,000 false `EntityVersion` rows in Team Development — reversible only with 6 hours of SQL recovery work.

### Safe vs forbidden tools (for GX18 KBs)

| gxnext tool | Effect on GX18 KB |
|---|---|
| `export_kb_to_text` | ✅ Safe — reads SQL directly, no session opened |
| `validate_kb_text_files` | ✅ Safe — validates local files only |
| `get_kb_property` | ✅ Safe — config read |
| `search_modules` | ✅ Safe — metadata read |
| `open_knowledge_base` | ⚠️ Creates revision rows for every object processed |
| `import_text_to_kb` | ⚠️ Opens KB + writes objects with wrong UserId |
| `import_knowledge_manager` | ⚠️ Mass import + KB open |
| `build_all` / `build_one` / `compile_object` | ⚠️ Compiles + saves implicitly |
| `reorganize` | ⚠️ Rewrites internal KB structure |
| `create_or_impact_database` | ⚠️ Modifies deploy database |
| `set_kb_property` / `reset_kb_property` | ⚠️ Alters KB config |
| `install_module` / `update_module` / `restore_module` | ⚠️ Installs/updates modules |

**Rule:** if the user did not explicitly request a write operation in this message, do not call it. Use `output/` for staging; let the user apply via gx18-mcp or the IDE.

### Starting gxnext (Docker)

```powershell
.\scripts\optional\start-gxnext.ps1
```

Reads `GX_DOCKER_FOLDER` and `GX_MCP_PORT` from `.env`. Waits for the IDE (`localhost:3000`) and MCP (`localhost:8001`) to be ready.

### Registering gxnext in Claude Code (optional)

```bash
# Copy .mcp.json.example → .mcp.json, then uncomment the gxnext-readonly entry
# Or add manually:
claude mcp add --transport http gxnext-readonly http://localhost:8001/mcp
```

### import_text_to_kb — clean temp directory

If you ever need `import_text_to_kb` (only on GeneXus Next KBs, never GX18), use a temp directory containing **only the target files**. Importing from the project root causes MCP transport timeout from the volume of files.

```
output/<CATEGORY>/tmp_import/
  src/
    <Module>/<SubModule>/TargetObject.webcomponent.layout.xml
  src.ns/
    Themes/TargetDSO.designsystem.main.gx
```

---

## References

- [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) — nexa official skill
- [GeneXus for Agents — official docs](https://wiki.genexus.com/commwiki/wiki?61619) (GeneXus Next)
- [openai/codex](https://github.com/openai/codex) — Codex CLI
