# gx18-mcp — Usage Guide

GeneXus 18 MCP server. Reads the KB via direct SQL (zero revisions created); writes via the
native GX18 SDK using the current Windows identity (no Team Development UserId corruption).

> For setup, configuration, build instructions, and architecture details see the README and
> the project docs at https://github.com/lucaskarsten/genexus-ai-toolkit

---

## Tool Overview (47 tools)

### Read tools — SQL, zero revisions

| Tool | Args | Returns |
|------|------|---------|
| `gx_find` | `pattern`, `type?`, `limit?` | Objects matching name pattern (SQL LIKE) |
| `gx_list` | `type`, `module?`, `limit?`, `offset?` | All objects of a type, paginated |
| `gx_get` | `name`, `type` | Object header + sub-component list |
| `gx_read` | `name`, `type`, `section?` | Reconstructed plain-text source (GZip blob decoded) |
| `gx_properties` | `name`, `type` | Key→value property bag |
| `gx_structure` | `name` | Transaction attribute list (name, type, length, decimals, key) |
| `gx_attribute` | `pattern?`, `limit?` | KB attributes with type, length, decimals, domain |
| `gx_whoami` | — | Windows user, KB UserId, kbPath, sdkReady |

### Analysis tools — SQL, zero revisions

| Tool | Args | Returns |
|------|------|---------|
| `gx_analyze` | `name`, `type`, `action` | usedby / uses / dependencies |
| `gx_where_used` | `name`, `type`, `limit?`, `exclude?` | Objects that reference this object |
| `gx_impact` | `name`, `type?`, `depth?` | Transitive impact graph up to N levels |
| `gx_dead_code` | `type?`, `module?`, `limit?`, `exclude?` | Objects with no inbound references |
| `gx_search` | `pattern`, `type?`, `section?`, `limit?`, `module?` | Text matches across KB sources |
| `gx_lint` | `type?`, `module?`, `severity?` | Bad patterns (jQuery reflow, missing guards, etc.) |
| `gx_diff` | `name`, `type`, `section?`, `versionA?`, `versionB?` | Source diff between revisions |
| `gx_compare` | `name`, `type`, `targetDb`, `section?` | Source diff between two KBs |
| `gx_stats` | `module?` | Object counts by type and module; recently modified |
| `gx_history` | `name`, `type`, `limit?` | Revision history (author, timestamp, description) |

### Write tools — GX18 SDK, author verified after every save

All write tools require `confirm: true`. Result always includes `userIdOk`, `userId`,
`expectedUserId` — fails loudly rather than silently writing the wrong author.

| Tool | Args | What it does |
|------|------|--------------|
| `gx_create` | `type`, `name`, sections…, `confirm` | Create new object |
| `gx_modify` | `name`, `type`, `section`, `content`, `confirm` | Replace one section of existing object |
| `gx_set_property` | `name`, `type`, `property`, `value`, `confirm` | Set a named property (Title, IsPrivate, etc.) |
| `gx_rename` | `name`, `type`, `newName`, `confirm` | Rename an object |
| `gx_delete` | `name`, `type`, `dryRun?`, `confirm` | Delete object (irreversible; use dryRun first) |
| `gx_variable` | `action`, `name`, `type`, `varName?`, `dataType?`, `confirm?` | List/add/delete variables |
| `gx_clone` | `type`, `name`, `newName`, `module?`, `confirm` | Copy to new name |
| `gx_bulk_modify` | `type`, `names[]`, `section`, `content`, `confirm` | Apply same section to multiple objects |
| `gx_move` | `name`, `type`, `targetModule`, `confirm` | Move to different module |
| `gx_export` | `name`, `type`, `outputDir?` | Export to `.xpz` via Knowledge Manager (also validates) |
| `gx_import` | `xpzFile`, `type`, `name`, `fullOverwrite?`, `confirm` | Import `.xpz` via Knowledge Manager native |

**gx_build** always returns an error — headless compilation is not supported. Use the GX18 IDE.

### XPZ archive tools — file operations, no KB connection needed

| Tool | Args | What it does |
|------|------|--------------|
| `gx_read_xpz` | `xpzFile`, `scriptName?` | List scripts in `.xpz` or read a specific script's CDATA |
| `gx_patch_xpz` | `xpzFile`, `scriptName`, `content`, `outputFile?` | Patch a script CDATA → new `.xpz` file |

### Database tools — named connections

