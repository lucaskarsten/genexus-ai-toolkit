# gx18-mcp — Write Safety Checklist

Before calling `gx_modify`, `gx_import`, or `gx_export` on an **existing** object, run the
pre-operation checks below. Skipping them causes silent failures, NullReference errors, and
hours of trial-and-error. Every item here is a real failure mode observed in production sessions.

---

## Before `gx_modify` on an existing object

### Step 1 — Confirm the object has an active version in the model

```sql
SELECT EntityVersionId FROM ModelEntityVersion
WHERE EntityTypeId = <type> AND EntityId = <id>
```

If no row → object is not in the active model. `gx_modify` will fail or create a phantom.

### Step 2 — Confirm ALL parts have non-null, non-zero blobs

```sql
SELECT evc.ComponentEntityTypeId, evc.ComponentEntityId,
       DATALENGTH(ev.EntityVersionData) AS BlobSize,
       CASE WHEN ev.EntityVersionData IS NULL THEN 'NULL' ELSE 'OK' END AS DataStatus
FROM EntityVersionComposition evc
JOIN EntityVersion ev
  ON ev.EntityTypeId = evc.ComponentEntityTypeId
 AND ev.EntityId = evc.ComponentEntityId
 AND ev.EntityVersionId = evc.ComponentEntityVersionId
WHERE evc.CompoundEntityTypeId = <type> AND evc.CompoundEntityId = <id>
  AND evc.CompoundEntityVersionId = (
      SELECT MAX(ev2.EntityVersionId) FROM EntityVersion ev2
      WHERE ev2.EntityTypeId = <type> AND ev2.EntityId = <id>
  )
ORDER BY evc.ComponentEntityTypeId
```

**What to do if a part has NULL or 0 bytes:**

| Part (EntityTypeId) | Fix |
|---|---|
| 62 (Documentation) | Copy blob from a healthy object of the same type via SQL CROSS JOIN UPDATE |
| 57 (Conditions), 69 (Rules) | Set `EntityVersionData = NULL` — SDK tolerates NULL better than 0 bytes |
| Any other part | Do NOT call gx_modify. Use XPZ round-trip instead (gx_export → patch → gx_import) |

### Step 3 — Confirm EntityVersionProperties has required fields (WebPanel / WebComponent only)

WebPanel and WebComponent objects (EntityTypeId=43) require `Theme` and `WebUX` in their
`EntityVersionProperties`. If those are missing, the SDK throws NullReference when loading the object.

```sql
SELECT EntityVersionProperties FROM EntityVersion
WHERE EntityTypeId = 43 AND EntityId = <id>
  AND EntityVersionId = (SELECT MAX(ev2.EntityVersionId) FROM EntityVersion ev2
                         WHERE ev2.EntityTypeId=43 AND ev2.EntityId=<id>)
```

If `Theme` or `WebUX` is absent, add them via SQL UPDATE before calling gx_modify:

```sql
UPDATE EntityVersion SET EntityVersionProperties = '<Properties>
  <Property><Name>Name</Name><Value>YourObjectName</Value></Property>
  <Property><Name>Theme</Name><Value>c804fdbd-7c0b-440d-8527-4316c92649a6-3</Value></Property>
  <Property><Name>WEB_COMP</Name><Value>Yes</Value></Property>
  <Property><Name>WebUX</Name><Value>SMOOTH</Value></Property>
  <Property><Name>FolderType</Name><Value>00000000-0000-0000-0000-000000000008</Value></Property>
  <Property><Name>FolderId</Name><Value>106</Value></Property>
  <Property><Name>IsDefault</Name><Value>False</Value></Property>
</Properties>'
WHERE EntityTypeId = 43 AND EntityId = <id> AND EntityVersionId = <vid>
```

Then kill the worker so the SDK reloads from the DB:
```powershell
Get-Process Gx18Mcp.SdkWorker -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Step 4 — Timestamps are stored in UTC and that is CORRECT — do not "normalize" them

The native GeneXus SDK `Save()` stamps `EntityVersion.EntityVersionTimestamp` **and**
`ModelEntityHistory.HistoryTimestamp` in **UTC**. GeneXus Team Development reads these columns **as UTC
and converts to local** for the "Modified On" column — so the SDK's native UTC stamp is **correct** and
the IDE displays the right local time.

**Do NOT rewrite these columns to local time.** (A row stamped `GETUTCDATE()` shows the right local time
in Team Dev; a row stamped `GETDATE()` shows the UTC→local offset *too early* — e.g. 3h behind in UTC−3.)
An earlier theory held that GeneXus reads the column as local and that future-stamped rows should be
"normalized" to `GETDATE()`. **That theory is wrong** and makes every touched object display the offset
behind in Team Development. The worker no longer normalizes (the method is a no-op).

If you must write a timestamp via direct SQL, use **`GETUTCDATE()`, not `GETDATE()`**. To repair rows
that were wrongly written in local time:

```sql
UPDATE EntityVersion
SET EntityVersionTimestamp = DATEADD(hour, DATEDIFF(hour, GETDATE(), GETUTCDATE()), EntityVersionTimestamp)
WHERE EntityVersionTimestamp < DATEADD(hour, -2, GETUTCDATE())   -- i.e. still in local, not UTC
  AND EntityVersionTimestamp >= CONVERT(date, GETDATE());        -- scope to recent rows you touched
