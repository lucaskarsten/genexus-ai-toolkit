# genexus-ai-toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Discussions](https://img.shields.io/github/discussions/lucaskarsten/genexus-ai-toolkit)](https://github.com/lucaskarsten/genexus-ai-toolkit/discussions)
[![GitHub stars](https://img.shields.io/github/stars/lucaskarsten/genexus-ai-toolkit?style=social)](https://github.com/lucaskarsten/genexus-ai-toolkit/stargazers)

AI-assisted development toolkit for GeneXus 18 — works with any LLM (Claude Code, ChatGPT, Copilot) and any GeneXus compiler (Tomcat, .NET, etc.)

---

## What's Included

| Folder | Contents |
|--------|----------|
| `docs/` | Technical reference guides — UC patterns, BEM CSS, KB SQL, runtime APIs |
| `skills/` | AI skill files — load into your LLM for expert GeneXus context |
| `examples/` | Ready-to-use UC templates, DSO examples, design tokens |
| `scripts/` | PowerShell utilities for compiler output sync and dependency discovery |
| `output/` | Staging area for AI-generated code (gitignored, local only) |

---

## Quickstart

**1. Clone the repo**

```bash
git clone https://github.com/lucaskarsten/genexus-ai-toolkit.git
cd genexus-ai-toolkit
cp .env.example .env
# Edit .env with your GX_COMPILER_OUTPUT path
```

**2. Install the skills into your LLM**

*Claude Code:*
```bash
cp skills/genexus-uc.md ~/.claude/skills/
cp skills/genexus-expert.md ~/.claude/skills/
cp skills/genexus-kb-sql.md ~/.claude/skills/
```
Then invoke with `/genexus-uc`, `/genexus-expert`, or `/genexus-kb-sql` in your Claude Code session.

*ChatGPT / Copilot:* Open the skill `.md` file and paste its content into your system prompt or custom instructions.

*Other LLMs:* These are plain markdown files — attach them as context files to any LLM conversation.

**3. Ask your AI to generate a UC or DSO**

```
/genexus-uc Create a dropdown menu UC called UcMyDropdown with properties:
Label (string), Items (JSON array), OnSelect event.
```

The AI generates the `.view` file. Find it in `/output/`, then copy-paste into your GeneXus IDE.

---

## Skills

Load these into your AI assistant for expert GeneXus context.

### `skills/genexus-uc.md` — User Control Specialist
Full expert context for creating, refactoring, and debugging GeneXus 18 User Controls. Covers Properties, Screen Template, AfterShow scripts, data passing (JSON/SDT), MutationObserver for AJAX refresh, jQuery patterns, Control Type, CSS, and debugging.

### `skills/genexus-expert.md` — General GeneXus Expert
Senior GeneXus 18 expertise covering all object types: UC, DSO, Web Panels (WBP/WBC), JavaScript ES5, runtime APIs (`gx.fx.obs`, `gx.dom`, `gx.grid`, `gx.popup`), BEM CSS, WBP↔UC communication, KB SQL access, and the full build/sync cycle.

### `skills/genexus-kb-sql.md` — Knowledge Base SQL Specialist
Direct access to the GeneXus Knowledge Base via SQL. Covers EntityType mapping, GZip blob format, PowerShell scripts for reading and writing GX source code without opening the IDE.

#### Installing for Different LLMs

| LLM | How to install |
|-----|---------------|
| **Claude Code** | `cp skills/<name>.md ~/.claude/skills/` then `/skill-name` |
| **ChatGPT** | Paste file content into System Prompt or Custom Instructions |
| **GitHub Copilot** | Add file as context in Copilot Chat, or paste into workspace instructions |
| **Other** | Attach the `.md` file as a context document in your conversation |

---

## Docs

Technical reference guides to read before implementing:

| Guide | When to use |
|-------|-------------|
| [docs/user-controls-guide.md](docs/user-controls-guide.md) | Creating or editing any User Control |
| [docs/bem-css-naming.md](docs/bem-css-naming.md) | Creating CSS classes in DSOs |
| [docs/common-pitfalls.md](docs/common-pitfalls.md) | Debugging UCs — real codebase traps |
| [docs/runtime-api-reference.md](docs/runtime-api-reference.md) | GeneXus JS runtime APIs (`gx.fx.obs`, `gx.dom`, etc.) |
| [docs/kb-sql-reference.md](docs/kb-sql-reference.md) | Accessing/modifying the KB via SQL |

---

## Examples

### User Controls (`examples/user-controls/`)

| UC | Description |
|----|-------------|
| `UcDropdownMenu/` | Button with collapsible dropdown, JSON-driven items, OnItemClick event |
| `UcUserMenu/` | Avatar + name + dropdown with logout/settings actions |
| `UcToastNotification/` | Toast alerts (success/error/warning/info) with auto-dismiss |
| `UcNavSearch/` | Navigation search with keyboard support and OnSelect event |

### Design System (`examples/design-system/`)

- `DsoGenexusOverrides.css` — Template for overriding GeneXus auto-generated classes
- `tokens-example.json` — Design token structure with generic placeholder values

### Web Panels (`examples/web-panels/`)

| Example | Description |
|---------|-------------|
| `WbpSearchWithNavSearch/` | Web Panel that wires a `UcNavSearch` UC to filter a grid via pub/sub (`&EventParam`, `Refresh`) |

### Templates (`examples/templates/`)

- `uc.template.md` — Minimum UC scaffold with 5 laws summary and checklist
- `dso.template.md` — DSO file structure, token usage, BEM example

---

## Scripts

### `scripts/sync-compiler-output.ps1`
Copies files modified today from the GeneXus compiler output directory to a local reference folder. Useful after each build to keep your local reference up to date.

```powershell
.\scripts\sync-compiler-output.ps1
.\scripts\sync-compiler-output.ps1 -ForceFullScan -DaysBack 7
```

### `scripts/discover-missing-assets.ps1`
Scans your source files for `@import`, `src=`, and `href=` references and checks if the referenced files exist. Can auto-fetch missing files from the compiler output.

```powershell
.\scripts\discover-missing-assets.ps1
.\scripts\discover-missing-assets.ps1 -AutoFetch
.\scripts\discover-missing-assets.ps1 -Diff
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to submit UC examples, new skills, and bug reports.

---

## License

MIT — see [LICENSE](LICENSE).
