# Contributing to genexus-ai-toolkit

Thank you for contributing to the GeneXus community toolkit. These guidelines keep contributions consistent and useful for everyone.

---

## Project structure — what lives where

This repo has two distinct layers:

| Layer | Location | Who uses it |
|---|---|---|
| **Core product** — the MCP server and standalone exe | `packages/gx18-mcp/` | End users, anyone who installs `gx18-mcp` |
| **Toolkit workspace** — skills, docs, agents, examples | `skills/`, `docs/`, `.claude/`, `examples/` | Developers working inside this repo with Claude Code |

**The standalone exe bundles only the core product.** Skills, docs, agents, and examples are workspace tools — they are not included in the exe and not required to use the MCP server.

When contributing, ask yourself: *Is this for the product (gx18-mcp) or the workspace?*

- New MCP tool → `packages/gx18-mcp/src/tools/`
- New UC example → `examples/user-controls/`
- New skill or doc update → `skills/` or `docs/`
- New Claude Code agent → `.claude/agents/`

---

## Reporting Issues / Bugs

1. Search existing issues before opening a new one.
2. Include your GeneXus version (e.g., GeneXus 18 U12) and platform (Tomcat, .NET).
3. For UC bugs, include the relevant `.view` snippet and the browser console error.
4. For gx18-mcp issues, include the output of `gx18-mcp doctor` and the full error message.
5. For DSO/CSS issues, include the DSO name, the failing class, and observed vs expected behavior.

---

## Submitting a New UC Example

A UC example lives in `examples/user-controls/<UcName>/` and must include:

### Required files

| File | Contents |
|------|----------|
| `<UcName>.view` | The complete `.view` file — Definition + Screen Template |
| `README.md` | Description, properties table, integration example (see format below) |

### README format for UC examples

```markdown
# UcExampleName

One-sentence description of what this UC does.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ucid` | string | — | Unique instance ID (always set first in WebPanel) |
| `Label` | string | "" | ... |
| `Items` | string | "[]" | JSON array: [{id, label}] |

## Events

| Event | When fired |
|-------|-----------|
| `OnSelect` | When the user selects an item |

## WebPanel Integration

\`\`\`genexus
Event Start
    UcExample1.ucid  = !'myInstance'
    UcExample1.Label = "Choose an option"
    UcExample1.Items = &MySDT.ToJson()
EndEvent

Event UcExample1.OnSelect
    &SelectedId = &EventParam
EndEvent
\`\`\`

## Notes

Any known limitations or version-specific behavior.
```

### Rules

- No customer names, company names, or proprietary business logic in examples.
- CSS classes must use BEM kebab-case with a unique 3-4 character prefix.
- JavaScript must be ES5: `var`, `function()` — no `let`, `const`, or arrow functions.
- UC properties must use `Type="string"` for numeric values with decimals.
- Test with at least two instances of the UC on the same page before submitting.

---

## Contributing to gx18-mcp (the product)

The core package is in `packages/gx18-mcp/`. It has a TypeScript server + C# worker.

### Dev setup

```bash
cd packages/gx18-mcp
npm install
npm run build           # TypeScript → dist/
npm run build:worker    # C# SDK worker → dist/worker/ (requires .NET SDK)
npm test                # Vitest unit tests
node dist/bin/gx18-mcp.js doctor   # health check
```

### Adding a new MCP tool

1. Implement in `src/tools/` (follow existing tool files)
2. Register in `src/dispatch.ts`
3. Add tests in `test/`
4. Update the tool table in `README.md` and `docs/gx18-mcp.md`

### C# worker

The worker (`packages/gx18-mcp/worker/`) handles GX18 SDK operations. It runs as a subprocess and communicates via JSON-RPC over stdin/stdout. See `docs/gx18-mcp.md` for the architecture.

---

## Contributing a New Skill

Skills live in `skills/` and must have valid YAML frontmatter:

```yaml
---
name: genexus-<topic>
description: >
  One-paragraph description. Mention what object types, APIs, or workflows
  the skill covers. This is what appears in skill registries.
argument-hint: "[optional: describe what argument to pass]"
---
```

### Skill content rules

- Write in English.
- Be prescriptive: choose one approach and explain why, rather than listing multiple options without guidance.
- Include working code examples for every pattern documented.
- Mark GeneXus-version-specific behavior clearly (e.g., "GeneXus 18+").
- Do not include project-specific object names, database names, or customer data.
- Reference `skills/nexa/nexa/references/` for the authoritative GeneXus language spec — add a link rather than duplicating content.

---

## Code Style

| Rule | Detail |
|------|--------|
| JavaScript | ES5 only: `var`, `function()`, no arrow functions, no template literals |
| CSS | BEM strict, kebab-case, token-first (no hardcoded hex or px when a token exists) |
| GeneXus code | Use `SDT.ToJson()` — never manual string concatenation for JSON |
| Comments | English, concise, explain "why" not "what" |
| TypeScript (gx18-mcp) | Strict mode, no `any` unless unavoidable, prefer explicit types |

---

## Pull Request Description Template

```
## What this PR adds/fixes

One sentence.

## Type of change

- [ ] New UC example
- [ ] New skill or doc update
- [ ] gx18-mcp feature / bug fix
- [ ] New Claude Code agent
- [ ] Documentation fix

## Checklist

- [ ] No customer/company-specific data included
- [ ] JavaScript is ES5 (no let/const/arrow) — for UC examples
- [ ] CSS uses BEM kebab-case — for UC/DSO examples
- [ ] `npm test` passes — for gx18-mcp changes
- [ ] README updated if adding a new tool or feature
```

---

## What NOT to include in PRs

- Customer names, project names, or proprietary table/field names
- Hardcoded database connection strings or server paths (e.g., `C:\KBs\MyClientProject`)
- API keys, tokens, or credentials of any kind
- Company-specific business logic or workflows
- FoccoLojas-specific object names, KB names, or Oracle credentials (those belong in `CLAUDE.local.md` which is gitignored)

Keep examples and skills generic so any GeneXus developer can drop them into any project.
