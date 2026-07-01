# Skills — AI Context Files for GeneXus Development

These skill files load expert GeneXus knowledge into your AI assistant. Each file is a self-contained markdown document that gives your LLM the context needed to generate correct GeneXus code.

---

## Available Skills

### Local skill files (in `skills/`)

| Skill file | What it covers |
|-----------|---------------|
| `genexus-uc.md` | User Control specialist — Properties, Screen Template, AfterShow, data passing, MutationObserver, jQuery, Control Type, CSS, debugging |
| `genexus-expert.md` | Senior GeneXus expert — all object types (UC, DSO, WBP/WBC), ES5 JS, runtime APIs, BEM CSS, KB SQL, build/sync cycle |
| `genexus-kb-sql.md` | Knowledge Base SQL — EntityType mapping, GZip blob format, PowerShell scripts for direct source read/write |

### Submodule skills (in `skills/nexa/` — from [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills))

| Skill path | What it covers | When to activate |
|---|---|---|
| `skills/nexa/nexa/` | **nexa** — authoritative GeneXus language reference: 24+ object types, all rules/events/properties, full language spec | Any task involving Transaction structure, Procedure rules, SDT design, domain types, or KB model decisions |
| `skills/nexa/frontend/chameleon-controls-library/` | **Chameleon Controls Library** — 60+ web components (ch-accordion, ch-chat, ch-grid, ch-code-editor, etc.), Angular/React/Stencil/vanilla JS integration | Building or debugging GX18 Web Panel UI with Chameleon components |
| `skills/nexa/frontend/design-system-builder/` | **Design System Builder** — enterprise CSS design systems atop Chameleon: ITCSS layers, tokens, multi-brand, light/dark themes, auto-validation | Creating or extending a custom design system from scratch |
| `skills/nexa/frontend/mercury-design-system/` | **Mercury Design System** — pre-configured Mercury (blue) and Globant (green) themes: 39 CSS bundles, design tokens, 500+ icons, WCAG AA | Styling Chameleon-based UIs with the official GeneXus design system |
| `skills/nexa/gx-erp-connector/` | **GX ERP Connector** — SAP RFC/BAPI metadata mapping, ABAP→GeneXus type mapping, ExternalObject/SDT generation | SAP or ERP integration workflows |
| `skills/nexa/frontend/ui-creator/` | **UI Creator** — converts design screenshots + OpenAPI specs into Angular/React apps | Design-to-code workflows (requires Figma MCP) |

---

## Installing for Different LLMs

### Claude Code

**Skills** (global — available in any project):

```bash
# macOS / Linux
cp skills/genexus-uc.md ~/.claude/skills/
cp skills/genexus-expert.md ~/.claude/skills/
cp skills/genexus-kb-sql.md ~/.claude/skills/

# Windows PowerShell
Copy-Item skills\genexus-uc.md      $env:USERPROFILE\.claude\skills\
Copy-Item skills\genexus-expert.md  $env:USERPROFILE\.claude\skills\
Copy-Item skills\genexus-kb-sql.md  $env:USERPROFILE\.claude\skills\
```

**Submodule skills** — register with `--add-dir` per session or project:

```bash
# GeneXus language authority (nexa) — always load for KB modeling tasks
claude --add-dir skills/nexa/nexa

# Chameleon web components — load when building Web Panel UIs
claude --add-dir skills/nexa/frontend/chameleon-controls-library

# Design system CSS — load for DSO/token design work
claude --add-dir skills/nexa/frontend/design-system-builder
claude --add-dir skills/nexa/frontend/mercury-design-system

# SAP/ERP integration — load only when needed
claude --add-dir skills/nexa/gx-erp-connector
```

To update the submodule to the latest skills from GeneXus Labs:

```bash
git submodule update --remote skills/nexa
```

**Agents** (project-level — already in `.claude/agents/`):

The project ships five specialized subagents that Claude Code can auto-delegate to:

| Agent | Description |
|---|---|
| `gx-uc-builder` | UC creation and modification |
| `gx-wbp-builder` | Web Panel and Web Component event wiring, pub/sub, grid binding |
| `gx-kb-explorer` | KB SQL read/write via PowerShell |
| `gx-dso-designer` | DSO CSS and token design |
| `gx-reviewer` | Code quality review (CRITICAL/MAJOR/MINOR/SUGGESTION) |

These are activated automatically when working in this project. To invoke manually:

```
use the gx-reviewer agent to check this UC
use gx-kb-explorer to find the Events source of WbcNavHeader
```

**Invoke skills manually:**

```
/genexus-uc Create a dropdown UC called UcNavDropdown
/genexus-expert How do I pass an SDT collection to a UC?
/genexus-kb-sql Read the Events source of WbcMyComponent
```

Skills auto-load when you type trigger keywords (e.g., "user control", "dso", "aftershow").

### ChatGPT / Custom Instructions

1. Open the skill `.md` file in a text editor
2. Copy the entire content
3. Paste into ChatGPT's **System Prompt** (API) or **Custom Instructions** (ChatGPT.com)
4. For one-off sessions: paste at the top of your conversation before asking questions

### GitHub Copilot

**Copilot Chat:**
1. Open the skill file in your editor
2. In Copilot Chat, use `#file:skills/genexus-uc.md` to reference it as context
3. Or paste the content directly into the chat

**Workspace instructions:**
1. Create `.github/copilot-instructions.md` in your project
2. Paste the relevant skill content there
3. Copilot Chat will use it as context automatically

### Other LLMs (Gemini, Mistral, Llama, etc.)

These are plain markdown files. Any LLM can read them as context:

1. Open the skill file
2. Copy the content
3. Paste as a "system message" or at the start of the conversation
4. Then ask your question

---

## Writing Your Own Skills

A skill file must have a YAML frontmatter header:

```yaml
---
name: genexus-my-topic
description: >
  One-paragraph description of what this skill covers.
  Mention object types, APIs, or workflows.
argument-hint: "[optional: describe what argument to pass]"
---
```

Then write the knowledge content in markdown. Use code blocks for all examples. Be prescriptive: choose one approach per problem rather than listing alternatives without guidance.

See `CONTRIBUTING.md` for the full skill contribution guide.
