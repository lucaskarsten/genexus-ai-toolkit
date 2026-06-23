# gx18-mcp — Usage Guide

GeneXus 18 MCP server. Reads the KB via direct SQL (zero revisions created); writes via the
native GX18 SDK using the current Windows identity (no Team Development UserId corruption).

> For setup, configuration, build instructions, and architecture details see the README and
> the project docs at https://github.com/lucaskarsten/genexus-ai-toolkit

---

## Tool Overview

### Read tools (SQL — zero revisions)

| Tool | Args | Returns |
|------|------|---------|
| `gx_find` | `pattern`, `type?`, `limit?` | Objects matching name pattern (SQL LIKE) |
| `gx_list` | `type`, `module?`, `limit?`, `offset?` | All objects of a type, paginated |
| `gx_get` | `name`, `type` | Object header + sub-component list |
| `gx_read` | `name`, `type`, `section?` | Reconstructed plain-text source (GZip blob decoded) |
| `gx_properties` | `name`, `type` | Key→value property bag |
| `gx_structure` | `name` | Transaction attribute list (name, type, length, decimals, key) |
| `gx_whoami` | — | Windows user, KB UserId, kbPath, sdkReady |
| `gx_sql` | `query`, `readOnly?`, `confirm?` | SQL on the KB SQL Server database |

### Database tools (named connections)

| Tool | Args | Returns |
|------|------|---------|
| `gx_db_connections` | — | Available connections (`kb`, `oracle` if configured) |
| `gx_db_query` | `connection`, `query`, `readOnly?`, `limit?`, `confirm?` | SQL on named connection |

### Write tools (GX18 SDK — author verified after every save)

All write tools require `confirm: true`. The result always includes `userIdOk`, `userId`,
`expectedUserId` — the tool fails loudly rather than silently writing the wrong author.

| Tool | Args | What it does |
|------|------|--------------|
| `gx_create` | `type`, `name`, sections…, `confirm` | Create new object |
| `gx_modify` | `name`, `type`, `section`, `content`, `confirm` | Replace one section of existing object |
| `gx_export` | `name`, `type`, `outputDir?` | Export to `.xpz` via Knowledge Manager (also validates) |
| `gx_import` | `xpzFile`, `type`, `name`, `fullOverwrite?`, `confirm` | Import `.xpz` via Knowledge Manager native |
| `gx_save_config` | `kbPath?`, `kbDatabase?`, `kbServer?`, `gx18Dir?` | Update server config and restart worker |

**Stubs (registered but not yet implemented):** `gx_set_property`, `gx_rename`, `gx_validate`, `gx_build`

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
| `gx_read type=147 section=events` for UC AfterShow/Methods | `gx_export` → open `.xpz` | gx_read does NOT include UC script parts; export is the only path |
| `gx_import` to edit an existing object's source | `gx_modify section=source confirm:true` | gx_import silently skips existing objects without `fullOverwrite:true` |
| `gx_modify` to edit UC AfterShow/Methods | `gx_export` → patch CDATA → `gx_import` | gx_modify cannot reach UC script parts |
| `gx_read section=properties` for property values | `gx_properties` | gx_read returns the definition XML; gx_properties returns actual values |
| `gx_db_query connection=kb` for KB SQL queries | `gx_sql` | Same database — gx_sql is the direct, preferred path |
| Generating to `output/` when the intent is to write to the KB | `gx_create confirm:true` | output/ is a staging area for human review; gx_create writes directly |
| Assuming UserId is correct and writing immediately | `gx_whoami` first | Wrong author permanently corrupts Team Development history |

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

### Edit UC AfterShow / Methods scripts (the round-trip)
```
gx_whoami
gx_export name=UCMyControl type=147      → generates output/UCMyControl.xpz
# Open the .xpz (it is a ZIP archive containing one XML file)
# Find <Script Name="AfterShow"> … </Script>; edit the CDATA body
# Bump the lastUpdate attribute in <Object …>; recalculate md5 checksum
gx_import xpzFile=output/UCMyControl.xpz type=usercontrol name=UCMyControl fullOverwrite:true confirm:true
gx_export name=UCMyControl type=147      → re-export to verify the edit landed
```

### Edit DSO styles
```
gx_whoami
gx_read name=DsoMyTheme type=161 section=styles    → read current styles
gx_modify name=DsoMyTheme type=161 section=styles content="@import DsoBase;\n.my-class { … }" confirm:true
# ⚠ Use the friendly @import name (e.g. @import DsoBase;)
#   NOT the GUID form (@import @<guid>@) that appears in raw blob decodes — it causes ValidationException
```

### Query Oracle
```
gx_db_connections                    → confirm "oracle" is listed
gx_db_query connection=oracle query="SELECT COUNT(*) FROM USER_TABLES"
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
