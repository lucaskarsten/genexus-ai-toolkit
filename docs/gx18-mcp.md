# gx18-mcp — MCP server for GeneXus 18 (read + safe write)

A Model Context Protocol server that reads and writes a **GeneXus 18** Knowledge Base
without the Team Development corruption caused by GeneXus Next's MCP (`gxnext`).

- **Reads** go through direct SQL — zero `EntityVersion` rows created.
- **Writes** go through the native GX18 SDK, hosted in a C# worker that runs as the
  **Windows user**, so the author (`UserId`) is the real developer — not a foreign
  service identity (the gxnext bug: `UserId 322`).
- Every write is verified post-save: the new `EntityVersion` rows must carry the
  expected `UserId`, or the tool fails loudly.

> **Quer só usar?** Veja o guia em português: [`gx18-mcp-uso.md`](gx18-mcp-uso.md) — variáveis,
> como subir, comandos do CLI e tools que funcionam. Este arquivo cobre arquitetura e internals.

> **Developer/architecture documentation.** For LLM/agent tool-usage guidance at runtime, read the embedded `gx18://docs/*` resources — they are canonical and version-synced with the server.

---

## Architecture

```
Claude / Cursor ──stdio──> gx18-mcp (TypeScript, Node)
                               │
                               ├─ SQL read layer (mssql-style, direct) ── reads, zero revisions
                               │
                               └─ SDK bridge ──JSON-RPC(stdin/stdout)──> Gx18Mcp.SdkWorker.exe
                                                                          (.NET Framework 4.8, x86, STA)
                                                                          ├─ Artech.* SDK (writes)
                                                                          ├─ System.Data.SqlClient (KB reads)
                                                                          └─ Oracle.ManagedDataAccess (Oracle, NNE)
```

The worker is a persistent subprocess. It only opens the SDK on the **first write**
(lazy) — reads never touch the SDK, so the "revision storm on open" is structurally
impossible.

### Why the UserId is correct

| | gxnext (GX Next 2026) | gx18-mcp |
|---|---|---|
| Process identity | service account → KB `UserId 322` | child of the dev's shell → Windows user |
| KB user resolved | foreign | `DOMAIN\developer` (real dev — your Windows user) |
| Revisions on open | tens of thousands (storm) | **0** (`AvoidStartupUpdate=true`) |
| Post-save check | none | asserts `UserId` on every save |

KB users are entities of `EntityTypeId 7`; `EntityVersionName` = the Windows identity.
Resolve with: `SELECT EntityId FROM EntityVersion WHERE EntityTypeId=7 AND EntityVersionName=@winuser`.

---

## Headless SDK bootstrap (the hard-won part)

Opening a GX18 KB from a process **outside** the install dir requires, in order:

1. **Native DLL path** — add to PATH / `SetDllDirectory`:
   - the GX18 install dir, and
   - the shared protection folder `…\Common Files\Artech\GXprot1` (holds `Protect.dll`,
     which is **not** in the install dir). Missing it → `DllNotFoundException` / `0x8007007E`.
2. **Start the BL** — `Artech.Core.Connector.CustomStartBL(gx18Dir, gx18Dir\Packages, true)`
   (assembly `Connector.dll`). Without it, `KnowledgeBase.Open` throws `NullReferenceException`.
3. **Open** — `KnowledgeBase.Open(new OpenOptions(path) { EnableMultiUser=true,
   AvoidStartupUpdate=true, AvoidIndexing=true })`. `AvoidStartupUpdate=true` is what
   prevents the revision storm.
4. Redirect `Console.Out → stderr` around bootstrap + open (the SDK logs to stdout and
   would corrupt the JSON-RPC framing).

---

## Tool reference

The canonical, always-current tool reference is served as embedded resources by the running server:

- `gx18://docs/usage-guide` — full tool reference, anti-patterns, and workflow examples
- `gx18://docs/quick-reference` — task→tool decision table, mandatory sequences, EntityTypeIds
- `gx18://docs/entity-types` — write-support matrix for all object types

Read those resources at runtime; they are version-synced with the server and supersede any static list here.

---

## Write support matrix (validated on a disposable KB clone)

| Type | Create | Export `.xpz` | Sections accepted |
|---|---|---|---|
| `procedure` | ✅ | ✅ | `source`, `rules`, `conditions` |
| `webpanel` | ✅ | ✅ | `events`, `rules`, `conditions`, `layout` |
| `webcomponent` | ✅ | ✅ | same as webpanel (+ component flag) |
| `api` | ✅ | ✅ | `source` (service group), `events` |
| `usercontrol` | ✅ | ✅ | `template`, `properties` |
| `dataselector` | ✅ | ✅ | — |
| `dso` | ✅ | ✅ | `tokens`, `styles`, `elements` — header must match the name, e.g. `styles <Name> { … }` |
| `sdt` | ✅ | ⚠️ | `structure` (array of members). Export of a *freshly created* SDT in the same worker session returns false; existing SDTs export fine. |
| `transaction` | ⚠️ | — | `structure` (array of attributes), `rules`, `events`. **Known limitation:** on save the SDK auto-generates a legacy WinForm whose validator throws `duplicate key`; no `SavePreferences` flag bypasses it. Needs further work. |

### `structure` item shape (sdt / transaction)
```json
{ "name": "Price", "type": "Numeric", "length": 10, "decimals": 2, "key": false }
```
`type` ∈ Character, VarChar, LongVarChar, Numeric, Int, Date, DateTime, Boolean, GUID.

### Example — create a procedure
```json
{ "type": "procedure", "name": "PrcFoccoHello", "confirm": true,
  "source": "msg(\"hello from gx18-mcp\")" }
```
Result includes `userIdOk: true`, `userId`, `expectedUserId` — the post-save guard.

