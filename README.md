# GeneXus AI Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Discussions](https://img.shields.io/badge/discussions-welcome-blueviolet.svg)](https://github.com/lucaskarsten/genexus-ai-toolkit/discussions)
[![GeneXus](https://img.shields.io/badge/GeneXus-18%20%2B%20Next-0078D4.svg)](https://www.genexus.com)

**Give any LLM deep GeneXus expertise — generate correct UCs, DSOs, Web Panels, and Procedures on the first try.**

Works with Claude Code, OpenAI Codex, GitHub Copilot, ChatGPT, and any LLM. Supports both GeneXus 18 (direct KB via MCP) and GeneXus Next 2026+.

---

## Download & instalação

### Opção 1 — Executável (recomendado para usuários finais)
Não requer Node.js nem Git.

1. Baixe `GeneXusAIToolkit-windows.zip` da [última release](https://github.com/lucaskarsten/genexus-ai-toolkit/releases/latest)
2. Extraia em qualquer pasta
3. Dê duplo clique em `GeneXusAIToolkit.exe`
4. Configure os caminhos no browser → Claude Code conecta automaticamente

### Opção 2 — npm (para desenvolvedores)
Requer Node.js 18+.

```bash
npm install -g gx18-mcp
gx18-mcp ui
```

### Opção 3 — Clone do repositório (para contribuidores)
```bash
git clone https://github.com/lucaskarsten/genexus-ai-toolkit.git
cd genexus-ai-toolkit
Iniciar.bat
```

---

## Início rápido — GeneXus 18 + MCP

> **Pré-requisito:** Node.js 18+ instalado ([nodejs.org](https://nodejs.org)).

1. Clone o repositório
2. Dê duplo clique em **`Iniciar.bat`**
3. Configure os caminhos no browser que abre (botão **Auto-detectar KBs** preenche automaticamente)
4. Abra Claude Code nesta pasta → MCP conectado automaticamente

O servidor MCP fica registrado para todas as sessões futuras. Na próxima vez, basta abrir Claude Code.

---

## What your AI can do with this toolkit

| Without toolkit | With toolkit |
|---|---|
| Invents API names that don't exist | Uses only documented `gx.*` runtime APIs |
| Generates JS that breaks after AJAX Refresh | Applies correct AfterShow + MutationObserver patterns |
| Creates CSS that collides with GeneXus auto-classes | Follows project BEM conventions and DSO structure |
| Guesses property types — breaks decimals silently | Knows `Type="numeric"` truncates; uses `string` + `Str()` |
| Produces untestable code | Delivers checklist-verified, multi-instance-safe UCs |

---

## Choose your path

| | **Path A — GeneXus 18** | **Path B — GeneXus Next + MCP** |
|---|---|---|
| **Requires** | Any GeneXus 18 installation | GeneXus Next 2026.01+ |
| **How it works** | AI generates `.view` / `.prc` files → you paste into IDE | AI creates objects directly in your KB — no copy-paste |
| **Setup time** | ~2 minutes | ~5 minutes |
| **Best for** | GX18 projects, review-before-apply workflow | GeneXus Next, rapid prototyping, automated workflows |

---

## Path A — GeneXus 18 Quickstart

### 1. Clone

```bash
git clone https://github.com/lucaskarsten/genexus-ai-toolkit.git
cd genexus-ai-toolkit
cp .env.example .env
```

Open `.env` and set `GX_COMPILER_OUTPUT` to your GeneXus build output path:

```bash
# Tomcat example
GX_COMPILER_OUTPUT=C:\tomcat\webapps\YourApp\static

# .NET example
GX_COMPILER_OUTPUT=C:\inetpub\wwwroot\YourApp\static
```

### 2. Install the skills

**Claude Code:**
```bash
cp skills/genexus-uc.md ~/.claude/skills/
cp skills/genexus-expert.md ~/.claude/skills/
cp skills/genexus-kb-sql.md ~/.claude/skills/
```

**ChatGPT / Copilot / other LLMs:** paste the contents of any `.md` skill file into your system prompt or custom instructions.

### 3. Generate your first UC

Open a Claude Code session in this folder and run:

```
/genexus-uc Create a dropdown menu UC called UcProductPicker.
Properties: Label (string), Items (JSON array [{id, label}]), OnSelect event.
```

The AI generates the `.view` file → saved to `output/UC/UcProductPicker_*.view` → open in GeneXus IDE and import.

---

## ⚠️ Using gxnext MCP with a GeneXus 18 KB — proceed with care

You **can** use the gxnext MCP server against a GeneXus 18 KB, but there are important caveats you should understand before doing so.

When GeneXus Next opens a GX18 KB it registers a new revision for every object it processes, using an internal user ID instead of your Windows session user. This causes Team Development to show those objects as "modified" under the wrong username — even if their actual content didn't change.

**Recommended approach:**

| Goal | How |
|---|---|
| Analyse objects, search the KB | Use `export_kb_to_text` or direct SQL — these don't open a KB session |
| Generate code with AI and review it | Use this toolkit's `output/` workflow — AI proposes, you apply via IDE |
| Apply AI-generated objects to the KB | Export to XPZ via **GeneXus 18 IDE** (Knowledge Manager → Export), apply on a **secondary KB clone**, validate, then import into production |
| Use write/build tools directly | Take a **full SQL backup first** and accept that Team Development will show modified objects under the gxnext user until you revert or check in |

**The one thing to never do:** use write tools on your production KB without a backup. The revision pollution is reversible (see recovery procedure below) but costs hours of SQL work.

> Full details on safe vs. write-capable tools, and the SQL recovery procedure if things go wrong: [docs/genexus-for-agents.md → section 7](docs/genexus-for-agents.md) and [docs/kb-sql-reference.md → Recovery section](docs/kb-sql-reference.md).

---

## Path B — GeneXus Next + MCP Quickstart

### 1. Clone with submodules

```bash
git clone --recurse-submodules https://github.com/lucaskarsten/genexus-ai-toolkit.git
cd genexus-ai-toolkit
cp .env.example .env
```

### 2. Configure your Docker folder

Open `.env` and set:

```bash
GX_DOCKER_FOLDER=C:\Users\you\Downloads\gx-desktop-web-1.2.48-r117
```

### 3. Start GeneXus Next

```powershell
.\scripts\start-gxnext.ps1
```

Waits for the IDE (`localhost:3000`) and MCP server (`localhost:8001`) to be ready.

> **Native install?** GeneXus Next native uses port `1989`. Set `GX_MCP_PORT=1989` in `.env`.

### 4. Register the nexa skill (Claude Code)

```bash
claude --add-dir skills/nexa/nexa
```

### 5. Verify the MCP connection

In Claude Code:
```
/mcp
```

You should see `gxnext ✅ connected`.

### 6. Talk to your KB

```
Create a Transaction named Customer with CustomerId (autonumber),
CustomerName (varchar 60), and CustomerEmail (varchar 100).
Add a not-null validation rule for CustomerEmail.
```

The AI calls `gxnext` tools → objects are created directly in your Knowledge Base.

---

## What's included

```
genexus-ai-toolkit/
├── skills/                   # AI skill files — load into your LLM
│   ├── genexus-uc.md         # User Control specialist (GX18)
│   ├── genexus-expert.md     # General GX18 expert (DSO, WBP, JS, CSS)
│   ├── genexus-kb-sql.md     # Direct KB SQL access via PowerShell
│   └── nexa/                 # Official GeneXus Labs skill (submodule)
├── docs/                     # Technical reference guides
│   ├── user-controls-guide.md
│   ├── bem-css-naming.md
│   ├── common-pitfalls.md
│   ├── runtime-api-reference.md
│   ├── kb-sql-reference.md
│   ├── genexus-for-agents.md # MCP setup for all AI clients
│   └── llm-engineering.md   # Prompt engineering guide for contributors
├── examples/                 # Ready-to-use templates
│   ├── user-controls/        # 4 fully working UC examples
│   ├── design-system/        # DSO template + design tokens
│   ├── web-panels/           # WBP example with pub/sub
│   └── templates/            # UC and DSO scaffolds
├── scripts/                  # PowerShell utilities
│   ├── start-gxnext.ps1      # Start GeneXus Next Docker stack
│   ├── sync-compiler-output.ps1
│   └── discover-missing-assets.ps1
├── output/                   # AI-generated files (gitignored, local only)
├── .mcp.json                 # Claude Code — MCP config (auto-detected)
├── codex.toml                # OpenAI Codex CLI — MCP config (auto-detected)
└── .vscode/mcp.json          # VS Code / Cursor — MCP config (auto-detected)
```

---

## Skills

### `genexus-uc.md` — User Control Specialist

Expert context for creating, refactoring, and debugging GeneXus 18 UCs.

- AfterShow Pattern A (IIFE + init-guard) and Pattern B (`window["ucInit_"]` + setTimeout)
- MutationObserver for AJAX Refresh re-render
- SDT → JSON serialization (`Type="string"` + `decode()`)
- Floating dropdown, Control Type, jQuery namespace patterns
- Anti-hallucination constraints — only uses documented APIs
- 5-step decision path executed before any code is generated

```
# Claude Code
/genexus-uc Refactor UcMyControl to support multiple instances per page.
```

### `genexus-expert.md` — General GeneXus 18 Expert

Covers all GX18 object types with production-tested patterns.

- JavaScript ES5 patterns (GeneXus runtime constraint)
- `gx.fx.obs` pub/sub, `gx.dom`, `gx.grid`, `gx.popup` runtime APIs
- BEM CSS for DSOs, WBP ↔ UC communication via events
- KB SQL direct access

```
# Claude Code
/genexus-expert Review WbpDashboard and suggest improvements.
```

### `genexus-kb-sql.md` — KB SQL Specialist

Direct Knowledge Base access without opening the IDE.

- EntityType mapping (object IDs → types)
- GZip blob decompression/recompression
- PowerShell scripts for reading and writing `.view`, `.prc`, `.trn` sources

```
# Claude Code
/genexus-kb-sql Find all WebPanels that reference Transaction Customer.
```

### `skills/nexa/` — Official GeneXus Skill *(GeneXus Next only)*

The official [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) submodule. 24 GeneXus object types, 9-phase KB workflow, full MCP tool orchestration.

```bash
# Register with Claude Code
claude --add-dir skills/nexa/nexa

# Keep up to date
git submodule update --remote skills/nexa
```

---

## MCP — supported clients

All config files are included in the repo and auto-detected by each client.

| Client | Config file | Notes |
|---|---|---|
| **Claude Code** | `.mcp.json` | Auto-detected on project open |
| **OpenAI Codex CLI** | `codex.toml` | Auto-detected on `codex` run |
| **VS Code Copilot** | `.vscode/mcp.json` | Auto-detected in Copilot Agent mode |
| **Cursor** | Copy `.vscode/mcp.json` → `.cursor/mcp.json` | One-time manual step |
| **ChatGPT Desktop** | App settings → MCP | Add `http://localhost:8001/mcp` manually |

Default MCP URL: `http://localhost:8001/mcp` (Docker). Native GeneXus Next uses port `1989` — update `GX_MCP_PORT` in `.env`.

Full setup instructions: [docs/genexus-for-agents.md](docs/genexus-for-agents.md)

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
| [kb-sql-reference.md](docs/kb-sql-reference.md) | Querying or modifying the KB directly via SQL |
| [genexus-for-agents.md](docs/genexus-for-agents.md) | Setting up MCP for any AI client |
| [llm-engineering.md](docs/llm-engineering.md) | Writing or improving skills and docs |

---

## Scripts

### `start-gxnext.ps1`

Starts the GeneXus Next Docker stack and waits for the IDE and MCP server to be ready. Reads `GX_DOCKER_FOLDER` and `GX_MCP_PORT` from `.env`.

```powershell
.\scripts\start-gxnext.ps1

# Override folder or timeout
.\scripts\start-gxnext.ps1 -DockerFolder "C:\gx-docker" -TimeoutSeconds 180
```

### `sync-compiler-output.ps1`

Copies files modified today from `GX_COMPILER_OUTPUT` to a local reference folder.

```powershell
.\scripts\sync-compiler-output.ps1
.\scripts\sync-compiler-output.ps1 -ForceFullScan -DaysBack 7
```

### `discover-missing-assets.ps1`

Scans source files for `@import`, `src=`, and `href=` references and reports missing files.

```powershell
.\scripts\discover-missing-assets.ps1
.\scripts\discover-missing-assets.ps1 -AutoFetch
```

---

## Environment variables

| Variable | Required for | Description |
|---|---|---|
| `GX_COMPILER_OUTPUT` | Path A | GeneXus build output path (Tomcat / .NET) |
| `GX_KB_PATH` | SQL features | GeneXus KB root folder |
| `GX_KB_SERVER` | SQL features | SQL Server instance (default: `localdb\MSSQLLocalDB`) |
| `GX_KB_DATABASE` | SQL features | KB database name |
| `GX_PROJECT_PREFIX` | Optional | Prefix for generated object names (e.g. `Acme`) |
| `GX_DOCKER_FOLDER` | Path B | GeneXus Next Docker install folder |
| `GX_MCP_PORT` | Path B | MCP port — `8001` (Docker) or `1989` (native) |

---

## Official GeneXus resources

This toolkit builds on top of official GeneXus technology and documentation. Full credit to **[GeneXus](https://www.genexus.com)** and **[GeneXus Labs](https://github.com/genexuslabs)**.

| Resource | What it is |
|---|---|
| [GeneXus for Agents](https://wiki.genexus.com/commwiki/wiki?61619) | Official MCP integration docs (GeneXus Next) |
| [GeneXus MCP Server](https://wiki.genexus.com/commwiki/wiki?61623) | MCP Server reference and configuration |
| [GeneXus Next — Windows install](https://wiki.genexus.com/commwiki/wiki?61624) | Native install guide |
| [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) | Official skill repo — `skills/nexa/` is this submodule |
| [GeneXus Wiki](https://wiki.genexus.com) | Full platform documentation |
| [GeneXus Community](https://community.genexus.com) | Forums and Q&A |

The `skills/nexa/` directory is a git submodule from [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) — the authoritative GeneXus knowledge maintained by GeneXus Labs. It is **not** part of this toolkit and is governed by its own license.

---

## Contributing

PRs are welcome — especially new UC examples, skill improvements, and GeneXus Next patterns. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Questions or ideas? Open a [Discussion](https://github.com/lucaskarsten/genexus-ai-toolkit/discussions).

---

## License

MIT — see [LICENSE](LICENSE).
