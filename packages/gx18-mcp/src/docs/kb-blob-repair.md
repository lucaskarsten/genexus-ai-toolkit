# gx18-mcp — KB Blob Format & Corruption Repair

Reference for diagnosing and repairing corrupt blobs in `EntityVersion.EntityVersionData`.
Every item here is a real failure mode observed in production sessions.

---

## Blob header format

Every blob in `EntityVersion.EntityVersionData` starts with an 11-byte proprietary header:

| Bytes | Length | Meaning |
|-------|--------|---------|
| 0–5   | 6      | Magic: `01 02 03 04 00 01` |
| 6     | 1      | Flag: `0x01` = GZip compressed · `0x02` = raw UTF-8 |
| 7–10  | 4      | **Declared decompressed size** — little-endian uint32 (GZip only; absent for raw) |
| 11+   | var    | GZip stream (flag `0x01`) or raw UTF-8 text (flag `0x02`) |

**For raw UTF-8 (flag `0x02`):** the data starts at byte 7 — there is no declared-size field.

### Verify declared vs actual size (flag=GZip)

```sql
SELECT
    CONVERT(int, CONVERT(varbinary(4),
        REVERSE(SUBSTRING(EntityVersionData, 8, 4)))) AS DeclaredSize,
    DATALENGTH(DECOMPRESS(
        SUBSTRING(EntityVersionData, 12, DATALENGTH(EntityVersionData) - 11))) AS ActualSize
FROM EntityVersion
WHERE EntityTypeId = <type> AND EntityId = <id> AND EntityVersionId = <vid>
```

If `DeclaredSize <> ActualSize` → the blob has a corrupted header (see "Memory stream" error below).

---

## Code-part blobs — token XML, never raw source

Code parts (Events, Rules, Conditions, ProcedureSource) store **tokenized XML**, not raw GeneXus
source text. The decompressed content must always start with `<TokenDataList`:

```xml
<TokenDataList>
  <TokenData><Token>146</Token><Word>Event</Word><Id>5</Id></TokenData>
  <TokenData><Token>25</Token><Word> </Word><Id>0</Id></TokenData>
  ...
</TokenDataList>
```

Token 25 is whitespace/newline. The IDE reconstructs source by concatenating `<Word>` values in
order. **Never write raw GeneXus source text into a code part** — it causes `src0009: Cannot
deserialize tokens` when the IDE or specifier reads the object.

| ComponentEntityTypeId | Part name |
|-----------------------|-----------|
| 64 | Events |
| 69 | Rules |
| 57 | Conditions |
| 67 | ProcedureSource |

---

## Corruption error 1 — "Memory stream is not expandable"

**Full message:** `NotSupportedException: Memory stream is not expandable (mscorlib)`

**Cause:** the declared decompressed size in bytes 7–10 (little-endian) does not match the actual
decompressed size of the GZip stream. The SDK pre-allocates a `MemoryStream` of the declared size
and the decompressor overflows it.

**Diagnose:**

```sql
SELECT
    ev.EntityTypeId, ev.EntityId, ev.EntityVersionName,
    CONVERT(int, CONVERT(varbinary(4),
        REVERSE(SUBSTRING(ev.EntityVersionData, 8, 4)))) AS DeclaredSize,
    DATALENGTH(DECOMPRESS(
        SUBSTRING(ev.EntityVersionData, 12, DATALENGTH(ev.EntityVersionData) - 11))) AS ActualSize
FROM EntityVersion ev
WHERE ev.EntityTypeId = <type> AND ev.EntityId = <id>
  AND CONVERT(int, SUBSTRING(ev.EntityVersionData, 7, 1)) = 1  -- GZip only
```

**Fix — rewrite the declared-size field:**

Calculate the correct little-endian hex for the actual size, then patch bytes 7–10:

```sql
-- Example: actual decompressed size = 23168 = 0x5A80 → LE bytes = 0x805A0000
UPDATE EntityVersion
SET EntityVersionData =
      SUBSTRING(EntityVersionData, 1, 7)          -- magic (6 bytes) + flag (1 byte)
    + 0x805A0000                                   -- correct size in little-endian (replace this)
    + SUBSTRING(EntityVersionData, 12, DATALENGTH(EntityVersionData) - 11)  -- GZip stream unchanged
WHERE EntityTypeId = <type> AND EntityId = <id> AND EntityVersionId = <vid>
```

To compute the correct LE hex dynamically (SQL Server):

```sql
UPDATE EntityVersion
SET EntityVersionData =
      SUBSTRING(EntityVersionData, 1, 7)
    + CONVERT(varbinary(4), REVERSE(CONVERT(varbinary(4),
          DATALENGTH(DECOMPRESS(
              SUBSTRING(EntityVersionData, 12, DATALENGTH(EntityVersionData) - 11))))))
    + SUBSTRING(EntityVersionData, 12, DATALENGTH(EntityVersionData) - 11)
WHERE EntityTypeId = <type> AND EntityId = <id> AND EntityVersionId = <vid>
  AND CONVERT(int, SUBSTRING(EntityVersionData, 7, 1)) = 1
```

---

## Corruption error 2 — "Cannot deserialize tokens" / src0009

**Full message:** `src0009: Cannot deserialize tokens (Artech.Common.Language)` or a variant
referencing the specifier or SDK model load.

**Cause:** a code part (Events, Rules, Conditions, ProcedureSource) contains raw UTF-8 GeneXus
source instead of the expected `<TokenDataList>` XML. This happens when a tool wrote source text
directly into the blob without going through the SDK tokenizer.

**Diagnose — check the first bytes of the decompressed content:**

