<div align="center">
  <img src="assets/icon-source.png" alt="GeneXus AI Toolkit" width="140" />

  <h1>GeneXus AI Toolkit</h1>

  <p><strong>Give any LLM deep GeneXus 18 expertise.</strong><br/>
  Generate correct UCs, DSOs, Web Panels, and Procedures on the first try.<br/>
  Read and write your Knowledge Base directly from Claude, VS Code, or any MCP client.</p>

  <p>
    <a href="https://github.com/lucaskarsten/genexus-ai-toolkit/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/lucaskarsten/genexus-ai-toolkit?label=release&color=4CAF50&style=for-the-badge"/></a>
    <a href="https://www.npmjs.com/package/gx18-mcp"><img alt="npm" src="https://img.shields.io/npm/v/gx18-mcp?color=CB3837&style=for-the-badge&logo=npm"/></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge"/></a>
    <a href="https://github.com/lucaskarsten/genexus-ai-toolkit/discussions"><img alt="Discussions" src="https://img.shields.io/badge/discussions-welcome-blueviolet?style=for-the-badge"/></a>
    <a href="https://www.genexus.com"><img alt="GeneXus 18" src="https://img.shields.io/badge/GeneXus-18-0078D4?style=for-the-badge"/></a>
  </p>

  <p><em>Works with Claude Code · Claude Desktop · VS Code Copilot · Cursor · OpenAI Codex CLI · ChatGPT</em></p>
</div>

---

## 🚀 Version 2.0 — A Massive Usability Leap

<div align="center">

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🎉  We've reached v2.0 — GeneXus AI Toolkit is bigger than        ║
║       ever. 47 MCP tools, a full chat UI with Markdown and          ║
║       image paste, XPZ round-trip for UC scripts, SDK create        ║
║       for WBC/WBP, benchmark suite, auto-update, and much more.     ║
║                                                                      ║
║   Nara (our labrador) is here to stay. 🐕                            ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

</div>

### What's new in v2.0

| Area | What changed |
|---|---|
| 🔧 **47 MCP tools** | From 19 to 47 — `gx_clone`, `gx_bulk_modify`, `gx_compare`, `gx_diff`, `gx_lint`, `gx_stats`, `gx_modules`, `gx_attribute`, `gx_dead_code`, `gx_patch_xpz`, and much more |
| 📝 **UC scripts via XPZ** | `gx_modify script:AfterShow` and `script:<Method>` — edit UserControl scripts directly without opening the IDE |
| 🏗️ **SDK create/modify for WBC/WBP** | `gx_create` and `gx_modify` for WebComponent/WebPanel run through the GX18 SDK headless — events/rules/conditions are tokenized correctly on save |
| 💬 **Full Chat UI** | Markdown rendering, image paste, animations, streaming — professional chat interface integrated with MCP |
| 📚 **Embedded MCP Resources** | 8 technical docs available as MCP resources to any client — no file copying needed |
| 🐕 **Nara Mascot** | Refreshed visual identity with Nara the labrador |
| 📊 **Benchmark Suite** | 47 tools × 12 objects — measures performance and automatically detects regressions |
| ⚡ **Worker auto-recycle** | Eliminates progressive slowdown — the C# worker recycles automatically and doesn't leak resources |
| 🔒 **Integrity protection** | Writes go through the GX18 SDK, which validates and tokenizes source — invalid code is rejected (ValidationException) instead of corrupting the KB |

---

## What your AI can do with this toolkit

<table>
<tr>
<th>❌ Without the toolkit</th>
<th>✅ With the toolkit</th>
</tr>
<tr>
<td>Invents API names that don't exist</td>
<td>Uses only documented <code>gx.*</code> runtime APIs</td>
</tr>
<tr>
<td>Generates JS that breaks after AJAX Refresh</td>
<td>Applies correct AfterShow + MutationObserver</td>
</tr>
<tr>
<td>CSS that collides with GeneXus auto-classes</td>
<td>Follows BEM conventions and DSO structure</td>
</tr>
<tr>
<td>Guesses property types — silently breaks decimals</td>
<td>Knows that <code>Type="numeric"</code> truncates; uses <code>string</code> + <code>Str()</code></td>
</tr>
<tr>
<td>Creates objects with the wrong UserId in Team Dev</td>
<td>GX18 SDK with your Windows identity — correct UserId on every save</td>
</tr>
<tr>
<td>Editing UC scripts requires opening the IDE</td>
<td><code>gx_modify script:AfterShow</code> edits directly via XPZ round-trip</td>
</tr>
<tr>
<td>Manual and time-consuming impact analysis</td>
<td><code>gx_impact</code>, <code>gx_where_used</code>, <code>gx_dead_code</code> — instant analysis</td>
</tr>
<tr>
<td>No visibility into differences and history</td>
<td><code>gx_diff</code>, <code>gx_history</code>, <code>gx_compare</code> — full traceability</td>
</tr>
</table>

