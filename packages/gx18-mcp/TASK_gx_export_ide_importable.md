# Task — make `gx_export` (SQL-fallback) produce IDE-importable XPZ

**Status:** open · **Found:** 2026-06-26 (UCMenu/WbcNucMenu_V2 menu rebuild session)
**Owner file:** `worker/Gx18Mcp.SdkWorker/Sql/KbSqlClient.cs` → `SqlExportXpzImpl` (≈ line 1475)

## Problem

The XPZ produced by `gx_export` for `type=43` (WebPanel/WebComponent) and `type=147` (UserControl)
passes `gx_read_xpz` but the **GeneXus 18 IDE rejects it** in Knowledge Manager → Import.
Three distinct defects, all in `SqlExportXpzImpl`:

### Defect 1 — missing `<MajorVersion>` → "Invalid format, MajorVersion not found."
`KbSqlClient.cs:1664` emits:
```csharp
$"  <KMW kbname=\"{EscapeAttr(kbName)}\" />\r\n"
```
A real IDE export uses (from `C:\KBs\FoccoLojas_02\megaxpzmenuheader.xpz`):
```xml
<KMW>
  <MajorVersion>4</MajorVersion>
  <MinorVersion>0</MinorVersion>
  <Build>177934</Build>
</KMW>
```
**Fix:** emit the versioned `<KMW>`. Hardcode `4`/`0`/`177934` (GX18 U7 build), or read from the KB
`Properties` table if a version row exists. Also align `<Source>` to the IDE shape:
`<Source kb="<guid>" username="<win user>" UNCPath="..."><Version guid="..." name="<kbname>" /></Source>`
(the bare `kb="<dbname>" UNCPath=""` form may also need the nested `<Version>`).

### Defect 2 — nested CDATA in UC Properties `<Script>` → "Invalid User Control Definition"
`KbSqlClient.cs:1617-1624` wraps each `<Script>` body in `<![CDATA[…]]>`:
```csharp
content = Regex.Replace(content, @"(<Script\b[^>]*>)([\s\S]*?)(</Script>)", m => {
    var body = m.Groups[2].Value;
    if (body.TrimStart().StartsWith("<![CDATA[")) return m.Value;
    return m.Groups[1].Value + "<![CDATA[" + body + "]]>" + m.Groups[3].Value;
});
```
But the **whole Definition part is already inside `<Source><![CDATA[…]]></Source>`** in the IDE
format. Adding inner CDATA → **nested CDATA**; the inner `]]>` closes the outer CDATA prematurely →
truncated `<Definition>` → IDE specifier throws `Invalid User Control Definition for: <UC>` and
cascades `src0216: '<prop>' invalid property` in every WBC/WBP that uses the UC.

Note: the current code embeds the `<Definition>` **without** an outer `<Source><![CDATA[…]]>`
(lines 1626-1629 append `content` raw inside `<Part>`). The IDE format actually wants the Definition
inside `<Source><![CDATA[…]]></Source>` with the inner `<Script>` body **raw (no CDATA)** — raw
`<`/`>`/`&` are tolerated by the Definition parser (proven by `UcNucIAInsight`, EntityId 57). The
JS body must only avoid the literal `]]>`.

**Fix:** for part 149, emit `<Source><![CDATA[` + decompressed Definition (scripts left RAW, no
per-script CDATA) + `]]></Source>`. Run the `EscapeCdata`/`]]>`-splitter on the whole Definition so a
stray `]]>` in JS can't break the outer CDATA. Then update `gx_read_xpz`/`gx_patch_xpz` (XpzHelper.cs)
to parse raw `<Script>` bodies instead of requiring CDATA.

### Defect 3 — Help part raw `<?xml?>` prolog → "Unexpected XML declaration … must be first node"
`KbSqlClient.cs:1631-1641` (structure parts, incl. Help type 65) embeds the decompressed blob
directly. The Help blob decompresses to a full document `<?xml version="1.0" encoding="utf-8"?><Help>…`.
A mid-document prolog is invalid XML → IDE import fails.
**Fix:** strip a leading `<?xml … ?>` from any structure-part content before embedding:
```csharp
content = Regex.Replace(content, @"^\s*<\?xml[^>]*\?>", "");
```
(Apply to Help/Documentation/Variables — anything in the `else` branch at 1631.)

## Reference: known-good IDE format
`C:\KBs\FoccoLojas_02\megaxpzmenuheader.xpz` (139 objects, IDE-exported, imports cleanly).
- Block order: `<KMW><Source><Dependencies/><Objects>…</Objects><ObjectsIdentityMapping>…</ObjectsIdentityMapping></ExportFile>`
  — **`<Objects>` BEFORE `<ObjectsIdentityMapping>`** (current code has them reversed; the IDE may
  tolerate either, but match the IDE to be safe).
- UC Properties part: `<Part type="8e9e4a7c-…"><Source><![CDATA[<Definition auto="false">…</Definition>]]></Source></Part>`
- Help part: `<Part type="ad3ca970-…"><Help><HelpItem><Language>…</Language><Content /></HelpItem></Help></Part>` (no prolog).

## Acceptance test
For UCMenu (147) and WbcNucMenu_V2 (43):
1. `gx_export` → load the inner XML with `XmlDocument.LoadXml` (strict) → must NOT throw.
2. Import the produced XPZ in the GX18 IDE → no "MajorVersion", no "Unexpected XML declaration",
   no "Invalid User Control Definition".
3. `gx_read_xpz` still lists scripts by name (regression check after the CDATA change).

## Workaround used this session (until fixed)
Rebuilt the XPZ from the IDE-exported `megaxpzmenuheader.xpz` header + object blocks, swapping the
corrected UCMenu Properties part. Output: `output/WBC/WbcNucMenu_V2_e_UCMenu_ide.xpz`.
The live KB `FoccoLojas_03` was fixed directly via SQL (UCMenu part 149 blob + dashboard NULL parts),
so the build does not require importing this XPZ.