-- same shape for ModelEntityHistory.HistoryTimestamp
```

A genuine *"Knowledge Base was last modified at HH:MM > current system time"* build warning is a real
OS clock / NTP skew (not a UTC-vs-local artifact) — fix it at the clock level (`w32tm /resync`), then
restart the resident worker so it does not carry cached time state. Do not rewrite the columns for it.

### Step 4b — Making an SQL-edited object show as MODIFIED in the IDE / regenerate on build

A direct SQL write to a part blob does **not** create a new `EntityVersion` of the object nor a
`ModelEntityHistory` entry. The IDE therefore does not see the object as modified, and the **incremental
build skips regenerating it** (the generated render.js / Java stays stale even though the KB blob is new).

Do **not** hand-insert `ModelEntityHistory` / `EntityVersion` rows — that is fragile and corrupts easily.
Instead, let the SDK record the change: run a `gx_modify` **on an SDK-path section of the same object,
with a real (non-identical) content difference**. The SDK reloads the object — including the blob you
patched — re-serializes it and `Save()`s, which atomically creates a new `EntityVersion` + a
`ModelEntityHistory` (Op=2) entry + timestamp, **preserving the patched content**. Then `gx_reload`.

Two traps that make this fail silently — confirmed on UserControls (type=147), 2026:

1. **`section="script:*"` does NOT bump the version.** `gx_modify type=147 section="script:AfterShow"`
   (or any `script:<Name>`) returns `op: "modify-uc-script-sql"` and writes the script blob **in-place
   via SQL on the active EntityVersion** — it does **not** go through the SDK `Save()`, so **no new
   EntityVersion and no `ModelEntityHistory` entry** are created. The object stays invisible to Team
   Development and the incremental build. So `script:*` is **not** a valid "idempotent re-save" for this
   purpose — it is the very write that needs a follow-up save.
2. **An identical re-save is a no-op.** Re-writing a section with byte-identical content (e.g.
   `gx_modify section=template` with the exact current template) returns `op: "modify"` but the SDK
   detects no change and does **not** save — `MAX(EntityVersionId)` does not advance.

**Reliable recipe:** after the `script:*` (or SQL blob) write, re-save a real SDK-path section with a
**minimal benign difference**. For a UserControl, regenerate the version by writing `section=template`
with one extra comment line added (e.g. a `/* ... */` inside the `<style>`). That returns `op: "modify"`,
creates a new `EntityVersion` + `ModelEntityHistory` (Op=2) with the correct UserId, and **preserves the
already-patched script blob** (verified by re-export). Confirm it worked:

```sql
SELECT MAX(EntityVersionId) FROM EntityVersion WHERE EntityTypeId = <type> AND EntityId = <id>
```

The max must have advanced. Then `gx_reload`, refresh the Team Development pending list, and Build in the IDE.
For WebPanel/WebComponent (type=43) where `events`/`rules` are SDK-path sections, the same idea applies —
just ensure the re-saved content actually differs from what is stored.

### Step 4c — `EntityType.EntityTypeLastObjectId` drift → "Record already exists" on create

If `gx_create` (or creating an object in the IDE) throws
`EntityDuplicateKeyException: Record already exists` even though the target ids look free, the per-type
id counter is stale. GeneXus allocates the next `EntityId` **per type** from
`EntityType.EntityTypeLastObjectId`, not from `MAX(EntityId)`. Direct SQL inserts of objects/parts do
**not** advance this counter, so `Counter+1` collides with an existing row. This breaks creating *any*
type (an object's parts — Rules 69, Variables 72, etc. — collide too), and fails identically in the IDE
and via MCP. It is **not** a stale in-memory adapter, a duplicate `UdmModel` row, or ghost `Entity`
rows — do not delete those chasing it.

Diagnose and fix (then `gx_reload`):

```sql
-- diagnose: any row with Counter < MAX will collide
SELECT et.EntityTypeId, et.EntityTypeLastObjectId AS Counter,
       (SELECT MAX(e.EntityId) FROM Entity e WHERE e.EntityTypeId = et.EntityTypeId) AS MaxId
