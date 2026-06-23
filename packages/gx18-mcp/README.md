# gx18-mcp

> MCP server for **GeneXus 18** — reads and writes a Knowledge Base **without** the Team
> Development corruption caused by GeneXus Next's MCP (`gxnext`).

- **Reads** go through direct SQL — **zero** `EntityVersion` rows created.
- **Writes** go through the native GX18 SDK, hosted in a C# worker that runs as the **Windows
  user**, so the author (`UserId`) is the real developer — not a foreign service identity.
- Every write is verified post-save: the new revision must carry the expected `UserId`, or the
  tool fails loudly instead of polluting the KB.

Windows-only (the worker is `net48` / `x86` and loads the GeneXus 18 SDK).

---

## Quickstart

```bash
npx gx18-mcp setup     # terminal wizard: detect GX18 + KB + SQL Server, register in your AI client
npx gx18-mcp ui        # same, in a local browser UI — plus a runner for all the tools
npx gx18-mcp doctor    # health check: worker, GX18 dir, KB, ping, EntityVersion count
```

Prefer a GUI? `gx18-mcp ui` starts a local web app on `127.0.0.1` (opens your browser) with a
config/validate/doctor/register panel **and** a form-driven runner for every tool. It binds to
loopback only, gates the API behind a per-session token in the URL fragment, and enforces a Host
allowlist — but it can read **and write** your KB, so keep the URL private.

`setup` writes config to `%LOCALAPPDATA%\gx18-mcp\config.json` and registers the server in the
clients you pick (Claude Code project `.mcp.json`, Claude Desktop, Cursor, or VS Code), then runs a
quick verification. In Claude Code, confirm with `/mcp` → `gx18 ✅ connected`.

The server inherits the Windows identity of the shell that launches it — that is what guarantees
the correct author on every write.

### CLI

```bash
gx18-mcp start     # start the MCP server on stdio (default command)
gx18-mcp setup     # interactive wizard (config + client registration + verify)
gx18-mcp ui        # local web UI: setup panel + tool runner (--port <n>, --no-open)
gx18-mcp doctor    # environment health check
gx18-mcp stop      # gracefully shut down a running worker
```

---

## VS Code — mcp.json

Add to `%APPDATA%\Code\User\mcp.json` (global) or `.vscode/mcp.json` (project):

```json
"gx18-mcp": {
  "type": "stdio",
  "command": "npx",
  "args": ["gx18-mcp@latest", "start"],
  "env": {
    "GX_KB_PATH": "${input:gx_kb_path}",
    "GX_KB_SERVER": "(localdb)\\MSSQLLocalDB",
    "GX_KB_DATABASE": "${input:gx_kb_database}",
    "GX18_INSTALL_DIR": "${input:gx_install_dir}",
    "GX_OUTPUT_PATH": "${input:gx_output_path}"
  }
}
```

Add the corresponding `inputs` block to the same file so VS Code prompts for the values on first use:

```json
"inputs": [
  { "id": "gx_kb_path",      "type": "promptString", "description": "Knowledge Base Path" },
  { "id": "gx_kb_database",  "type": "promptString", "description": "Knowledge Base Database Name" },
  { "id": "gx_install_dir",  "type": "promptString", "description": "GeneXus 18 Installation Directory" },
  { "id": "gx_output_path",  "type": "promptString", "description": "Output Path" }
]
```

Alternatively, run `npx gx18-mcp setup` and choose **VS Code** — it writes both blocks automatically.

---

## Configuration

Read from a project `.env` and/or `%LOCALAPPDATA%\gx18-mcp\config.json`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GX_KB_PATH` | yes | — | KB folder (contains the `.gxw`) |
| `GX_KB_SERVER` | yes | `(localdb)\MSSQLLocalDB` | KB SQL Server instance |
| `GX_KB_DATABASE` | yes | — | KB database name |
| `GX18_INSTALL_DIR` | no | `C:\Program Files (x86)\GeneXus\GeneXus18U6` | GX18 install dir |
| `GX_OUTPUT_PATH` | no | `.\output` | Default target for `gx_export` |
| `ORACLE_HOST` / `ORACLE_PORT` / `ORACLE_SERVICE` / `ORACLE_USER` / `ORACLE_PASSWORD` | no | — | Enables the `oracle` connection in `gx_db_query` (ODP.NET Managed, supports NNE) |

> ⚠️ **`GX_KB_SERVER` must keep the parentheses**: `(localdb)\MSSQLLocalDB`. Without them the SQL
> client treats it as a named instance and times out (~30 s).

---

## Tools

| Group | Tools |
|---|---|
| **Read** (SQL, zero revisions) | `gx_find`, `gx_list`, `gx_get`, `gx_read`, `gx_properties`, `gx_structure`, `gx_whoami`, `gx_sql` |
| **Database** | `gx_db_connections`, `gx_db_query` (`kb` = SQL Server / Win auth; `oracle` = ODP.NET Managed) |
| **Write** (SDK, UserId-verified) | `gx_create`, `gx_modify`, `gx_export`, `gx_import` — all writes require `confirm: true` |
| **Stubs** (registered, not yet implemented) | `gx_set_property`, `gx_rename`, `gx_validate`, `gx_build` |

`gx_create` supports `procedure`, `webpanel`, `webcomponent`, `api`, `usercontrol`, `dso`, `sdt`,
`dataselector`, and `transaction` (experimental). Full argument reference, the write-support matrix,
and examples live in the docs below.

`gx_import` imports a `.xpz` via the native GeneXus Knowledge Manager (the safe GX18 path — **not** the
gxnext mass-import). The author is the Windows user, verified after import. Use the **export → edit the
`.xpz` → import** round-trip to change sections the SDK write path can't reach — notably UserControl
`AfterShow`/`Methods` scripts (stored as CDATA in the archive).

---

## Why the UserId is correct

`gxnext` (GeneXus Next 2026) opens a GX18 KB under a service account (`UserId 322`) and its
startup re-index re-saves everything — on the 2026-06-17 incident that produced **76k+ false
revisions** in Team Development. `gx18-mcp` avoids both failure modes:

| | gxnext | gx18-mcp |
|---|---|---|
| Process identity | service account → `UserId 322` | child of the dev's shell → real Windows user |
| Revisions on open | tens of thousands (storm) | **0** (`AvoidStartupUpdate=true`) |
| Post-save check | none | asserts `UserId` on every save |

**gx18-mcp is the safe write channel for GX18; gxnext stays forbidden for any write/open against a
GX18 KB.**

---

## Build from source (publishing)

Building the C# worker requires **Windows** with the **.NET SDK** (`dotnet`) and GeneXus 18 SDK
reference assemblies. The pre-built worker `.exe` (plus its runtime DLLs) ships inside the npm
package under `dist/worker/`.

```bash
npm install
npm run build          # esbuild → dist/ (server + CLI)
npm run build:worker   # dotnet build → dist/worker/Gx18Mcp.SdkWorker.exe (+ Oracle DLL)
npm test               # vitest (TS)
npm run test:worker    # xUnit (C#)
node dist/bin/gx18-mcp.js doctor
```

`prepublishOnly` runs both builds; `npm publish` must therefore run on Windows.

---

## Docs

- [`docs/gx18-mcp-uso.md`](../../docs/gx18-mcp-uso.md) — usage guide (PT-BR): env vars, CLI, tool
  reference with examples.
- [`docs/gx18-mcp.md`](../../docs/gx18-mcp.md) — architecture, headless SDK bootstrap, write-support
  matrix, KB-clone testing procedure.

## License

MIT
