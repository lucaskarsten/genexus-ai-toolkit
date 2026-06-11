---
name: genexus-kb-sql
description: GeneXus Knowledge Base SQL specialist — direct KB access, EntityType mapping, blob format (GZip), PowerShell scripts for reading/writing GX source code.
---

# GeneXus KB SQL — Direct KB Read/Write Specialist

## When to Use This Skill

Invoke when you want to: read source code of a GeneXus object directly from the database, modify a WebPanel/Wbc/Procedure/SDT source without opening the IDE, investigate version history, or build automations over the KB.

---

## Connection

Configure via `.env` or environment variables:

```
Instance : $env:GX_KB_SERVER    (e.g., (localdb)\MSSQLLocalDB)
Database : $env:GX_KB_DATABASE  (e.g., GX_KB_YourApp)
Auth     : Windows Authentication (no user/password)
```

```powershell
# sqlcmd
sqlcmd -S $env:GX_KB_SERVER -d $env:GX_KB_DATABASE -E

# PowerShell
Invoke-Sqlcmd -ServerInstance $env:GX_KB_SERVER -Database $env:GX_KB_DATABASE
```

> The `OBJECT` table contains **only the data model** (Transactions/Tables). All program objects are in the `Entity*` tables.

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
| 147 | UserControl | User Controls |

---

## Step-by-Step: Find Any Object

### 1. Search by name

```sql
-- WebPanel/Wbc by exact name
SELECT e.EntityId, ev.EntityVersionName, ev.EntityVersionTimestamp
FROM Entity e
JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId
WHERE e.EntityTypeId=43
  AND ev.EntityVersionName='WbcYourComponent'
ORDER BY ev.EntityVersionId DESC

-- Partial search (any object type)
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
WHERE evc.CompoundEntityTypeId=43 AND evc.CompoundEntityId=<entity-id>
  AND evc.CompoundEntityVersionId=(
      SELECT MAX(EntityVersionId) FROM EntityVersion
      WHERE EntityTypeId=43 AND EntityId=<entity-id>)
```

Typical WebPanel sub-components:
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

## Read and Decompress Source (PowerShell)

```powershell
function Read-GxSource {
    param(
        [int]$entityTypeId,
        [int]$entityId,
        [string]$Server   = $env:GX_KB_SERVER,
        [string]$Database = $env:GX_KB_DATABASE
    )
    $r = Invoke-Sqlcmd -ServerInstance $Server -Database $Database `
        -Query "SELECT MAX(EntityVersionId) as v FROM EntityVersion WHERE EntityTypeId=$entityTypeId AND EntityId=$entityId"
    $bytes = Invoke-Sqlcmd -ServerInstance $Server -Database $Database `
        -Query "SELECT EntityVersionData FROM EntityVersion WHERE EntityTypeId=$entityTypeId AND EntityId=$entityId AND EntityVersionId=$($r.v)" `
        -MaxBinaryLength 1000000 `   # CRITICAL — default truncates at 1024 bytes
        | Select-Object -ExpandProperty EntityVersionData
    if (-not $bytes -or $bytes.Length -le 11) { return $null }
    [byte[]]$gz = $bytes[11..($bytes.Length-1)]   # skip 11-byte GeneXus header
    $ms  = New-Object System.IO.MemoryStream($gz, 0, $gz.Length)
    $gzs = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
    $out = New-Object System.IO.MemoryStream
    $gzs.CopyTo($out)
    return [System.Text.Encoding]::UTF8.GetString($out.ToArray())
}

# Rebuild readable source text from XML token stream
function Get-GxSourceText($xml) {
    $doc = [xml]$xml
    ($doc.TokenDataList.TokenData | Where-Object { $_.Word } | ForEach-Object { $_.Word }) -join ""
}

# Usage
$xml  = Read-GxSource -entityTypeId 64 -entityId <events-entity-id>
$text = Get-GxSourceText $xml
$text | Out-Host
```

---

## Modify Source Directly (UPDATE — never INSERT)

**Golden rule**: The IDE manages version creation. Only UPDATE the existing blob. When the IDE saves, it creates the new version automatically.