FROM EntityType et;

-- fix: resync each per-type counter to the real MAX
UPDATE et SET et.EntityTypeLastObjectId = m.MaxId
FROM EntityType et
JOIN (SELECT EntityTypeId, MAX(EntityId) AS MaxId FROM Entity GROUP BY EntityTypeId) m
  ON m.EntityTypeId = et.EntityTypeId
WHERE et.EntityTypeLastObjectId < m.MaxId;
```

Run this fix routinely after any direct SQL insert of objects/parts into a KB.

### Step 5 — Kill the worker if you made any SQL changes in this session

### Step 5 — Kill the worker if you made any SQL changes in this session

The GX18 SDK keeps the KB in memory after `Open()`. SQL changes made after `Open()` are invisible
to the SDK until the worker restarts. Always kill the worker after any `gx_sql readOnly:false`:

```powershell
Get-Process Gx18Mcp.SdkWorker -ErrorAction SilentlyContinue | Stop-Process -Force
```

The MCP bridge restarts the worker automatically on the next tool call (cold-start ~30s).

---

## Before `gx_import`

### Decide: existing object or new object?

**New object (does not exist in the KB):**
→ Do NOT use `gx_import` via MCP. It creates `EntityVersion` but NOT the part composition
  (`EntityVersionComposition` + blobs). The object becomes a shell that causes NullReference
  on every subsequent `gx_modify`.
→ Use **IDE GX18 → Knowledge Manager → Import** instead.

**Existing object (already exists in the KB):**
→ `gx_import` with `fullOverwrite:true` is safe. Run the checks below.

### Check 1 — Will GeneXus actually create a new version?

GeneXus silently discards the import if `versionDate`/`lastUpdate` in the XPZ is equal to or
older than the version currently in the KB. No error is raised.

To confirm the import actually worked, compare version counts before and after:
```sql
-- Run before import, note the count
SELECT MAX(EntityVersionId) FROM EntityVersion WHERE EntityTypeId=<type> AND EntityId=<id>
-- Run after import, count must increase
SELECT MAX(EntityVersionId) FROM EntityVersion WHERE EntityTypeId=<type> AND EntityId=<id>
```

If the count did not change → import was silently discarded. Fix: bump `lastUpdate` in the XPZ
to a future date and re-import.

### Check 2 — Does the GUID in the XPZ collide with a different object in the KB?

This is critical when moving XPZ files between KB environments (_02 → _03).
A GUID that belongs to object A in _02 may belong to object B in _03.
Importing without checking silently overwrites the wrong object.

```sql
SELECT ev.EntityTypeId, ev.EntityId, ev.EntityVersionName
FROM EntityVersion ev
WHERE ev.EntityVersionProperties LIKE '%YOUR-GUID-HERE%'
```

If a row is returned with a **different name** than the object you are importing → generate a new
GUID for the object in the XPZ before importing.

### Check 3 — Are all prerequisites in the target KB?

Variables that reference SDTs or domains that do not exist in the KB cause silent validation failure.

Before importing a WebPanel or WebComponent, confirm the SDTs it references exist:
```sql
SELECT ev.EntityVersionName FROM EntityVersion ev
WHERE ev.EntityTypeId = 36 AND ev.EntityVersionName = 'SdtYourSdtName'
```

If not found → import the SDT first, then the WebPanel/WebComponent.

### Check 4 — Is the KB you are importing into correct?

```
gx_whoami   → verify active KB matches the target environment
```

---

## Before `gx_export`

### Check 1 — Kill the worker if you made SQL changes in this session

The SDK exports from its in-memory model, not from the DB directly. If you edited blobs via SQL
without restarting the worker, the export will reflect the old state.

```powershell
Get-Process Gx18Mcp.SdkWorker -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Check 2 — Object is in the active model

```sql
SELECT EntityVersionId FROM ModelEntityVersion
WHERE EntityTypeId = <type> AND EntityId = <id>
```

`gx_export` may return false / empty XPZ for objects not in the active model.

---

## Diagnosing silent failures after import

When `gx_import` returned `ok` but the change does not appear in the IDE or at runtime:

1. **Version not created** → `lastUpdate` in XPZ was not newer than KB. Bump date, re-import.
2. **ValidationException (silent)** → A variable references an SDT/domain/attribute that does not
   exist in the KB. Check all `idBasedOn` and `ATTCUSTOMTYPE` references in the XPZ Variables section.
