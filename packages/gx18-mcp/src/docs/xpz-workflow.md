# XPZ Round-Trip Workflow

The `.xpz` format is a ZIP archive containing one XML file. It is the only way to access and edit
**UserControl AfterShow and Methods scripts**, which are stored as CDATA blocks inside the archive
and are not reachable via `gx_read` or `gx_modify`.

This guide covers the full round-trip using the four dedicated tools: `gx_export`, `gx_read_xpz`,
`gx_patch_xpz`, and `gx_import`.

---

## When to use this workflow

| Situation | Use XPZ round-trip? |
|-----------|-------------------|
| Edit UC AfterShow script | ✅ Yes — only path |
| Edit UC Method (e.g. Tooltip, Show, Hide) | ✅ Yes — only path |
| Edit UC template (HTML/CSS) | ❌ Use `gx_modify type=147 section=template` |
| Edit Procedure source | ❌ Use `gx_modify type=34 section=source` |
| Read UC script without editing | ✅ Yes — `gx_export` + `gx_read_xpz` |
| Import new object from file | ✅ Use `gx_import` directly |

---

## Step 1: Export to .xpz

```
gx_whoami
  → { windowsUser: "DOMAIN\\user", kbUserId: 321, sdkReady: true }

gx_export name=UCMyControl type=147
  → { ok: true, outputFile: "C:\\output\\UCMyControl.xpz" }
```

The `.xpz` is written to `GX_OUTPUT_PATH` (or `outputDir` if specified).
A successful export also validates the object is well-formed in the KB.

---

## Step 2: List scripts in the archive

```
gx_read_xpz xpzFile=C:\\output\\UCMyControl.xpz
  → {
      ok: true,
      scripts: [
        { name: "AfterShow", byteLength: 2847 },
        { name: "Tooltip",   byteLength: 512  },
        { name: "Show",      byteLength: 98   },
        { name: "Hide",      byteLength: 102  }
      ],
      scriptCount: 4
    }
```

Script names are case-sensitive. `AfterShow` is the initialization script that runs after the UC
renders. Other names are Methods declared in the UC's Methods tab in the IDE.

---

## Step 3: Read the target script

```
gx_read_xpz xpzFile=C:\\output\\UCMyControl.xpz scriptName=AfterShow
  → {
      ok: true,
      scriptName: "AfterShow",
      content: "jQuery(document).ready(function() {\n  // ... existing script ...\n});"
    }
```

Inspect the content before making edits — know what you're replacing.

---

## Step 4: Patch the script

```
gx_patch_xpz
  xpzFile=C:\\output\\UCMyControl.xpz
  scriptName=AfterShow
  content="jQuery(document).ready(function() {\n  // ... updated script ...\n});"
  outputFile=C:\\output\\UCMyControl_patched.xpz

  → {
      ok: true,
      outputFile: "C:\\output\\UCMyControl_patched.xpz",
      scriptName: "AfterShow",
      originalLength: 2847,
      newLength: 3102,
      patched: true
    }
```

**What `gx_patch_xpz` does automatically:**
- Writes to a NEW file (original `.xpz` is never modified)
- Bumps `<Object lastUpdate="...">` to current UTC timestamp
- Zeroes the `checksum` attribute (GeneXus does not cryptographically validate it on import)
- Writes with correct BOM UTF-8 encoding and CRLF line endings

**What it does NOT do:** write to the KB. The patched file is local until you import it.

### Pitfall: CDATA closing marker

The new content **must not contain `]]>`** — this is the XML CDATA closing marker and would
corrupt the archive XML. If your script needs to embed `]]>`, split it: `]]` + `>`.

---

## Step 5: Import the patched archive

```
gx_import
  xpzFile=C:\\output\\UCMyControl_patched.xpz
  type=usercontrol
  name=UCMyControl
  fullOverwrite=true
  confirm=true

  → {
      ok: true,
      userIdOk: true,
      userId: 321,
      expectedUserId: 321,
      deltaRows: 6
    }
```

`fullOverwrite=true` is required to overwrite the existing object.
`deltaRows` is the number of KB rows written (object + its parts); a normal UC edit creates 5-6 rows.

### Verify the import

```
gx_export name=UCMyControl type=147   → generates a fresh .xpz
gx_read_xpz xpzFile=C:\\output\\UCMyControl.xpz scriptName=AfterShow
  → content should reflect your edit
```

---

## Complete example: fix a jQuery reflow pattern

```bash
# 1. Run the linter to identify the problem
gx_lint type=147

# 2. Verify identity
gx_whoami

# 3. Export the UC
gx_export name=UCTooltip type=147

# 4. Read the AfterShow script
gx_read_xpz xpzFile=C:\\output\\UCTooltip.xpz scriptName=AfterShow

# 5. Patch: replace jQuery :hidden/:visible with querySelectorAll
gx_patch_xpz \
  xpzFile=C:\\output\\UCTooltip.xpz \
  scriptName=AfterShow \
  content="<fixed JS without :hidden/:visible>" \
  outputFile=C:\\output\\UCTooltip_perf.xpz

# 6. Import
gx_import \
  xpzFile=C:\\output\\UCTooltip_perf.xpz \
  type=usercontrol name=UCTooltip fullOverwrite=true confirm=true

# 7. Verify
gx_export name=UCTooltip type=147
gx_read_xpz xpzFile=C:\\output\\UCTooltip.xpz scriptName=AfterShow
```

---

## Pitfalls & edge cases

| Situation | What happens | Solution |
|-----------|-------------|---------|
| Content contains `]]>` | `gx_patch_xpz` rejects with validation error | Split as `]]` + `>` in the script |
| Wrong script name | `gx_read_xpz` / `gx_patch_xpz` return error with available names | List scripts first (step 2) |
| `fullOverwrite=false` on existing object | Import silently skips the object, no error | Always use `fullOverwrite=true` for edits |
| UserId wrong after import | `gx_import` fails loudly with `userIdOk:false` | Call `gx_whoami` first; ensure worker runs as correct Windows user |
| Build needed after import | `.xpz` import updates KB source but does not recompile | Build in GX18 IDE (F5 / Build All) after import |
| `gx_export` returns error | Object is invalid or KB connection lost | Run `gx_doctor` then `gx_validate name=X type=147` |
