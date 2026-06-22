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
| KB user resolved | foreign | `321 = COMPUSOFT\lucas.karsten` (real dev) |
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

### Read (SQL, zero revisions)
| Tool | Purpose |
|---|---|
| `gx_find` | Search objects by name pattern |
| `gx_list` | List objects of a type/module |
| `gx_get` | Object header + components |
| `gx_read` | Reconstructed source (blob GZip → token XML → text) |
| `gx_properties` | Property bag |
| `gx_structure` | Transaction attributes |
| `gx_whoami` | Windows user → KB UserId |
| `gx_sql` | Direct SQL on the KB (read-only by default) |

### Database
| Tool | Purpose |
|---|---|
| `gx_db_connections` | List connections (`kb` always; `oracle` if `ORACLE_*` set) |
| `gx_db_query` | SQL on a named connection. `kb` = SQL Server (Win auth); `oracle` = ODP.NET Managed (supports NNE) |

### Write (SDK, UserId-verified)
| Tool | Purpose |
|---|---|
| `gx_create` | Create an object (see type matrix below). Requires `confirm:true` |
| `gx_modify` | Replace a source section of an object. Requires `confirm:true` |
| `gx_export` | Export an object to a real `.xpz` (Knowledge Manager) — also validates it |
| `gx_import` | Import a `.xpz` via the native Knowledge Manager (`ImportFile`). Requires `confirm:true`. UserId-verified. The export→edit→import round-trip reaches sections the SDK write path can't (e.g. UC `AfterShow`/`Methods` scripts in CDATA) |
| `gx_set_property` / `gx_rename` / `gx_validate` / `gx_build` | Not yet implemented (stubs) |

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
- `gx_set_property`, `gx_rename`, `gx_validate`, `gx_build`: stubs.
- Nested SDT levels / transaction sub-levels: only the root level is built so far.