```sql
-- Use varchar (NOT nvarchar) — UTF-8 bytes read as UTF-16 LE give false positives with nvarchar
SELECT CAST(
    DECOMPRESS(SUBSTRING(EntityVersionData, 12, DATALENGTH(EntityVersionData) - 11))
    AS varchar(50)) AS First50Bytes
FROM EntityVersion
WHERE EntityTypeId = <partTypeId> AND EntityId = <partId> AND EntityVersionId = <partVid>
```

If the result does NOT start with `<TokenDataList` → the blob contains raw source and must be
restored.

**Fix — restore blob from a healthy source:**

Option A — copy from another version of the same object (if an older good version exists):

```sql
UPDATE ev_bad
SET ev_bad.EntityVersionData = ev_good.EntityVersionData
FROM EntityVersion ev_bad
JOIN EntityVersion ev_good
  ON ev_good.EntityTypeId = ev_bad.EntityTypeId
 AND ev_good.EntityId     = ev_bad.EntityId
 AND ev_good.EntityVersionId = <last-known-good-vid>
WHERE ev_bad.EntityTypeId = <partTypeId>
  AND ev_bad.EntityId     = <partId>
  AND ev_bad.EntityVersionId = <corrupted-vid>
```

Option B — copy from a healthy object of the same type (same-DB or cross-database):

```sql
-- Cross-database example: restore from a backup KB
UPDATE target
SET target.EntityVersionData = source.EntityVersionData
FROM [YourKB_Active].dbo.EntityVersion target
CROSS JOIN [YourKB_Backup].dbo.EntityVersion source
WHERE target.EntityTypeId = <partTypeId>
  AND target.EntityId     = <partId>
  AND target.EntityVersionId = <vid>
  AND source.EntityTypeId = <partTypeId>
  AND source.EntityId     = <healthy-partId>
  AND source.EntityVersionId = <healthy-vid>
```

---

## Integrity scan for code parts

Run this to detect any code-part blob that does not start with `<TokenDataList`. Returns 0 rows
on a clean KB.

```sql
-- IMPORTANT: use varchar NOT nvarchar — UTF-8 content read as UTF-16 LE gives false positives
SELECT
    ev_obj.EntityVersionName AS ObjectName,
    evc.CompoundEntityTypeId AS ObjectTypeId,
    evc.CompoundEntityId     AS ObjectId,
    evc.ComponentEntityTypeId AS PartTypeId,
    ev_part.EntityId          AS PartEntityId,
    DATALENGTH(ev_part.EntityVersionData) AS BlobBytes,
    CONVERT(int, CONVERT(varbinary(4),
        REVERSE(SUBSTRING(ev_part.EntityVersionData, 8, 4)))) AS DeclaredSize,
    CAST(DECOMPRESS(
        SUBSTRING(ev_part.EntityVersionData, 12, DATALENGTH(ev_part.EntityVersionData) - 11))
        AS varchar(50)) AS First50Bytes
FROM EntityVersionComposition evc
JOIN EntityVersion ev_obj
  ON ev_obj.EntityTypeId  = evc.CompoundEntityTypeId
 AND ev_obj.EntityId      = evc.CompoundEntityId
 AND ev_obj.EntityVersionId = evc.CompoundEntityVersionId
JOIN EntityVersion ev_part
  ON ev_part.EntityTypeId  = evc.ComponentEntityTypeId
 AND ev_part.EntityId      = evc.ComponentEntityId
 AND ev_part.EntityVersionId = evc.ComponentEntityVersionId
WHERE evc.ComponentEntityTypeId IN (64, 69, 57, 67)   -- Events, Rules, Conditions, ProcedureSource
  AND DATALENGTH(ev_part.EntityVersionData) > 11
  AND CONVERT(int, SUBSTRING(ev_part.EntityVersionData, 7, 1)) = 1  -- GZip blobs only
  AND CONVERT(int, CONVERT(varbinary(4),
        REVERSE(SUBSTRING(ev_part.EntityVersionData, 8, 4)))) < 10485760  -- skip implausibly large
  AND ev_obj.EntityVersionId = (
        SELECT MAX(v.EntityVersionId)
        FROM EntityVersion v
        WHERE v.EntityTypeId = evc.CompoundEntityTypeId
          AND v.EntityId     = evc.CompoundEntityId)
  AND CAST(DECOMPRESS(
        SUBSTRING(ev_part.EntityVersionData, 12, DATALENGTH(ev_part.EntityVersionData) - 11))
        AS varchar(50)) NOT LIKE '<TokenDataList%'
ORDER BY ev_obj.EntityVersionName, evc.ComponentEntityTypeId
```

The `WHERE CompoundEntityTypeId` filter is intentionally omitted above so the scan covers any
compound type (WebPanel/WebComponent = 43, Procedure = 34, etc.). To narrow to a single object
type, add `AND evc.CompoundEntityTypeId = 43`.

---

## After any blob SQL write

The GX18 SDK worker holds the KB object model in memory after `Open()`. SQL writes to blob columns
are invisible to the SDK until the worker reloads from the database.

After any `gx_sql readOnly:false` that modifies blob data:

1. Call `gx_reload` — this restarts the worker and re-opens the KB from the current DB state.
2. If `gx_reload` is not available (e.g. worker crashed), kill the worker process manually:
   ```powershell
   Get-Process Gx18Mcp.SdkWorker -ErrorAction SilentlyContinue | Stop-Process -Force
   ```
   The MCP bridge restarts it automatically on the next tool call (cold-start ~30 s).

Skipping this step causes subsequent `gx_modify`, `gx_export`, or `gx_import` calls to operate
on the stale in-memory model and either silently ignore your fix or crash with a secondary error.