| Tool | Args | Returns |
|------|------|---------|
| `gx_sql` | `query`, `readOnly?`, `confirm?` | SQL on the KB SQL Server database |
| `gx_db_connections` | — | Available connections (`kb`, `oracle` if configured) |
| `gx_db_query` | `connection`, `query`, `readOnly?`, `limit?`, `confirm?` | SQL on named connection |

### Configuration & server tools

| Tool | Args | What it does |
|------|------|--------------|
| `gx_save_config` | `kbPath?`, `kbDatabase?`, `kbServer?`, `gx18Dir?` | Update server config and restart worker |
| `gx_doctor` | — | Health check (worker, GX18 dir, KB path, SQL) |
| `gx_reload` | — | Restart worker, reopen KB fresh |
| `gx_validate` | `name`, `type` | Validate object for syntax errors |
| `gx_modules` | — | List all KB modules with hierarchy |

---

## EntityTypeIds

Used as the `type` parameter in `gx_read`, `gx_modify`, `gx_export`, `gx_import`, `gx_list`.

| Id | Type | Id | Type |
|----|------|----|------|
| 34 | Procedure | 147 | UserControl |
| 36 | SDT | 161 | DSO |
| 39 | Transaction | 86 | API |
| 43 | WebPanel / WebComponent | 88 | DataSelector |

> `43` is the SDK value for both WebPanel and WebComponent. Raw SQL on `EntityVersion` may
> return different numeric values depending on the KB — always use `43` for tool calls.

---

## Sections

Used as the `section` parameter in `gx_read` and `gx_modify`.

| Section | Object types | Content |
|---------|-------------|---------|
| `source` | Procedure, DSO | Procedure code; DSO styles (alias) |
| `events` | WebPanel, WebComponent, Transaction | Events code |
| `rules` | Procedure, Transaction | Rules |
| `layout` | WebPanel, WebComponent | WebForm layout (editable text) |
| `variables` | Any | Object variables |
| `template` | UserControl | Screen template HTML/CSS |
| `properties` | UserControl | Property definitions XML |
| `tokens` | DSO | Design tokens |
| `styles` | DSO | Design styles |
| `elements` | DSO | Design elements |

---

## Anti-patterns — Common Wrong Paths

| ❌ Wrong path | ✅ Correct tool | Why |
|---|---|---|
| Reading `javaoracle/web/src/main/java/<proc>.java` | `gx_read type=34 section=source` | Java is generated and may be stale; KB source is canonical |
| Reading `static/UserControls/<uc>render.js` | `gx_read type=147 section=source` | render.js is regenerated on every build; edits are lost |
| SQL `SELECT … FROM EntityVersion WHERE EntityVersionName LIKE '%X%'` | `gx_find pattern=X` | gx_find returns formatted results with real entityTypeId |
| SQL on `EntityVersionComposition` for TRN structure | `gx_structure name=X` | gx_structure decodes the blob and returns structured output |
| `gx_read type=147 section=events` for UC AfterShow/Methods | `gx_export` → `gx_read_xpz` | gx_read does NOT include UC script parts; XPZ is the only path |
| Manual ZIP/regex on .xpz to read scripts | `gx_read_xpz` | Handles encoding, CDATA parsing, and script listing automatically |
| Manual ZIP/regex on .xpz to patch scripts | `gx_patch_xpz` | Bumps lastUpdate, zeroes checksum, writes correct BOM/CRLF encoding |
| `gx_import` to edit an existing object's source | `gx_modify section=source confirm:true` | gx_import skips existing objects without `fullOverwrite:true` |
| `gx_modify` to edit UC AfterShow/Methods | `gx_export` → `gx_patch_xpz` → `gx_import` | gx_modify cannot reach UC script parts |
| `gx_read section=properties` for property values | `gx_properties` | gx_read returns the definition XML; gx_properties returns actual values |
| `gx_db_query connection=kb` for KB SQL queries | `gx_sql` | Same database — gx_sql is the direct, preferred path |
| Generating to `output/` when the intent is to write to the KB | `gx_create confirm:true` | output/ is a staging area for human review; gx_create writes directly |
| Assuming UserId is correct and writing immediately | `gx_whoami` first | Wrong author permanently corrupts Team Development history |
| Guessing impact of a change | `gx_impact name=X depth=2` | Traverses usedby graph transitively up to N levels |
| Calling gxnext write tools on a GX18 KB | `gx18-mcp tools or GX18 IDE` | gxnext caused 76k spurious TD revisions — irreversible without SQL recovery |

