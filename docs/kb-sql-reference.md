# GeneXus Knowledge Base — SQL Reference

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

# Rebuild readable source from XML token stream
function Get-GxSourceText($xml) {
    $doc = [xml]$xml
    ($doc.TokenDataList.TokenData | Where-Object { $_.Word } | ForEach-Object { $_.Word }) -join ""
}

# Usage example
$xml  = Read-GxSource -entityTypeId 64 -entityId <events-entity-id>
$text = Get-GxSourceText $xml
$text | Out-Host
```

---

## Modifying Source Directly (UPDATE — never INSERT)

**Golden rule**: The IDE manages version creation. Only do UPDATE on the existing blob. When the IDE saves, it creates the new version automatically. Never INSERT new versions manually.

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
```

---

## Token Type Map (GeneXus Event Source Format)

| Token | Meaning | Examples |
|---|---|---|
| 0 | Open parenthesis | `(` |
| 1 | Method/built-in function | `FromJson`, `Get`, `Udp`, `parm`, `Create`, `Call`, `Trim` |
| 2 | Table attribute | attribute names |
| 3 | Identifier/string/keyword | `Start`, `in:`, `out:`, `'SubName'` |
| 4 | Close parenthesis | `)` |
| 5 | Plus operator | `+` |
| 7 | Comma | `,` |
| 8 | `not` | `not`, `Not` |
| 9 | Logical operators | `Or`, `AND`, `OR` |
| 10 | Assignment/comparison | `=`, `<>`, `+=` |
| 18 | Semicolon | `;` |
| 23 | Variable (`&...`) | `&MyVariable`, `&pParam` |
| 25 | Whitespace/newline/comment | `\n`, `   `, `// text` |
| 27 | Object call marker | *(no Word — precedes object reference; Id=type)* |
| 28 | GX object reference | `PrcMyProcedure`, `WbpMyPanel` |
| 29 | UI variable/object | `&MySDT`, `UCMyControl`, `ButtonSave` |
| 30 | Dot (member access) | `.` |
| 40 | Boolean True | `True`, `true` |
| 41 | Boolean False | `False`, `false` |
| 44 | Domain/enumerated constant | domain names |
| 46 | `new` / `New` | `new`, `New` |
| 53 | String literal `!'...'` | `!'MenuHeader'`, `!'GET'` |
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
