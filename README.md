# GeneXus AI Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Discussions](https://img.shields.io/badge/discussions-welcome-blueviolet.svg)](https://github.com/lucaskarsten/genexus-ai-toolkit/discussions)
[![GeneXus](https://img.shields.io/badge/GeneXus-18-0078D4.svg)](https://www.genexus.com)

**Give any LLM deep GeneXus 18 expertise — generate correct UCs, DSOs, Web Panels, and Procedures on the first try. Read and write your Knowledge Base directly from Claude, VS Code, or any MCP-compatible AI client.**

Works with Claude Code, Claude Desktop, GitHub Copilot, VS Code, Cursor, OpenAI Codex CLI, and ChatGPT.

---

## Download & Quick Start

### Option 1 — Standalone exe (recommended for end users)

No Node.js, Git, or any prior install required.

1. Download `GeneXusAIToolkit-windows.zip` from the [latest release](https://github.com/lucaskarsten/genexus-ai-toolkit/releases/latest)
2. Extract to any folder (e.g., `C:\Tools\GeneXusAIToolkit\`)
3. Double-click `GeneXusAIToolkit.exe`
4. The browser opens automatically with the setup UI
5. Fill in your KB paths and click **Save** — the MCP server is now available on port `7337`

The `worker\` folder must stay next to the `.exe`. Don't move the executable alone.

On next launch, the `.exe` checks for updates in the background — when a new version is available it downloads and applies silently on close.

### Option 2 — npm

Requires Node.js 18+.

```bash
npm install -g gx18-mcp
gx18-mcp ui
```

### Option 3 — Clone (for contributors)

```bash
git clone --recurse-submodules https://github.com/lucaskarsten/genexus-ai-toolkit.git
cd genexus-ai-toolkit/packages/gx18-mcp
npm install
npm run build
node dist/bin/gx18-mcp.js ui
```

---

## Connect to Claude Desktop, VS Code, or Claude Code

After saving your KB paths, go to the **Connections** tab in the UI. Each supported client has a button:

| Button | What it does |
|---|---|
| **Register** (Claude Desktop) | Writes the `gx18` entry to `claude_desktop_config.json`. Auto-detects both the Microsoft Store install (`Packages\Claude_*`) and the standard install (`AppData\Roaming\Claude\`). |
| **Register** (VS Code) | Writes to `.vscode/mcp.json` in the current working directory. |
| **Register** (Claude Code project) | Writes to `.mcp.json` in the current directory — auto-detected when Claude Code opens the folder. |

After registering, **restart Claude Desktop or reload the VS Code window**.

The registered command points directly to the exe — no `npx` or Node.js needed at runtime:

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

---

## What your AI can do with this toolkit

| Without toolkit | With toolkit |
|---|---|
| Invents API names that don't exist | Uses only documented `gx.*` runtime APIs |
| Generates JS that breaks after AJAX Refresh | Applies correct AfterShow + MutationObserver patterns |
| Creates CSS that collides with GeneXus auto-classes | Follows BEM conventions and DSO structure |
| Guesses property types — breaks decimals silently | Knows `Type="numeric"` truncates; uses `string` + `Str()` |
| Produces untestable code | Delivers checklist-verified, multi-instance-safe UCs |
| Creates objects under the wrong user in Team Dev | Uses the GX18 SDK with your Windows identity — correct `UserId` on every save |

---

## Available MCP tools (gx18)

The `gx18` server exposes 19 tools to your AI client.

| Tool | Type | What it does |
|---|---|---|
| `gx_find` / `gx_list` / `gx_get` | Read | Search and list KB objects |
| `gx_read` / `gx_properties` / `gx_structure` | Read | Read source code, properties, and object structure |
| `gx_whoami` | Read | Current Windows user → KB UserId |
| `gx_sql` | Read | Run SQL directly against the KB database |
| `gx_db_connections` / `gx_db_query` | Read | Query KB (SQL Server) or Oracle via named connections |
| `gx_create` / `gx_modify` | Write | Create or edit objects via the GX18 SDK (UserId-verified) |
| `gx_export` | Write | Export an object to `.xpz` — also validates it |
| `gx_import` | Write | Import a `.xpz` into the KB (round-trip for UC scripts etc.) |
| `gx_set_property` / `gx_rename` / `gx_validate` / `gx_build` | Stub | Not yet implemented |
| `gx_save_config` | Config | Update KB paths and restart the worker — usable from chat |

Write tools require `confirm: true` and are disabled in read-only mode (`GX18_READONLY=true`).

---

## Skills — load GeneXus knowledge into your AI

Skills are Markdown files you load into your AI client. They give Claude (or any LLM) deep GeneXus 18 expertise as system context.

### `genexus-uc.md` — User Control Specialist

Expert context for creating, refactoring, and debugging GeneXus 18 UCs.

- AfterShow Pattern A (IIFE + init-guard) and Pattern B (`window["ucInit_"]` + setTimeout)
- MutationObserver for AJAX Refresh re-render
- SDT → JSON serialization (`Type="string"` + `decode()`)
- Floating dropdown, Control Type, jQuery namespace patterns
- 5-step decision path executed before any code is generated

```bash
# Claude Code
cp skills/genexus-uc.md ~/.claude/skills/
```

### `genexus-expert.md` — General GeneXus 18 Expert

Covers all GX18 object types with production-tested patterns, plus a quick reference for the most-used GeneXus language constructs (attribute types, rules, triggers) sourced from the nexa reference files.

```bash
cp skills/genexus-expert.md ~/.claude/skills/
cp skills/genexus-kb-sql.md ~/.claude/skills/
```

**ChatGPT / Copilot / other LLMs:** paste the contents of any `.md` skill file into your system prompt or custom instructions.

### `skills/nexa/` — Official GeneXus Skill (language authority)

The official [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) submodule. 24+ GeneXus object types, full language reference (rules, events, properties, data types). Load it when working on object structure, transaction design, or anything that requires the authoritative GeneXus language spec.

```bash
# Register with Claude Code
claude --add-dir skills/nexa/nexa

# Keep up to date
git submodule update --remote skills/nexa
```

---

## What's included

```
genexus-ai-toolkit/
├── packages/
│   └── gx18-mcp/              # GeneXus 18 MCP server (npm + standalone exe)
│       ├── bin/               # CLI entry points
│       ├── src/               # TypeScript source (tools, UI, SDK bridge, config)
│       │   ├── ui/            # Local web UI (Hono + HTML/JS page)
│       │   ├── sdk-bridge/    # C# worker IPC bridge
│       │   └── tools/         # MCP tool implementations
│       └── dist/worker/       # Pre-built C# worker + Oracle DLLs (committed)
├── skills/                    # AI skill files — load into your LLM
│   ├── genexus-uc.md          # User Control specialist (GX18)
│   ├── genexus-expert.md      # General GX18 expert + nexa language digest
│   ├── genexus-kb-sql.md      # Direct KB SQL access
│   └── nexa/                  # Official GeneXus Labs skill (submodule)
├── docs/                      # Technical reference guides
│   ├── user-controls-guide.md
│   ├── bem-css-naming.md
│   ├── common-pitfalls.md
│   ├── runtime-api-reference.md
│   ├── kb-sql-reference.md
│   ├── gx18-mcp.md            # gx18-mcp architecture and internals
│   ├── genexus-for-agents.md  # MCP setup for all AI clients
│   └── llm-engineering.md     # Prompt engineering guide for contributors
├── .claude/agents/            # Specialized Claude Code subagents
│   ├── gx-uc-builder.md       # UC creation and modification
│   ├── gx-wbp-builder.md      # Web Panel / Web Component wiring
│   ├── gx-kb-explorer.md      # KB reading via gx18-mcp + SQL
│   ├── gx-dso-designer.md     # DSO CSS + design tokens
│   └── gx-reviewer.md         # Code quality review
├── examples/                  # Ready-to-use templates
│   ├── user-controls/         # 4 fully working UC examples
│   ├── design-system/         # DSO template + design tokens
│   ├── web-panels/            # WBP example with pub/sub
│   └── templates/             # UC and DSO scaffolds
├── scripts/                   # PowerShell utilities
│   ├── sync-compiler-output.ps1
│   ├── discover-missing-assets.ps1
│   └── optional/
│       └── start-gxnext.ps1   # Start GeneXus Next Docker stack (optional)
├── output/                    # AI-generated files (gitignored, local only)
├── .mcp.json.example          # MCP config template (copy to .mcp.json)
└── codex.toml                 # OpenAI Codex CLI — MCP config (auto-detected)
```

---

## Supported AI clients

| Client | How to connect |
|---|---|
| **Claude Desktop** | Connections tab → Register. Auto-detects MS Store install path. |
| **VS Code Copilot** | Connections tab → Register (writes `.vscode/mcp.json`). Enable Agent mode in Copilot. |
| **Claude Code** | Connections tab → Register (writes `.mcp.json`). Auto-detected on project open. |
| **Cursor** | Register writes `.cursor/mcp.json`. Or copy `.vscode/mcp.json` → `.cursor/mcp.json`. |
| **OpenAI Codex CLI** | `codex.toml` is included in the repo — auto-detected on `codex` run. |
| **ChatGPT Desktop** | App settings → MCP → Add `http://localhost:7337/mcp` manually. |

---

## Example UCs

| UC | What it does |
|----|---|
| [`UcDropdownMenu`](examples/user-controls/UcDropdownMenu/) | Button + collapsible list, JSON-driven items, OnItemClick event |
| [`UcUserMenu`](examples/user-controls/UcUserMenu/) | Avatar + name + dropdown with logout/settings |
| [`UcToastNotification`](examples/user-controls/UcToastNotification/) | Toast alerts (success / error / warning / info) with auto-dismiss and `Show()` / `Hide()` methods |
| [`UcNavSearch`](examples/user-controls/UcNavSearch/) | Live-filter search, keyboard navigation (arrows + Escape), OnSelect event |

All four examples follow the same patterns — they are the ground truth the AI uses when generating new UCs.

---

## Reference docs

| Guide | Read when… |
|---|---|
| [user-controls-guide.md](docs/user-controls-guide.md) | Creating or editing any User Control |
| [bem-css-naming.md](docs/bem-css-naming.md) | Writing CSS for DSOs |
| [common-pitfalls.md](docs/common-pitfalls.md) | Debugging a UC that isn't working correctly |
| [runtime-api-reference.md](docs/runtime-api-reference.md) | Using `gx.fx.obs`, `gx.dom`, `gx.grid`, `gx.popup` |
| [kb-sql-reference.md](docs/kb-sql-reference.md) | Querying the KB directly via SQL |
| [gx18-mcp.md](docs/gx18-mcp.md) | gx18-mcp architecture, write support matrix, KB clone setup |
| [genexus-for-agents.md](docs/genexus-for-agents.md) | Setting up MCP for any AI client |
| [llm-engineering.md](docs/llm-engineering.md) | Writing or improving skills and docs |

---

## Environment variables

| Variable | Required for | Description |
|---|---|---|
| `GX_KB_PATH` | gx18 MCP | GeneXus KB root folder |
| `GX_KB_SERVER` | gx18 MCP | SQL Server instance (default: `(localdb)\MSSQLLocalDB`) |
| `GX_KB_DATABASE` | gx18 MCP | KB database name |
| `GX_18_DIR` | gx18 MCP | GeneXus 18 install folder (auto-detected if omitted) |
| `GX_OUTPUT_PATH` | Optional | Output folder for generated files (default: `.\output`) |
| `GX_PROJECT_PREFIX` | Optional | Prefix for generated object names (e.g. `Acme`) |
| `GX_COMPILER_OUTPUT` | Optional | GeneXus build output path (Tomcat / .NET) |
| `GX18_READONLY` | Optional | Set to `true` to disable all write tools |

The UI saves settings to `%LOCALAPPDATA%\gx18-mcp\config.json`. Environment variables override the saved config when both are set.

Copy `.env.example` → `.env` and fill in your values.

---

## For developers and contributors

### Build

```bash
cd packages/gx18-mcp
npm install
npm run build            # TypeScript → dist/
npm run build:worker     # C# SDK worker → dist/worker/
npm run build:exe        # Standalone exe → release/GeneXusAIToolkit.exe
npm test                 # Vitest unit tests
```

### Agents (Claude Code)

The `.claude/agents/` directory contains specialized subagents available when working in this project with Claude Code. They are automatically suggested when the task matches their description.

### nexa submodule

The `skills/nexa/` submodule is the authoritative GeneXus language reference maintained by GeneXus Labs. It is **not** part of this toolkit and is governed by its own license.

```bash
# Initialize after clone
git submodule update --init --recursive

# Update to latest
git submodule update --remote skills/nexa
```

---

## Optional — GeneXus Next MCP

The `scripts/optional/start-gxnext.ps1` script starts GeneXus Next (Docker version) if you want to use the official GeneXus MCP server. This is **not required** for the gx18-mcp workflow.

> **Warning:** Do NOT use gxnext write tools against a GeneXus 18 KB — it creates false revisions under the wrong user in Team Development. Read-only tools (`export_kb_to_text`, `get_kb_property`) are safe. See [docs/genexus-for-agents.md](docs/genexus-for-agents.md) for details.

```powershell
.\scripts\optional\start-gxnext.ps1
```

---

## Official GeneXus resources

| Resource | What it is |
|---|---|
| [GeneXus for Agents](https://wiki.genexus.com/commwiki/wiki?61619) | Official MCP integration docs (GeneXus Next) |
| [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) | Official skill repo — `skills/nexa/` is this submodule |
| [GeneXus Wiki](https://wiki.genexus.com) | Full platform documentation |
| [GeneXus Community](https://community.genexus.com) | Forums and Q&A |

---

## Contributing

PRs are welcome — especially new UC examples, skill improvements, and gx18-mcp tool enhancements. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Questions or ideas? Open a [Discussion](https://github.com/lucaskarsten/genexus-ai-toolkit/discussions).

---

## License

MIT — see [LICENSE](LICENSE).
