# gx18-mcp — Quick Reference

GeneXus 18 MCP server. Reads via direct SQL (zero revisions); writes via native GX18 SDK
with the correct Windows UserId (no Team Development corruption). **47 tools total.**

---

## Tool → Task Decision Table

| Task | Tool | NEVER use instead |
|------|------|-------------------|
| Find object by name | `gx_find` | Manual SQL on `EntityVersion` |
| List objects in a module | `gx_list type=N module=M` | `gx_find` without module filter |
| Read procedure / WBP source | `gx_read type=34/43 section=source` | Generated Java in `javaoracle/web/src/` |
| Read UC template (HTML/CSS) | `gx_read type=147 section=source` | `render.js` in `static/` (regenerated on every build) |
| Read UC AfterShow / Methods scripts | `gx_export` → `gx_read_xpz` | `gx_read` — script parts are NOT included |
| Patch UC AfterShow / Methods scripts | `gx_patch_xpz` → `gx_import` | `gx_modify` — cannot reach UC script parts |
| Read object property values | `gx_properties` | `gx_read section=properties` — that returns definition XML, not values |
| Read Transaction attribute structure | `gx_structure` | SQL on `EntityVersionComposition` |
| Find where an object is referenced | `gx_where_used` or `gx_analyze action=usedby` | Text search in source files |
| Find what an object depends on | `gx_analyze action=uses` | Manual inspection |
| Transitive impact before refactor | `gx_impact depth=2` | Guessing |
| Find unused procedures/UCs | `gx_dead_code type=34` | — |
| Search text across all sources | `gx_search pattern=X` | SQL on blob columns |
| Scan for bad patterns (jQuery reflow, etc.) | `gx_lint` | Code review only |
| Diff between two revisions | `gx_diff name=X type=N` | Manual inspection |
| Compare source across two KBs | `gx_compare name=X targetDb=Y` | Exporting both and diffing |
| KB statistics / recently modified | `gx_stats` | — |
| Revision history of an object | `gx_history` | SQL on `EntityVersion` |
| List all modules | `gx_modules` | SQL on `EntityVersion WHERE EntityTypeId=100` |
| Move object to a different module | `gx_move targetModule=X confirm:true` | SQL UPDATE on `ModelEntityVersion` |
| List KB attributes | `gx_attribute pattern=Client%` | SQL on attribute tables |
| Verify Windows identity before writing | `gx_whoami` | Assuming UserId is correct |
| Create a new object in the KB | `gx_create confirm:true` | Generating to `output/` when the intent is a KB write |
| Edit source / events of existing object | `gx_modify confirm:true` | `gx_import` — does NOT overwrite existing objects without fullOverwrite |
| Edit UC AfterShow / Methods scripts | `gx_export` → `gx_read_xpz` → `gx_patch_xpz` → `gx_import` | `gx_modify` |
| Edit DSO styles | `gx_modify type=161 section=styles content="@import DsoBase;..."` | GUID form `@import @<guid>@` (causes ValidationException) |
| Set a property (Title, IsPrivate, etc.) | `gx_set_property confirm:true` | SQL UPDATE (bypasses SDK validation) |
| Rename an object | `gx_rename confirm:true` | SQL UPDATE (won't update callers) |
| Delete an object | `gx_delete confirm:true` (use dryRun:true first) | SQL DELETE (orphans parts) |
| Manage variables (list/add/delete) | `gx_variable action=list/add/delete` | Manual XML editing |
| Clone to a new name | `gx_clone confirm:true` | `gx_create` when source is similar enough |
| Apply same section to multiple objects | `gx_bulk_modify confirm:true` | Loop of gx_modify calls |
| Ad-hoc KB SQL query (SQL Server) | `gx_sql` | `gx_db_query connection=kb` — redundant, same target |
| Oracle database query | `gx_db_query connection=oracle` | `gx_sql` — cannot reach Oracle |
| Health check | `gx_doctor` | — |
| Reload KB after direct SQL write | `gx_reload` | Assuming worker saw the change (SDK uses cache) |

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

> ⚠️ **Before `gx_modify`, `gx_import`, or `gx_export` on an existing object**, run the
> pre-flight checks in `gx18://docs/write-safety`. Skipping them causes silent failures
> and NullReference errors that look like bugs but are missing preconditions.

### Read UC AfterShow / Methods scripts (new tool-based workflow)
```
gx_export name=X type=147
gx_read_xpz xpzFile=output/X.xpz            → list all scripts with sizes
gx_read_xpz xpzFile=output/X.xpz scriptName=AfterShow   → read script content
```

### Edit UC AfterShow / Methods scripts
```
gx_whoami
gx_export name=X type=147
gx_read_xpz xpzFile=output/X.xpz scriptName=AfterShow   → read current script
gx_patch_xpz xpzFile=output/X.xpz scriptName=AfterShow content="..." outputFile=output/X_patched.xpz
gx_import xpzFile=output/X_patched.xpz type=usercontrol name=X fullOverwrite:true confirm:true
gx_export name=X type=147    → re-export to verify edit landed
```

> See resource `gx18://docs/xpz-workflow` for the full annotated guide with pitfalls.

### Edit DSO styles
```
gx_whoami
gx_read name=X type=161 section=styles   → read current styles
gx_modify name=X type=161 section=styles content="@import DsoBase;\n..." confirm:true
# ⚠ Use the friendly @import name (e.g. @import DsoBase;)
#   NOT the GUID form (@import @<guid>@) — causes ValidationException
```

### Analyze impact before refactoring
```
gx_where_used name=PrcMyProc type=34      → direct callers
gx_impact name=PrcMyProc depth=2          → transitive impact
```

### Create a new procedure
```
gx_whoami
gx_find pattern=PrcFoccoMyProc            → confirm it doesn't exist yet
gx_create type=procedure name=PrcFoccoMyProc source="..." confirm:true
gx_export name=PrcFoccoMyProc type=34     → validate + backup .xpz
```

### After direct SQL write to KB schema
```
gx_sql query="UPDATE EntityVersion ..." readOnly:false confirm:true
gx_reload                                 → restart worker so SDK re-reads KB from database
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
| `gx_set_property` | Set a named property (Title, IsPrivate, etc.) | Use `gx_properties` first to see valid names |
| `gx_rename` | Rename object | Run `gx_where_used` first; propagates to callers |
| `gx_delete` | Delete object (irreversible) | Use `dryRun:true` first |
| `gx_variable` | List/add/delete variables | `add`/`delete` require `confirm:true` |
| `gx_clone` | Copy to new name | Specify `module` to control placement |
| `gx_bulk_modify` | Apply same section to multiple objects | Writes serialized; first failure stops batch |
| `gx_move` | Move to different module | Reflected in IDE after reload |
| `gx_export` | Export to `.xpz` via Knowledge Manager | Also validates the object |
| `gx_patch_xpz` | Patch script in `.xpz` (file-only, no KB write) | Cannot contain `]]>` in new content |
| `gx_import` | Import `.xpz` via Knowledge Manager (native GX18) | Use `fullOverwrite:true` to overwrite existing |

**gx_build** is registered but always returns an error — headless compilation is not supported.
Use the GX18 IDE (F5 / Build All) to compile after writing objects.

---

## Safety Rules

- **Never write to a live KB without testing in a clone first.**
- **gxnext MCP is forbidden for writes on GeneXus 18 KBs** — on 2026-06-17 it caused ~76k
  spurious revisions in Team Development, requiring 6 hours of SQL recovery.
  Safe gxnext tools (no KB session): `export_kb_to_text`, `validate_kb_text_files`,
  `get_kb_property`, `search_modules`.
- **All writes go through gx18-mcp tools or the GX18 IDE — never gxnext.**
- **`GX18_READONLY=1`** disables all write tools server-side.
- **After direct SQL writes to KB metadata**, always call `gx_reload` — the SDK worker caches the model.
