# Skills — AI Context Files for GeneXus Development

These skill files load expert GeneXus knowledge into your AI assistant. Each file is a self-contained markdown document that gives your LLM the context needed to generate correct GeneXus code.

---

## Available Skills

| Skill file | What it covers |
|-----------|---------------|
| `genexus-uc.md` | User Control specialist — Properties, Screen Template, AfterShow, data passing, MutationObserver, jQuery, Control Type, CSS, debugging |
| `genexus-expert.md` | Senior GeneXus expert — all object types (UC, DSO, WBP/WBC), ES5 JS, runtime APIs, BEM CSS, KB SQL, build/sync cycle |
| `genexus-kb-sql.md` | Knowledge Base SQL — EntityType mapping, GZip blob format, PowerShell scripts for direct source read/write |

---

## Installing for Different LLMs

### Claude Code

Copy the skill files to your Claude skills directory:

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

Then invoke in a Claude Code session:

```
/genexus-uc Create a dropdown UC called UcNavDropdown
/genexus-expert How do I pass an SDT collection to a UC?
/genexus-kb-sql Read the Events source of WbcMyComponent
```

Skills auto-load when you type the trigger keywords (e.g., "user control", "dso", "aftershow").

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
