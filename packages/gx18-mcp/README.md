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

## Setup — Claude Desktop / Claude Code

### Step 1 — Install globally (one time)

```bash
npm install -g gx18-mcp
```

Global install starts instantly — no download on each connect, no silent update that causes a
timeout. To update later: `npm update -g gx18-mcp`.

### Step 2 — Add to your AI client config

Pass the KB connection values as **env vars directly in the MCP config**. No browser, no wizard.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gx18": {
      "command": "gx18-mcp",
      "args": ["start"],
      "env": {
        "GX_KB_PATH":       "C:\\KBs\\MyKB",
        "GX_KB_SERVER":     "(localdb)\\MSSQLLocalDB",
        "GX_KB_DATABASE":   "GX_KB_MyKB",
        "GX18_INSTALL_DIR": "C:\\Program Files (x86)\\GeneXus\\GeneXus18U6"
      }
    }
  }
}
```

**Claude Code** (`.mcp.json` at project root):

```json
{
  "mcpServers": {
    "gx18": {
      "command": "gx18-mcp",
      "args": ["start"],
      "env": {
        "GX_KB_PATH":       "C:\\KBs\\MyKB",
        "GX_KB_SERVER":     "(localdb)\\MSSQLLocalDB",
        "GX_KB_DATABASE":   "GX_KB_MyKB",
        "GX18_INSTALL_DIR": "C:\\Program Files (x86)\\GeneXus\\GeneXus18U6"
      }
    }
  }
}
```

Fill in your values, save, then verify in Claude Code with `/mcp` → `gx18 ✅ connected`.

> **No global install?** Use `npx -y gx18-mcp start` as the command. First run downloads the
> package (~30 s) and the connection will time out once — reload Claude Code after that and it
> will connect immediately from cache.

> ⚠️ **`GX_KB_PATH`** is the folder that contains the `.gxw` file, **not** the `.gxw` itself.
> **`GX_KB_SERVER`** must keep the parentheses: `(localdb)\MSSQLLocalDB` — without them the SQL
> client treats it as a named instance and times out (~30 s).
> **`(localdb)\MSSQLLocalDB`** is a per-Windows-user instance. Each developer must point to their
> own SQL Server instance where the KB was restored/attached.

---

## Quickstart (CLI)

```bash
npx gx18-mcp doctor    # health check: worker, GX18 dir, KB, ping, EntityVersion count
npx gx18-mcp setup     # optional terminal wizard to write %LOCALAPPDATA%\gx18-mcp\config.json
```

The server inherits the Windows identity of the shell that launches it — that is what guarantees
the correct author on every write.

### CLI

```bash
gx18-mcp start     # start the MCP server on stdio (default command)
gx18-mcp setup     # interactive wizard (config + client registration + verify)
gx18-mcp doctor    # environment health check
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

## FAQ

**Connection timed out on first run**

`npx -y gx18-mcp start` downloads the package on first run (~30 s) and the MCP handshake
times out before the server is ready. Fix: install globally once so subsequent starts are
instant.

```bash
npm install -g gx18-mcp
# then use "command": "gx18-mcp" in your .mcp.json (no npx)
```

If you prefer npx, reload Claude Code after the first timeout — the package will be cached and
the next connection will succeed.

---

**`(localdb)\MSSQLLocalDB` not found / connection timeout**

`(localdb)\MSSQLLocalDB` is a **per-Windows-user** SQL Server instance. Each developer must
point `GX_KB_SERVER` to the instance where **their own** KB is attached. If the KB was created
on a different machine or user account, restore it locally first.

Common values:
- `(localdb)\MSSQLLocalDB` — default LocalDB (Visual Studio / SQL Server Express)
- `.\SQLEXPRESS` — named SQL Server Express instance
- `localhost` — full SQL Server on the same machine

The parentheses in `(localdb)\MSSQLLocalDB` are **required** — without them the SQL client
treats it as a named instance and times out after ~30 s.

---

**Write tools return "requires confirm: true"**

All KB write operations (`gx_create`, `gx_modify`, `gx_import`, `gx_delete`, etc.) require
`confirm: true` in the call to prevent accidental writes. Always run `gx_whoami` first to
confirm the Windows identity before any write — the server verifies `UserId` after every save
and will fail loudly if the author is wrong.

To disable all writes (read-only mode):

```json
"env": { "GX18_READONLY": "true" }
```

---

**Oracle connection fails (NNE / Native Network Encryption)**

Oracle environments that require NNE cannot use the Node.js `oracledb` thin driver. `gx18-mcp`
routes Oracle queries through the C# worker (ODP.NET Managed), which supports NNE natively
without an Oracle Client installation. Configure via env vars:

```json
"env": {
  "ORACLE_HOST":    "your-oracle-host",
  "ORACLE_PORT":    "1521",
  "ORACLE_SERVICE": "your.service.name",
  "ORACLE_USER":    "YOUR_USER",
  "ORACLE_PASSWORD": "your-password"
}
```

Verify with: `gx_db_query { "connection": "oracle", "query": "SELECT COUNT(*) FROM USER_TABLES" }`

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