---

## Download & Quick Start

### 🏆 Option 1 — Standalone exe (recommended for end users)

No Node.js, Git, or any prior installation needed.

1. Download `GeneXusAIToolkit-windows.zip` from the [latest release](https://github.com/lucaskarsten/genexus-ai-toolkit/releases/latest)
2. Extract to any folder (e.g., `C:\Tools\GeneXusAIToolkit\`)
3. Double-click `GeneXusAIToolkit.exe`
4. The browser opens automatically with the setup UI
5. Fill in the KB paths and click **Save** — the MCP server is available on port `7337`

The `worker\` folder must stay next to the `.exe`. Do not move the executable alone.

On the next launch, the `.exe` checks for updates in the background — when a new version is available, it downloads and applies it silently on close.

### 📦 Option 2 — npm

Requires Node.js 18+.

```bash
npm install -g gx18-mcp
gx18-mcp ui
```

### 🔧 Option 3 — Clone (for contributors)

```bash
git clone --recurse-submodules https://github.com/lucaskarsten/genexus-ai-toolkit.git
cd genexus-ai-toolkit/packages/gx18-mcp
npm install
npm run build
node dist/bin/gx18-mcp.js ui
```

---

## Connect to Claude Desktop, VS Code, or Claude Code

After saving the KB paths, go to the **Connections** tab in the UI. Each supported client has a button:

| Button | What it does |
|---|---|
| **Register** (Claude Desktop) | Writes the `gx18` entry in `claude_desktop_config.json`. Automatically detects the MS Store path and the default path (`AppData\Roaming\Claude\`). |
| **Register** (VS Code) | Writes to `.vscode/mcp.json` in the current working directory. |
| **Register** (Claude Code project) | Writes to `.mcp.json` in the current directory — automatically detected when Claude Code opens the folder. |

After registering, **restart Claude Desktop or reload the VS Code window**.

The registered command points directly to the exe — no `npx` or Node.js at runtime:

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

## 47 MCP Tools

The `gx18` server exposes **47 tools** to your AI client, organized into categories:

### 🔍 Read & Discovery

| Tool | What it does |
|---|---|
| `gx_find` | Search objects by name/pattern in the KB |
| `gx_list` | List objects of a type/module |
| `gx_get` | Full details of an object (type, module, dates) |
| `gx_read` | Reads source, events, layout, properties, template of an object |
| `gx_properties` | SDK properties of an object |
| `gx_structure` | Transaction structure (attributes and levels) |
| `gx_attribute` | KB attribute details |
| `gx_variable` | Reads/lists variables of an object |
| `gx_modules` | Lists KB modules with hierarchy |
| `gx_whoami` | Current Windows user → UserId in the KB |

### 📊 Analysis & Quality

| Tool | What it does |
|---|---|
| `gx_analyze` | Dependencies, uses/used-by of an object |
| `gx_where_used` | Where an object is referenced |
| `gx_impact` | Impact of changes (cascade) |
| `gx_dead_code` | Detects unreferenced procedures/UCs |
| `gx_search` | Full-text search in KB source code |
| `gx_lint` | Checks conventions and anti-patterns |
| `gx_compare` | Compares two KB objects |
| `gx_diff` | Diff between versions of an object |
| `gx_stats` | General KB statistics |
| `gx_history` | Version history of an object |

### ✏️ Write (requires `confirm: true`)

| Tool | What it does |
|---|---|
| `gx_create` | Creates a new object via GX18 SDK (correct UserId) |
| `gx_modify` | Edits source/events/layout/template of an existing object |
| `gx_set_property` | Changes individual properties |
| `gx_rename` | Renames an object |
| `gx_delete` | Removes an object from the KB |
| `gx_clone` | Clones an object (WBC/WBP via the GX18 SDK — copies events/rules/layout from the source) |
| `gx_move` | Moves an object to another module |
| `gx_bulk_modify` | Modifies multiple objects in batch |
| `gx_variable` | Creates/updates variables of an object |

### 📦 XPZ — Export/Import/Patch

| Tool | What it does |
|---|---|
| `gx_export` | Exports an object to `.xpz` (includes UCs via SQL XPZ builder) |
| `gx_read_xpz` | Lists and reads scripts inside an `.xpz` |
| `gx_patch_xpz` | Applies a CDATA patch to a script in an `.xpz` |
| `gx_import` | Imports a `.xpz` into the KB (UserId-verified) |

### 🗄️ Database

| Tool | What it does |
|---|---|
| `gx_sql` | Direct SQL against the KB (SQL Server) |
| `gx_db_connections` | Lists configured database connections |
| `gx_db_query` | Oracle query via ODP.NET (NNE support) |

### ⚙️ Configuration & Diagnostics

| Tool | What it does |
|---|---|
| `gx_save_config` | Updates KB paths and restarts the worker — directly from chat |
| `gx_doctor` | Server and KB health diagnostics |
| `gx_reload` | Forces KB reload in the worker (after direct SQL writes) |
| `gx_validate` | Validates an object before saving |

> Write tools require `confirm: true` and are disabled in read-only mode (`GX18_READONLY=true`).

---

## Skills — Load GeneXus expertise into your AI

Skills are Markdown files you load into your AI client. They give Claude (or any LLM) deep GeneXus 18 expertise as system context.

### `genexus-uc.md` — User Controls Specialist

Expert context for creating, refactoring, and debugging GeneXus 18 UCs.

- AfterShow Pattern A (IIFE + init-guard) and Pattern B (`window["ucInit_"]` + setTimeout)
- MutationObserver for post-AJAX Refresh re-render
- SDT → JSON serialization (`Type="string"` + `decode()`)
- Floating dropdown, Control Type, jQuery namespace patterns
- 5-step decision path executed before any code generation

```bash
# Claude Code
cp skills/genexus-uc.md ~/.claude/skills/
```

### `genexus-expert.md` — General GeneXus 18 Expert

Covers all GX18 object types with production-tested patterns, plus a quick reference of the most commonly used GeneXus constructs (attribute types, rules, triggers) extracted from the nexa reference files.

```bash
cp skills/genexus-expert.md ~/.claude/skills/
cp skills/genexus-kb-sql.md ~/.claude/skills/
```

### `skills/nexa/` — Official GeneXus Skill (language authority)

The official [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) submodule. 24+ GeneXus object types, complete language reference (rules, events, properties, data types). Load it when working on object structure, transaction design, or anything requiring the authoritative GeneXus spec.

```bash
# Register with Claude Code
claude --add-dir skills/nexa/nexa

# Keep up to date
git submodule update --remote skills/nexa
```

**ChatGPT / Copilot / other LLMs:** paste the content of any skill `.md` file into the system prompt or custom instructions.

---

## Embedded MCP Resources

Available to any MCP client via `gx18://docs/<name>`:

| Resource | Content |
|---|---|
| `gx18://docs/quick-reference` | Tool→task decision table, EntityTypeIds, mandatory sequences |
| `gx18://docs/usage-guide` | Complete tool reference, anti-patterns, examples |
| `gx18://docs/entity-types` | All types with EntityTypeId, SDK type, write support |
| `gx18://docs/write-safety` | Mandatory pre-flight checklist before any write operation |
| `gx18://docs/xpz-workflow` | Complete XPZ round-trip guide (UC AfterShow/Methods scripts) |
| `gx18://docs/xpz-format-reference` | XPZ XML schema, Part GUIDs, variable typing |
| `gx18://docs/genexus-knowledge` | Object model, events, syntax, canonical patterns |
| `gx18://docs/user-controls` | UC guide: AfterShow, MutationObserver, jQuery, UC catalog |

---

## What's included

```
genexus-ai-toolkit/
├── packages/
│   └── gx18-mcp/              # GeneXus 18 MCP server (npm + standalone exe)
│       ├── src/               # TypeScript source (47 tools, UI, SDK bridge, config)
│       │   ├── ui/            # Local web UI (chat + dashboard + config)
│       │   ├── sdk-bridge/    # IPC bridge with the C# worker
│       │   ├── tools/         # 47 MCP tool implementations
│       │   └── docs/          # 8 technical docs embedded as MCP Resources
│       ├── benchmark/         # Benchmark suite (47 tools × 12 objects)
│       ├── worker/            # C# worker (GX18 SDK, Oracle ODP.NET, IPC)
│       └── dist/worker/       # Pre-compiled worker + Oracle DLLs (committed)
├── assets/                    # Nara icon and visual assets
├── skills/                    # Skill files for LLMs
│   ├── genexus-uc.md          # User Controls specialist (GX18)
│   ├── genexus-expert.md      # General GX18 expert + nexa language digest
│   ├── genexus-kb-sql.md      # Direct SQL access to the KB
│   └── nexa/                  # Official GeneXus Labs skill (submodule)
├── docs/                      # Technical reference guides
│   ├── user-controls-guide.md
│   ├── bem-css-naming.md
│   ├── common-pitfalls.md
│   ├── runtime-api-reference.md
│   ├── kb-sql-reference.md
│   ├── gx18-mcp.md
│   ├── genexus-for-agents.md
│   └── llm-engineering.md
├── .claude/agents/            # Specialized Claude Code subagents
│   ├── gx-uc-builder.md       # UC creation and modification
│   ├── gx-wbp-builder.md      # Web Panel and Web Component wiring
│   ├── gx-kb-explorer.md      # KB reading via gx18-mcp + SQL
│   ├── gx-dso-designer.md     # DSO CSS + design tokens
│   └── gx-reviewer.md         # Code quality review
├── examples/                  # Ready-to-use templates
│   ├── user-controls/         # 4 working UC examples
│   ├── design-system/         # DSO template + design tokens
│   ├── web-panels/            # WBP example with pub/sub
│   └── templates/             # UC and DSO scaffolds
└── output/                    # AI-generated files (gitignored, local)
```

---

## Supported AI Clients

| Client | How to connect |
|---|---|
| **Claude Desktop** | Connections tab → Register. Automatically detects the MS Store path. |
| **VS Code Copilot** | Connections tab → Register (writes `.vscode/mcp.json`). Enable Agent mode in Copilot. |
| **Claude Code** | Connections tab → Register (writes `.mcp.json`). Automatically detected when the project is opened. |
| **Cursor** | Register writes `.cursor/mcp.json`. Or copy `.vscode/mcp.json` → `.cursor/mcp.json`. |
| **OpenAI Codex CLI** | `codex.toml` is included in the repo — automatically detected by `codex`. |
| **ChatGPT Desktop** | App settings → MCP → Add `http://localhost:7337/mcp` manually. |

---

## Ready-to-use UC Examples

| UC | What it does |
|----|---|
| [`UcDropdownMenu`](examples/user-controls/UcDropdownMenu/) | Button + collapsible list, items via JSON, OnItemClick event |
| [`UcUserMenu`](examples/user-controls/UcUserMenu/) | Avatar + name + dropdown with logout/settings |
| [`UcToastNotification`](examples/user-controls/UcToastNotification/) | Toast alerts (success / error / warning / info) with auto-dismiss and `Show()` / `Hide()` methods |
| [`UcNavSearch`](examples/user-controls/UcNavSearch/) | Search with live filter, keyboard navigation (arrows + Escape), OnSelect event |

All four examples follow the same patterns — they are the ground truth the AI uses when generating new UCs.

---

## Reference Documentation

| Guide | When to read |
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

## Environment Variables

| Variable | Required for | Description |
|---|---|---|
| `GX_KB_PATH` | gx18 MCP | GeneXus KB root folder |
| `GX_KB_SERVER` | gx18 MCP | SQL Server instance (default: `(localdb)\MSSQLLocalDB`) |
| `GX_KB_DATABASE` | gx18 MCP | KB database name |
| `GX_18_DIR` | gx18 MCP | GeneXus 18 installation folder (auto-detected if omitted) |
| `GX_OUTPUT_PATH` | Optional | Output folder for generated files (default: `.\output`) |
| `GX_PROJECT_PREFIX` | Optional | Prefix for generated object names (e.g., `Acme`) |
| `GX_COMPILER_OUTPUT` | Optional | GeneXus build output path (Tomcat / .NET) |
| `GX18_READONLY` | Optional | Set to `true` to disable all write tools |

The UI saves settings to `%LOCALAPPDATA%\gx18-mcp\config.json`. Environment variables override saved config when both are set.

Copy `.env.example` → `.env` and fill in your values.

---

## For Developers and Contributors

### Build

```bash
cd packages/gx18-mcp
npm install
npm run build            # TypeScript → dist/
npm run build:worker     # C# SDK worker → dist/worker/
npm run build:exe        # Standalone exe → release/GeneXusAIToolkit.exe
npm test                 # Vitest unit tests
npm run test:all         # Unit + integration + benchmark smoke
```

### Agents (Claude Code)

The `.claude/agents/` directory contains specialized subagents available when working on this project with Claude Code. They are automatically suggested when the task matches their description.

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

> ⚠️ **Warning:** Do NOT use gxnext write tools on a GeneXus 18 KB — it creates false revisions with the wrong user in Team Development. Read-only tools (`export_kb_to_text`, `get_kb_property`) are safe. See [docs/genexus-for-agents.md](docs/genexus-for-agents.md) for details.

---

## Official GeneXus Resources

| Resource | What it is |
|---|---|
| [GeneXus for Agents](https://wiki.genexus.com/commwiki/wiki?61619) | Official MCP integration docs (GeneXus Next) |
| [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) | Official skills repo — `skills/nexa/` is this submodule |
| [GeneXus Wiki](https://wiki.genexus.com) | Complete platform documentation |
| [GeneXus Community](https://community.genexus.com) | Forums and Q&A |

---

## Contributing

PRs are welcome — especially new UC examples, skill improvements, and new tools for gx18-mcp. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Questions or ideas? Open a [Discussion](https://github.com/lucaskarsten/genexus-ai-toolkit/discussions).

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
  <img src="assets/icon-source.png" alt="Nara" width="60" />
  <br/>
  <sub>Made with 🐕 by Nara and a lot of AI · GeneXus AI Toolkit v2.0</sub>
</div>