---

## Complete Workflow Examples

### Read the source of any object
```
gx_find pattern=PrcMyProcedure       → confirms entityTypeId (34 for procedure)
gx_read name=PrcMyProcedure type=34 section=source
```

### Create a new procedure
```
gx_whoami                            → verify Windows identity
gx_find pattern=PrcFoccoMyProc      → confirm it does not exist
gx_create type=procedure name=PrcFoccoMyProc source="msg(\"hello\")" confirm:true
gx_export name=PrcFoccoMyProc type=34   → validate + backup .xpz
```

### Edit source of an existing object
```
gx_whoami
gx_read name=X type=34 section=source    → read current content
gx_modify name=X type=34 section=source content="..." confirm:true
```

### Edit UC AfterShow / Methods scripts (tool-based round-trip)
```
gx_whoami
gx_export name=UCMyControl type=147      → generates output/UCMyControl.xpz
gx_read_xpz xpzFile=output/UCMyControl.xpz                  → list all scripts
gx_read_xpz xpzFile=output/UCMyControl.xpz scriptName=AfterShow  → read current script
gx_patch_xpz xpzFile=output/UCMyControl.xpz scriptName=AfterShow content="..." outputFile=output/UCMyControl_patched.xpz
gx_import xpzFile=output/UCMyControl_patched.xpz type=usercontrol name=UCMyControl fullOverwrite:true confirm:true
gx_export name=UCMyControl type=147      → re-export to verify the edit landed
```

> See resource `gx18://docs/xpz-workflow` for the full annotated guide, including pitfalls.

### Edit DSO styles
```
gx_whoami
gx_read name=DsoMyTheme type=161 section=styles    → read current styles
gx_modify name=DsoMyTheme type=161 section=styles content="@import DsoBase;\n.my-class { … }" confirm:true
# ⚠ Use the friendly @import name (e.g. @import DsoBase;)
#   NOT the GUID form (@import @<guid>@) that appears in raw blob decodes — it causes ValidationException
```

### Analysis & Inspection
```
# Who calls this procedure?
gx_where_used name=PrcVenCalcDesconto type=34

# What would break if I change this UC?
gx_impact name=UCTooltip depth=2

# Are there dead procedures in the VEN module?
gx_dead_code type=34 module=VEN

# What changed in the last 2 revisions?
gx_diff name=PrcVenCalcDesconto type=34

# Are there jQuery reflow patterns in UCs?
gx_lint type=147
```

### Query Oracle
```
gx_db_connections                    → confirm "oracle" is listed
gx_db_query connection=oracle query="SELECT COUNT(*) FROM USER_TABLES"
```

### After direct SQL write to KB metadata
```
gx_sql query="UPDATE EntityVersion SET EntityVersionDescription=... WHERE ..." readOnly:false confirm:true
gx_reload    → restart worker so SDK cache is cleared; worker reopens KB fresh (~30s)
```

---

## `gx_create` — Sections per Type

| Type | Accepted sections |
|------|------------------|
| `procedure` | `source`, `rules`, `conditions` |
| `webpanel`, `webcomponent` | `events`, `rules`, `conditions`, `layout` |
| `api` | `source` (service group), `events` |
| `usercontrol` | `template`, `properties` |
| `dso` | `tokens`, `styles`, `elements` |
| `sdt`, `transaction` | `structure` (array of `{ name, type, length?, decimals?, key? }`) |

`structure` member `type` values: `Character`, `VarChar`, `LongVarChar`, `Numeric`, `Int`,
`Date`, `DateTime`, `Boolean`, `GUID`.

---

## Safety Rules

1. **Test writes in a KB clone, never in the live KB.**
2. **gxnext MCP is forbidden for writes on GeneXus 18 KBs.** On 2026-06-17 it caused ~76k
   spurious Team Development revisions, requiring 6 hours of SQL recovery.
   Safe gxnext-only tools (no KB session opened): `export_kb_to_text`,
   `validate_kb_text_files`, `get_kb_property`, `search_modules`.
3. **All writes → gx18-mcp tools or the GX18 IDE. Never gxnext.**
4. **`GX18_READONLY=1`** disables all write tools server-side (useful for read-only environments).
5. **After direct SQL writes to KB metadata**, call `gx_reload` — the SDK worker caches the object model.