3. **Wrong KB** → `gx_whoami` showed a different KB than expected. Correct `GX_KB_DATABASE` in `.env`
   and restart the MCP server.
4. **GUID collision** → Object was imported into the wrong EntityId slot. Use the GUID SQL check above.
5. **Tag mismatch** → XPZ root must be `<ExportFile>...</ExportFile>`, NOT `<KMW>`. A wrong root tag
   causes the import to process zero objects with no error.

---

## SDT fields in XPZ — avoid `idBasedOn=Attribute`

SDT items with `idBasedOn=Attribute:ILJ_xxx` cause the SDK to use the attribute's column name
instead of the item's `name`. If the attribute does not exist in the target KB, the field name
becomes empty or invalid, causing `src0216: 'FieldName' invalid property` in every object
that references the SDT.

**Always use `ATTCUSTOMTYPE` for free fields in an SDT:**

```xml
<Item name="ProjetoDisplay" ...>
  <Properties>
    <Property><Name>Name</Name><Value>ProjetoDisplay</Value></Property>
    <Property><Name>ATTCUSTOMTYPE</Name><Value>bas:VarChar</Value></Property>
    <Property><Name>Length</Name><Value>80</Value></Property>
  </Properties>
</Item>
```

Valid `ATTCUSTOMTYPE` base values: `bas:Character`, `bas:VarChar`, `bas:Numeric`,
`bas:Int`, `bas:Date`, `bas:DateTime`, `bas:Boolean`, `bas:GUID`.

For a domain: `idBasedOn=Domain:NomeDominio` is safe (only attribute-based is unsafe).

---

## GeneXus 18 syntax pitfalls

| Pitfall | Wrong | Correct |
|---|---|---|
| Inline new() in collection | `&col.Add(new())` | `&item = new() ; &item.F = v ; &col.Add(&item)` |
| DateTime without format | `&dt.ToFormattedString()` | Assign to `Date` var first, then call `ToFormattedString()` |
| SDT with AttCollection on root | Root-level `AttCollection=True` makes vars auto-collection | Remove the flag in the IDE if individual access is needed |
| gx_variable for SDT vars | `gx_variable` only supports base types | Use XPZ Variables section patch for SDT / domain / collection vars |
| `.IsEmpty()` on undeclared Character var | `if &CharVar.IsEmpty()` | `if &CharVar <> ''` |
| Assign VarChar to a domain var | `&DomainVar = &CharVar` | `&DomainVar = MyDomain.Convert(&CharVar)` |
| `.ToString()` on a domain var (e.g. in WebSession.Set) | `&WebSession.Set(&k, &DomainVar.ToString())` | `&Char = &DomainVar` (implicit convert) then `&WebSession.Set(&k, &Char)` |
| `return` inside a `Sub` with nested `For Each ... When None` | `Sub 'X' ... For Each ... return ... EndSub` | Keep the `return`s in the main body, not in a subroutine |
| Default value on a `Parm` parameter | `Parm(in:&p=MyDomain.Sim, ...)` | Not supported by the GX18 generator — the new param is mandatory; every caller must pass it |
| `not exists(Table where ...)` inline | `where not exists(Table where ...)` | Use nested `For Each ... When None` to express "does not exist" |

---

## ValidationException on `gx_modify` section=source/rules (Procedure)

`gx_modify` returns a generic `ValidationException: A validação de Procedure '<name>' falhou` with **no line number**.
The write is rejected (KB untouched). To find the offending construct, **isolate incrementally**:

1. First re-save the original known-good source — confirms the worker/KB are healthy (not a stale-worker crash).
2. Add ONE block/line at a time and re-save until it fails. The last addition is the culprit.

The most common culprits are the syntax pitfalls in the table above (domain assignment, `.IsEmpty()`,
`.ToString()`, default on Parm). The specifier's detailed message is not surfaced through MCP, so
incremental isolation is the only reliable way.

**Worker crash (exit code -1 / 4294967295) on `gx_modify`:** after direct SQL writes the resident worker
can enter a bad state and crash deterministically on the next SDK write. `gx_reload` (restart + fresh Open)
clears it. If the KB Open itself fails with `NotSupportedException: memory stream is not expandable`, a blob
has a corrupted declared-size header — see the blob-repair section / `feedback_kb_blob_repair`.

---

## `gx_where_used` has a blind spot — do not trust it alone before changing a signature

`gx_where_used` / `gx_analyze usedby` does **not** list every caller. Observed: it failed to list a
WebComponent header that demonstrably calls a procedure (the call lived in a UserControl-driven
subroutine inside a tokenized Events blob, which is not indexed).

