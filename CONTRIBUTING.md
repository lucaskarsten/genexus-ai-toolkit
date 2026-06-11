# Contributing to genexus-ai-toolkit

Thank you for contributing to the GeneXus community toolkit. These guidelines keep contributions consistent and useful for everyone.

---

## Reporting Issues / Bugs

1. Search existing issues before opening a new one.
2. Include your GeneXus version (e.g., GeneXus 18 U12) and compiler/platform (Tomcat, .NET).
3. For UC bugs, include the relevant `.view` snippet and the browser console error.
4. For DSO/CSS issues, include the DSO name, the failing class, and observed vs expected behavior.

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

```genexus
Event Start
    UcExample1.ucid  = !'myInstance'
    UcExample1.Label = "Choose an option"
    UcExample1.Items = &MySDT.ToJson()
EndEvent

Event UcExample1.OnSelect
    &SelectedId = &EventParam
EndEvent
```

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

---

## Code Style

| Rule | Detail |
|------|--------|
| JavaScript | ES5 only: `var`, `function()`, no arrow functions, no template literals |
| CSS | BEM strict, kebab-case, token-first (no hardcoded hex or px when a token exists) |
| GeneXus code | Use `SDT.ToJson()` — never manual string concatenation for JSON |
| Comments | English, concise, explain "why" not "what" |

---

## Pull Request Description Template

```
## What this PR adds/fixes

One sentence.

## Type of change

- [ ] New UC example
- [ ] New skill
- [ ] Documentation fix
- [ ] Bug fix in existing example
- [ ] New script

## Checklist

- [ ] No customer/company-specific data included
- [ ] JavaScript is ES5 (no let/const/arrow)
- [ ] CSS uses BEM kebab-case
- [ ] Tested with GeneXus 18
- [ ] README updated if adding a new file
```

---

## What NOT to include in PRs

- Customer names, project names, or proprietary table/field names
- Hardcoded database connection strings or server paths
- API keys, tokens, or credentials of any kind
- Company-specific business logic or workflows

Keep examples generic so any GeneXus developer can drop them into any project.
