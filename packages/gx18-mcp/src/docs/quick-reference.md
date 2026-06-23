# gx18-mcp — Quick Reference

GeneXus 18 MCP server. Reads via direct SQL (zero revisions); writes via native GX18 SDK
with the correct Windows UserId (no Team Development corruption).

---

## Tool → Task Decision Table

| Task | Tool | NEVER use instead |
|------|------|-------------------|
| Find object by name | `gx_find` | Manual SQL on `EntityVersion` |
| List objects in a module | `gx_list type=N module=M` | `gx_find` without module filter |
| Read procedure / WBP source | `gx_read type=34/43 section=source` | Generated Java in `javaoracle/web/src/` |
| Read UC template (HTML/CSS) | `gx_read type=147 section=source` | `render.js` in `static/` (regenerated on every build) |
| Read UC AfterShow / Methods scripts | `gx_export` → open `.xpz` (ZIP) | `gx_read` — script parts are NOT included |
| Read object property values | `gx_properties` | `gx_read section=properties` — that returns definition XML, not values |
| Read Transaction attribute structure | `gx_structure` | SQL on `EntityVersionComposition` |
| Verify Windows identity before writing | `gx_whoami` | Assuming UserId is correct |
| Create a new object in the KB | `gx_create confirm:true` | Generating to `output/` when the intent is a KB write |
| Edit source / events of existing object | `gx_modify confirm:true` | `gx_import` — does NOT overwrite existing objects |
| Edit UC AfterShow / Methods scripts | `gx_export` → patch CDATA → `gx_import` | `gx_modify` — cannot reach UC script parts |
| Ad-hoc KB SQL query (SQL Server) | `gx_sql` | `gx_db_query connection=kb` — redundant, same target |
| Oracle database query | `gx_db_query connection=oracle` | `gx_sql` — cannot reach Oracle |

---

## EntityTypeIds

Used as the `type` parameter in `gx_read`, `gx_modify`, `gx_export`, `gx_import`, `gx_list`.

| Id | Object Type | Id | Object Type |
|----|-------------|----|-------------|
| 34 | Procedure | 147 | UserControl |
| 36 | SDT | 161 | DSO (Design System Object) |
| 39 | Transaction | 86 | API |
| 43 | WebPanel **and** WebComponent | 88 | DataSelector |

> `43` is the SDK value for both WebPanel and WebComponent. Raw SQL on `EntityVersion`
> may return different values depending on the KB — always use `43` for tool calls.

---

## Sections

Used as the `section` parameter in `gx_read` and `gx_modify`.

| Section | Applies to | Content |
|---------|-----------|---------|
| `source` | Procedure, API, DSO | Procedure code / API service group / DSO styles (alias) |
| `events` | WebPanel, WebComponent, Transaction | Events code |
| `rules` | Procedure, Transaction | Rules |
| `layout` | WebPanel, WebComponent | WebForm layout (editable text) |
| `variables` | Any | Object variables |
| `properties` | UserControl | UC property definitions XML |
| `template` | UserControl | UC screen template HTML/CSS |
| `tokens` | DSO | Design tokens |
| `styles` | DSO | Design styles |
| `elements` | DSO | Design elements |

---

## Mandatory Sequences

### Before any write operation
```
1. gx_whoami                  → verify Windows identity (wrong UserId corrupts Team Development)
2. gx_find pattern=<name>     → confirm object exists (modify) or doesn't (create)
```

### Read UC AfterShow / Methods scripts
```
gx_export name=X type=147
# Open output/X.xpz (it's a ZIP)
# Scripts are in CDATA blocks: <Script Name="AfterShow">...</Script>
```

### Edit UC AfterShow / Methods scripts
```
gx_whoami
gx_export name=X type=147
# Edit CDATA in .xpz; bump lastUpdate; recalculate md5 checksum
gx_import xpzFile=output/X.xpz type=usercontrol name=X fullOverwrite:true confirm:true
gx_export name=X type=147    # re-export to verify the edit landed
```

### Edit DSO styles
```
gx_whoami
gx_read name=X type=161 section=styles   # read current styles
gx_modify name=X type=161 section=styles content="@import DsoBase;\n..." confirm:true
# ⚠ Use the friendly @import name (e.g. @import DsoBase;)
#   NOT the GUID form (@import @<guid>@) that appears in the raw blob — it causes ValidationException
```

### Create a new procedure
```
gx_whoami
gx_find pattern=PrcFoccoMyProc   # confirm it doesn't exist yet
gx_create type=procedure name=PrcFoccoMyProc source="..." confirm:true
gx_export name=PrcFoccoMyProc type=34   # validate + backup .xpz
```

### Edit source of existing object
```
gx_whoami
gx_read name=X type=N section=source   # read current content
gx_modify name=X type=N section=source content="..." confirm:true
```

---

## Write Tool Reference

All write tools require `confirm: true`. The result includes `userIdOk`, `userId`, `expectedUserId` —
if the author does not match the current Windows user, the tool fails instead of silently writing
the wrong author to Team Development.

| Tool | What it does | Key constraint |
|------|-------------|----------------|
| `gx_create` | Create new object | `confirm:true`; call `gx_find` first to avoid duplicates |
| `gx_modify` | Replace a section of existing object | Cannot reach UC AfterShow/Methods |
| `gx_export` | Export to `.xpz` via Knowledge Manager | Also validates the object |
| `gx_import` | Import `.xpz` via Knowledge Manager (native GX18) | Use for UC scripts and new objects; does NOT overwrite existing without `fullOverwrite:true` |

**Stubs (not yet implemented):** `gx_set_property`, `gx_rename`, `gx_validate`, `gx_build`

---

## Safety Rules

- **Never write to a live KB without testing in a clone first.**
- **gxnext MCP is forbidden for writes on GeneXus 18 KBs** — on 2026-06-17 it caused ~76k
  spurious revisions in Team Development, requiring 6 hours of SQL recovery.
  Safe gxnext tools (no KB session): `export_kb_to_text`, `validate_kb_text_files`,
  `get_kb_property`, `search_modules`.
- **All writes go through gx18-mcp tools or the GX18 IDE — never gxnext.**