**Implication:** before adding/removing a **parameter** on a procedure (which is always mandatory in GX18 —
no Parm defaults), an undetected caller will break the build silently. Cross-check with a grep of the
generated Java (`grep "new <procname>("`) and the runtime stack if available.

**Prefer changes that keep the `Parm` signature stable** when the caller set is uncertain: an internal
WebSession cache, a session flag read inside the proc, etc. Example pattern — caching an expensive
per-row helper to collapse an N+1 in a master-page header (computes once per distinct key per session):

```
&CacheKey = !"MyCache_" + Trim(Str(&Id, 9, 0))
&CacheVal = &WebSession.Get(&CacheKey)
if &CacheVal <> ''
    &Out = MyDomain.Convert(&CacheVal)
    return
endif
... compute &Out ...
&CacheVal = &Out               // domain → Character (implicit), do NOT use .ToString()
&WebSession.Set(&CacheKey, &CacheVal)
```

This avoids rewriting the whole Events of a type=43 caller. `gx_modify events` itself works (the SDK
tokenizes headless), but rewriting the *entire* Events block is fragile — see the Events editing note
below for the safe ways to make a small change.

---

## Reading tokenized Events (type=43) from the blob when export comes back empty

`gx_export` of a type=43 object via the SQL fallback sometimes returns an 18-byte (empty) Events script.
The real Events live in the part blob (ComponentEntityTypeId=64). To read the actual source: `DECOMPRESS`
the blob (skip the 11-byte header), then rebuild by concatenating the `<Word>` tokens in order:

```bash
grep -o '<Word>[^<]*</Word>' token.xml | sed 's|<Word>||g; s|</Word>||g' | tr -d '\n'
```

The reconstruction is faithful (indentation, subs preserved) and is good for **reading/auditing**.

### Editing type=43 Events — `gx_modify` is the path, even for a full-section rewrite

`gx_modify section=events` **works** — the SDK tokenizes the source headless and rejects invalid source
with a `ValidationException` (KB untouched), exactly like a Procedure. This includes **rewriting the
entire Events section** (proven: a ~250-line full-section reorder saved on the first try with
well-formed source). The old claim that "rewriting the whole Events block is fragile, prefer a token
patch" was **wrong** and led to needless SQL blob surgery. One real caution:

- **Never retype Events from the DISPLAYED text.** `gx_read events` returns correct source in its `text`
  field, but the MCP terminal display *collapses whitespace* (`For Each Trn` shows as `For EachTrn`).
  Hand-build the source with real spaces/newlines, or use the raw `text` value. Collapsed text →
  fused tokens (`EndIfIf`, `SimAnd`) → `ValidationException` (see the section above on src0057).

To change even one thing (e.g. swap a called procedure's name), rewrite the section via `gx_modify` —
do **not** reach for token-blob SQL surgery on the part (ComponentEntityTypeId=64). A successful
`gx_modify` creates the `EntityVersion` + `ModelEntityHistory` entry automatically, so incremental
build (F5) sees the change; an SQL blob patch does not.

### `gx_modify` ValidationException ≠ "object is pre-broken" — it's almost always YOUR source

When `gx_modify section=events` fails with `ValidationException`, the overwhelmingly likely cause is
**malformed source you supplied**, NOT a pre-existing fault in the object. Two traps that produced this
in practice:

1. **Tokens run together with no separator.** If you build the source from a token-blob dump or from the
   collapsed-whitespace MCP display, adjacent keywords fuse: `EndIf` + `If` → `EndIfIf`, `Sim` + `And` →
   `SimAnd`, `.SetEmpty()` + `If` → `.SetEmpty()If`. The GX parser reads `EndIfIf` as one identifier and
   reports `error src0057: Expecting 'EndIf' command to close the 'If' block`. Always feed `gx_modify`
   real source with spaces/newlines between statements — never the collapsed display text.
2. **Unbalanced If/EndIf** from a hand-reordered block. Count them.

**Do NOT conclude the object is "pre-broken" and fall back to SQL blob surgery.** `gx_validate` is a
stub (it only confirms the object exists — see its own `note`), so a green `gx_validate` says nothing
about syntax; do not trust it to clear your source. The authoritative syntax check is the actual
`gx_modify` save (or the IDE Build All output, e.g. `src0057 … Line/Char`). Fix the source until
`gx_modify` returns `op: modify` — it will, and that path creates the `EntityVersion` +
`ModelEntityHistory` entry automatically, so incremental build (F5) sees the change. Reserve token-blob
SQL surgery for the genuinely rare case where the SDK save path is proven unavailable — and even then,
prefer fixing whatever blocks the save so the SDK path works.