---

## `.xpz` export = validation

`gx_export` calls `Services.GetService<IKnowledgeManagerService>().Export(model,
IEnumerable<EntityKey>, file, ExportOptions)`. A successful export proves the object is
well-formed in the KB. The `.xpz` is a ZIP containing the object XML
(`<ExportFile>… username="DOMAIN\user" …`), importable into any GX18 KB via
**Knowledge Manager → Import**.

---

## Object type support matrix

| Type | EntityTypeId | Create | Modify | Export | Import | Delete | Rename | set_property | Notes |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| `procedure` | 34 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Sections: `source`, `rules`, `conditions` |
| `webpanel` | 43 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Sections: `events`, `rules`, `conditions`, `layout` |
| `webcomponent` | 43 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Same as webpanel + `IsWebComponent` flag |
| `api` | 86 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Sections: `source` (ServiceGroupSource), `events` |
| `usercontrol` | 147 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Sections: `template`, `properties`. AfterShow/Methods → XPZ round-trip |
| `dso` | 161 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Sections: `tokens`, `styles`, `elements`. `@import` must use friendly name, not GUID |
| `sdt` | 36 | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | Section: `structure` (JSON array). Export of same-session fresh SDT may return false |
| `dataselector` | 88 | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | Name-only create. Logic (`defined by`, `where`) → IDE or XPZ |
| `transaction` | 39 | ⚠️ | ✅ | — | ✅ | ✅ | ✅ | ✅ | `structure` JSON + `rules`/`events`. WinForm auto-gen may throw `ValidationException` |

**Legend:** ✅ validated · ⚠️ experimental/known limitation · — not supported

---

## Integration tests

Tests that run the **real C# worker** against a KB clone (`ExampleKB_SPIKE`):

```
cd packages/gx18-mcp
npm run test               # unit tests only (CI-safe, no KB needed)
npm run test:integration   # integration tests (requires SPIKE KB)
npm run test:all           # both suites
```

Test files live in `test/integration/`:
- `crud/<type>.test.ts` — full CRUD cycle (create → find → read → modify → export → delete) for each of the 9 types
- `tools/variable.test.ts` — `gx_variable` list/add/delete round-trip
- `tools/rename.test.ts` — rename → find new name → not find old name
- `tools/set-property.test.ts` — `gx_set_property` persists and stamps correct UserId
- `tools/move.test.ts` — `gx_move` between modules
- `tools/analyze.test.ts` — `gx_analyze` dependency graph
- `tools/history.test.ts` — `gx_history` grows after modify
- `tools/export-import.test.ts` — export → import round-trip

All integration suites are guarded by `describe.skipIf(!SPIKE_AVAILABLE)` — they skip automatically if `GX_KB_DATABASE` does not contain `SPIKE`, making them safe to run in CI without the KB.

Configure the spike KB in `test/integration/.env.spike`:
```
GX_KB_SERVER=(localdb)\MSSQLLocalDB
GX_KB_DATABASE=GX_KB_ExampleKB_SPIKE
GX_KB_PATH=C:\KBs\ExampleKB_SPIKE
GX18_DIR=C:\Program Files (x86)\GeneXus\GeneXus18U6
```

---

## Testing safely — the KB clone

Never test writes against the live KB. Build a disposable clone:

```sql
BACKUP DATABASE GX_KB_<kb> TO DISK='…\clone.bak' WITH COPY_ONLY, INIT, FORMAT;
RESTORE DATABASE GX_KB_<kb>_SPIKE FROM DISK='…\clone.bak'
  WITH MOVE 'GX_KB_<kb>' TO 'C:\KBs\<kb>_SPIKE\GX_KB_<kb>_SPIKE.mdf',
       MOVE 'GX_KB_<kb>_log' TO 'C:\KBs\<kb>_SPIKE\GX_KB_<kb>_SPIKE_log.ldf', RECOVERY;
```
Copy the KB folder (excluding the live `.mdf/.ldf`), then rewrite
`knowledgebase.connection` in the clone to point `DBName`/`DataFile`/`LogFile`/`Directory`
at the restored catalog. Point the worker at the clone via `GX_KB_PATH` / `GX_KB_DATABASE`.

---

## Build & run

```
cd packages/gx18-mcp
npm install
npm run build           # esbuild → dist/
npm run build:worker    # dotnet build → dist/worker/Gx18Mcp.SdkWorker.exe (+ Oracle DLL)
node dist/bin/gx18-mcp.js doctor   # health check
```

Config: reads `.env` (`GX_KB_PATH`, `GX_KB_SERVER`, `GX_KB_DATABASE`, `GX18_INSTALL_DIR`,
`ORACLE_*`) and `%LOCALAPPDATA%\gx18-mcp\config.json`. **`GX_KB_SERVER` must keep the
parentheses: `(localdb)\MSSQLLocalDB`** — without them the SQL client treats it as a
named instance and times out (30 s).

### Worker dev-only methods (not exposed as MCP tools)
- `probe_sdk` — reflection over the SDK assemblies (type/method/enum dump)
- `open_spike` — measures the `EntityVersion` delta around an SDK open (proves zero revisions)

---

## Known limitations / TODO

- **transaction**: WinForm auto-generation validator collision on save — pending.
- **sdt**: export of a same-session freshly-created SDT returns false (object is valid and
  persisted; export works from a fresh session).
- `gx_validate`: existence-check only (headless SDK incompatible with diagnostics compiler).
- `gx_build`: stub — always errors. Use IDE (F5 / Build All) after writing via MCP.
- Nested SDT levels / transaction sub-levels: only the root level is built so far.