```powershell
function Update-GxSource {
    param(
        [int]$entityTypeId,
        [int]$entityId,
        [string]$findXml,
        [string]$replaceXml,
        [string]$Server   = $env:GX_KB_SERVER,
        [string]$Database = $env:GX_KB_DATABASE
    )

    # 1. Read current version
    $r = Invoke-Sqlcmd -ServerInstance $Server -Database $Database `
        -Query "SELECT MAX(EntityVersionId) as v FROM EntityVersion WHERE EntityTypeId=$entityTypeId AND EntityId=$entityId"
    $ver = $r.v
    $bytes = Invoke-Sqlcmd -ServerInstance $Server -Database $Database `
        -Query "SELECT EntityVersionData FROM EntityVersion WHERE EntityTypeId=$entityTypeId AND EntityId=$entityId AND EntityVersionId=$ver" `
        -MaxBinaryLength 1000000 | Select-Object -ExpandProperty EntityVersionData

    [byte[]]$header  = $bytes[0..10]
    [byte[]]$gzBytes = $bytes[11..($bytes.Length-1)]

    # 2. Decompress
    $ms  = New-Object System.IO.MemoryStream($gzBytes, 0, $gzBytes.Length)
    $gzs = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
    $out = New-Object System.IO.MemoryStream
    $gzs.CopyTo($out)
    $xml = [System.Text.Encoding]::UTF8.GetString($out.ToArray())

    # 3. Verify occurrence count BEFORE modifying
    $count = ([regex]::Matches($xml, [regex]::Escape($findXml))).Count
    if ($count -ne 1) { throw "Marker found $count times (expected: 1). Aborting." }

    $xmlMod = $xml.Replace($findXml, $replaceXml)

    # 4. Update bytes 7-10 of header with new decompressed size (MANDATORY)
    [byte[]]$xmlModBytes = [System.Text.Encoding]::UTF8.GetBytes($xmlMod)
    [byte[]]$sz = [System.BitConverter]::GetBytes([uint32]$xmlModBytes.Length)
    $header[7]=$sz[0]; $header[8]=$sz[1]; $header[9]=$sz[2]; $header[10]=$sz[3]

    # 5. Recompress
    $outGz = New-Object System.IO.MemoryStream
    $gzW   = New-Object System.IO.Compression.GZipStream($outGz, [System.IO.Compression.CompressionMode]::Compress)
    $gzW.Write($xmlModBytes, 0, $xmlModBytes.Length)
    $gzW.Close()
    [byte[]]$comp = $outGz.ToArray()

    # 6. Assemble blob: header + GZip
    [byte[]]$blob = New-Object byte[] ($header.Length + $comp.Length)
    [System.Array]::Copy($header, 0, $blob, 0, $header.Length)
    [System.Array]::Copy($comp, 0, $blob, $header.Length, $comp.Length)

    # 7. UPDATE (not INSERT)
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=$Server;Database=$Database;Integrated Security=True")
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "UPDATE EntityVersion SET EntityVersionData=@blob WHERE EntityTypeId=$entityTypeId AND EntityId=$entityId AND EntityVersionId=$ver"
    $p = $cmd.Parameters.Add("@blob", [System.Data.SqlDbType]::VarBinary, -1)
    $p.Value = $blob
    $rows = $cmd.ExecuteNonQuery()
    $conn.Close()
    "Updated: $rows row(s) — EntityTypeId=$entityTypeId EntityId=$entityId v$ver"
}

# Example: insert comment after Event Start
Update-GxSource `
    -entityTypeId 64 -entityId <events-entity-id> `
    -findXml    '<TokenData><Token>3</Token><Word>Start</Word><Id>0</Id></TokenData>' `
    -replaceXml '<TokenData><Token>3</Token><Word>Start</Word><Id>0</Id></TokenData><TokenData><Token>25</Token><Word>&#xA;// my comment&#xA;</Word><Id>0</Id></TokenData>'
```

---

## Token Type Map

| Token | Meaning | Examples |
|---|---|---|
| 0 | Open parenthesis | `(` |
| 1 | Method/built-in function | `FromJson`, `Get`, `Udp`, `parm`, `Create` |
| 2 | Table attribute | attribute names |
| 3 | Identifier/string/keyword | `Start`, `in:`, `out:`, `'SubName'` |
| 4 | Close parenthesis | `)` |
| 5 | Plus operator | `+` |
| 7 | Comma | `,` |
| 9 | Logical operators | `Or`, `AND`, `OR` |
| 10 | Assignment/operators | `=`, `<>`, `+=` |
| 23 | Variable (`&...`) | `&MyVar`, `&pParam` |
| 25 | Whitespace/newline/comment | `\n`, `   `, `// text`, `/* block */` |
| 27 | Object call marker | *(no Word — precedes object reference)* |
| 28 | GX object reference | `PrcMyProc`, `WbpMyPanel` |
| 29 | UI variable/object | `&MySDT`, `UCMyControl` |
| 30 | Dot (member access) | `.` |
| 40 | Boolean True | `True`, `true` |
| 41 | Boolean False | `False`, `false` |
| 44 | Domain/enumerated constant | domain names |
| 53 | String literal `!'...'` | `!'MyValue'`, `!'GET'` |
| 109 | `If` | `If` |
| 110 | `Else` | `Else` |
| 111 | `EndIf` | `EndIf` |
| 121 | `For Each` | `For Each` |
| 128 | `EndFor` | `EndFor` |
| 130 | `When None` | `When None` |
| 132 | `Commit` | `Commit` |
| 143 | `Sub` | `Sub` |
| 144 | `EndSub` | `EndSub` |
| 145 | `Do` (call sub) | `Do` |
| 146 | `Event` | `Event` |
| 147 | `EndEvent` | `EndEvent` |
| 148 | `Refresh` | `Refresh` |
| 152 | `Do Case` | `Do Case` |
| 153 | `Case` | `Case` |
| 154 | `EndCase` | `EndCase` |

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
```

---

## Documented Pitfalls

| Error | Cause | Fix |
|---|---|---|
| `Memory stream is not expandable` | Bytes 7-10 not updated with new size | `[System.BitConverter]::GetBytes([uint32]$newLen)` |
| `Record already exists` on IDE save | Version manually pre-created | Never INSERT; only UPDATE existing blob |
| Modification hits all events | `.Replace()` hits all occurrences of generic token | Use a unique neighboring token as anchor |
| Blob truncated / GZip corrupted | `Invoke-Sqlcmd` without `-MaxBinaryLength` truncates at 1024 bytes | Always use `-MaxBinaryLength 1000000` |
| Decompress output empty | Blob < 12 bytes (sub-component with no data) | Check `$bytes.Length -gt 11` before decompressing |
