# GeneXus Knowledge Base — SQL Reference

> **For LLM/agent use**, the canonical token map and PowerShell scripts live in [`skills/genexus-kb-sql.md`](../skills/genexus-kb-sql.md). This document is a human-readable reference — narrative explanations, EntityType context, and examples for reading at a glance. Keep both in sync when making changes.

Direct access to the GeneXus Knowledge Base via SQL. Covers EntityType mapping, GZip blob format, and PowerShell scripts for reading and writing GX source code without opening the IDE.

---

## Connection

Configure these via your `.env` file:

```
Instance : $GX_KB_SERVER   (default: (localdb)\MSSQLLocalDB)
Database : $GX_KB_DATABASE (e.g., GX_KB_YourApp)
Auth     : Windows Authentication (no user/password)
```

```powershell
# sqlcmd
sqlcmd -S "(localdb)\MSSQLLocalDB" -d GX_KB_YourApp -E

# PowerShell
Invoke-Sqlcmd -ServerInstance "(localdb)\MSSQLLocalDB" -Database "GX_KB_YourApp"
```

> **Note**: The `OBJECT` table contains only the data model (Transactions/Tables). All program objects live in the `Entity*` tables.

---

## EntityType Map

| EntityTypeId | Name | Description |
|---|---|---|
| 34 | Procedure | Procedures |
| 35 | Report | Reports |
| 36 | SDT | Structured Data Types |
| 38 | Theme | Themes |
| 39 | Transaction | Transactions |
| 43 | WebPanel | Web Panels and Web Components (Wbc*) |
| 44 | WorkPanel | Work Panels |
| 57 | Conditions | Sub-component: conditions |
| 62 | Documentation | Sub-component: documentation |
| **64** | **Events** | **Sub-component: event source (WebPanel/Wbc)** |
| 65 | Help | Sub-component: help |
| **69** | **Rules** | **Sub-component: rules (WebPanel) OR source (Procedure)** |
| 72 | Variables | Sub-component: variables |
| 74 | WebForm | Sub-component: layout/form |
| 82 | Layout | Layout of Procedure/Report |
| 100 | Module | Modules |
| **147** | **UserControl** | **User Controls** |
| **161** | **DSO** | **Design System Objects** |

---

## Finding Any Object

### 1. Search by name

```sql
-- WebPanel/Wbc by exact name
SELECT e.EntityId, ev.EntityVersionName, ev.EntityVersionTimestamp
FROM Entity e
JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId
WHERE e.EntityTypeId=43
  AND ev.EntityVersionName='WbcYourComponent'
ORDER BY ev.EntityVersionId DESC

-- Partial search across all object types
SELECT e.EntityTypeId, et.EntityTypeName, e.EntityId, ev.EntityVersionName
FROM Entity e
JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId
JOIN EntityType et ON et.EntityTypeId=e.EntityTypeId
WHERE ev.EntityVersionName LIKE '%YourComponent%'
  AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2
      WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId)
ORDER BY ev.EntityVersionName
```

### 2. View sub-components (composition)

```sql
SELECT evc.ComponentEntityTypeId, et.EntityTypeName,
       evc.ComponentEntityId, evc.ComponentEntityVersionId
FROM EntityVersionComposition evc
JOIN EntityType et ON et.EntityTypeId=evc.ComponentEntityTypeId
WHERE evc.CompoundEntityTypeId=43 AND evc.CompoundEntityId=<your-entity-id>
  AND evc.CompoundEntityVersionId=(
      SELECT MAX(EntityVersionId) FROM EntityVersion
      WHERE EntityTypeId=43 AND EntityId=<your-entity-id>)
```

Typical sub-components for a WebPanel:
```
Conditions  (57) EntityId=...
Documentation(62) EntityId=...
Events      (64) EntityId=...   ← source of events
Help        (65) EntityId=...
Rules       (69) EntityId=...
Variables   (72) EntityId=...
WebForm     (74) EntityId=...   ← layout
```

### 3. Get current version of a sub-component

```sql
SELECT MAX(EntityVersionId) FROM EntityVersion
WHERE EntityTypeId=64 AND EntityId=<events-entity-id>
```

---

## Reading and Decompressing Source (PowerShell)

GeneXus stores source in `EntityVersionData` as a custom blob: 11-byte header + GZip-compressed XML.

See [`skills/genexus-kb-sql.md`](../skills/genexus-kb-sql.md) for the PowerShell functions `Read-GxSource`, `Get-GxSourceText`, and `Update-GxSource`.

---

## Modifying Source Directly (UPDATE — never INSERT)

**Golden rule**: The IDE manages version creation. Only do UPDATE on the existing blob. When the IDE saves, it creates the new version automatically. Never INSERT new versions manually.

See [`skills/genexus-kb-sql.md`](../skills/genexus-kb-sql.md) for the PowerShell functions `Read-GxSource`, `Get-GxSourceText`, and `Update-GxSource`.

---

## Token Type Map (GeneXus Event Source Format)

See [`skills/genexus-kb-sql.md` — Token Type Map](../skills/genexus-kb-sql.md) for the canonical token reference.

---

## Building Tokens for Insertion

```xml
<!-- Comment -->
<TokenData><Token>25</Token><Word>&#xA;// my comment&#xA;</Word><Id>0</Id></TokenData>

<!-- Assignment: &MyVar = 'value' -->
<TokenData><Token>23</Token><Word>&amp;MyVar</Word><Id>0</Id></TokenData>
<TokenData><Token>25</Token><Word> </Word><Id>0</Id></TokenData>
<TokenData><Token>10</Token><Word>=</Word><Id>0</Id></TokenData>
<TokenData><Token>25</Token><Word> </Word><Id>0</Id></TokenData>
<TokenData><Token>3</Token><Word>'value'</Word><Id>0</Id></TokenData>

<!-- msg('text') -->
<TokenData><Token>141</Token><Word>msg</Word><Id>0</Id></TokenData>
<TokenData><Token>0</Token><Word>(</Word><Id>0</Id></TokenData>
<TokenData><Token>3</Token><Word>'text'</Word><Id>0</Id></TokenData>
<TokenData><Token>4</Token><Word>)</Word><Id>0</Id></TokenData>
```

---

## Documented Pitfalls

| Error | Cause | Fix |
|---|---|---|
| `Memory stream is not expandable` | Header bytes 7-10 don't reflect new decompressed size | Update bytes 7-10 with `[System.BitConverter]::GetBytes([uint32]$newLen)` |
| `Record already exists` on IDE save | Version was manually pre-created | Never INSERT versions; only UPDATE existing blob |
| Modification hits all events | `.Replace()` replaces all occurrences of a generic token | Use the neighboring token as unique anchor (e.g., `<Word>Start</Word>` only exists once) |
| Blob truncated / GZip corrupted silently | `Invoke-Sqlcmd` without `-MaxBinaryLength` truncates at 1024 bytes | Always use `-MaxBinaryLength 1000000` |
| Decompress produces empty output | Blob smaller than 12 bytes (sub-component with no data) | Check `$bytes.Length -gt 11` before decompressing |
