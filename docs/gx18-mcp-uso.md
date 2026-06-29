# gx18-mcp — Guia de uso

Servidor MCP nativo para **GeneXus 18** que lê e escreve na Knowledge Base **sem** corromper o
Team Development como o `gxnext` (GeneXus Next 2026) faz. Leitura via SQL direto (zero revisões);
escrita via SDK GX18 com o **usuário Windows correto** (autor = você, não uma identidade de serviço).

> Para arquitetura, bootstrap headless do SDK e detalhes internos, ver
> [`gx18-mcp.md`](gx18-mcp.md). Este arquivo é só **onboarding e instalação**.

> **Referência de uso das tools:** o catálogo completo, exemplos e anti-padrões vivem nos resources embutidos `gx18://docs/usage-guide` e `gx18://docs/quick-reference` — sempre sincronizados com o servidor.

---

## 1. O que já funciona (status real)

| Capacidade | Status |
|---|---|
| **Leitura** de objetos (find/list/get/read/properties/structure) | ✅ |
| **SQL direto** na KB (`gx_sql`) e em conexões nomeadas (`gx_db_query`) | ✅ |
| **Oracle** via ODP.NET Managed (suporta NNE) | ✅ |
| **`gx_whoami`** — confirma o UserId Windows antes de escrever | ✅ |
| **Criação** de objetos: procedure, webpanel, webcomponent, api, usercontrol, dataselector, dso | ✅ |
| **Criação** de SDT (estrutura) | ✅ |
| **`gx_modify`** — substituir uma section de objeto existente | ✅ |
| **`gx_export`** — exportar `.xpz` real (Knowledge Manager) + valida o objeto | ✅ |
| **`gx_import`** — importar `.xpz` (Knowledge Manager nativo), autor verificado; round-trip alcança scripts de UC | ✅ validado no clone (22/06) |
| **Criação** de transaction | ⚠️ bloqueado — [issue #9](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/9) |
| Export `.xpz` de SDT recém-criado na mesma sessão | ⚠️ retorna false — [issue #10](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/10) |
| `gx_set_property`, `gx_rename`, `gx_validate`, `gx_build` | ⛔ stubs ([#11](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/11), [#12](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/12)) |

**Toda escrita já foi validada no clone descartável** com autor correto
(UserId real do Windows) e exatamente 1 revisão. Sempre teste no clone antes de gravar na KB live.

---

## 2. Pré-requisitos

- **Node.js 18+**
- **GeneXus 18** instalado (default `C:\Program Files (x86)\GeneXus\GeneXus18U6`)
- **.NET Framework 4.8** (já vem no Windows) — o worker é `net48 x86`
- **.NET SDK** (`dotnet`) só para **buildar** o worker
- Acesso à instância SQL Server da KB (Windows Integrated Security)

---

## 3. Variáveis de ambiente

Lidas do `.env` na raiz do projeto (e/ou de `%LOCALAPPDATA%\gx18-mcp\config.json`).

| Variável | Obrigatória | Default | Para quê |
|---|---|---|---|
| `GX_KB_PATH` | sim | — | Pasta da KB (contém o `.gxw`) |
| `GX_KB_SERVER` | sim | `(localdb)\MSSQLLocalDB` | Instância SQL Server da KB |
| `GX_KB_DATABASE` | sim | — | Nome do banco da KB |
| `GX18_INSTALL_DIR` | não | `C:\Program Files (x86)\GeneXus\GeneXus18U6` | Pasta de instalação do GX18 |
| `GX_OUTPUT_PATH` | não | `.\output` | Destino padrão do `gx_export` |
| `GX18_WORKER_EXE` | não | `dist/worker/Gx18Mcp.SdkWorker.exe` | Caminho alternativo do worker |
| `GX18_LOG_LEVEL` | não | `info` | `debug` \| `info` \| `warn` \| `error` |
| `ORACLE_HOST` | não | — | Ativa a conexão `oracle` no `gx_db_query` |
| `ORACLE_PORT` | não | `1521` | Porta Oracle |
| `ORACLE_SERVICE` | não | — | Service name Oracle |
| `ORACLE_USER` / `ORACLE_PASSWORD` | não | — | Credenciais Oracle |

> ⚠️ **`GX_KB_SERVER` precisa manter os parênteses**: `(localdb)\MSSQLLocalDB`.
> Sem eles o client SQL trata como instância nomeada inexistente e dá timeout de 30 s.

---

## 4. Build

```bash
cd packages/gx18-mcp
npm install
npm run build          # esbuild → dist/ (servidor + CLI em JS)
npm run build:worker   # dotnet build → dist/worker/Gx18Mcp.SdkWorker.exe (+ DLL Oracle)
```

> Se `build:worker` falhar com exit 1: o `.exe` está travado por um worker rodando.
> Encerre os processos `Gx18Mcp.SdkWorker` e rode de novo.

---

## 5. Subir o MCP

### Via Claude Code (recomendado)

Já está registrado no `.mcp.json` do projeto:

```json
{
  "mcpServers": {
    "gx18": {
      "command": "node",
      "args": ["packages/gx18-mcp/dist/bin/gx18-mcp.js", "start"]
    }
  }
}
```

O Claude Code spawna o processo automaticamente. Verifique com `/mcp` → deve mostrar `gx18 ✅ connected`.
O servidor herda a identidade Windows da sessão — é isso que garante o autor correto.

### Comandos do CLI

```bash
node dist/bin/gx18-mcp.js start    # inicia o servidor MCP em stdio (default)
node dist/bin/gx18-mcp.js doctor   # health-check: worker, GX18, KB, ping, contagem EntityVersion
node dist/bin/gx18-mcp.js setup    # wizard: configura paths e registra em Claude/Cursor
node dist/bin/gx18-mcp.js stop     # encerra o worker graciosamente
```

**Sempre rode `doctor` primeiro** ao validar o ambiente. Saída esperada:

```
[OK] Worker exe: ...Gx18Mcp.SdkWorker.exe
[OK] GX18 dir:   C:\Program Files (x86)\GeneXus\GeneXus18U6
[OK] KB path:    C:\KBs\MyProject
[OK] Worker ping:  user: DOMAIN\developer  sdkReady/sqlReady
[OK] SQL EntityVersion rows: <n>
```

---

## 6. Referência de tools e exemplos

O catálogo completo de tools, exemplos e anti-padrões são os resources embutidos `gx18://docs/usage-guide` e `gx18://docs/quick-reference` — sempre sincronizados com o servidor. Leia-os no runtime em vez desta seção.

---

## 7. Regras de segurança

- **Teste de escrita só no clone**, nunca na KB live. Procedimento de clone em
  [`gx18-mcp.md`](gx18-mcp.md#testing-safely----the-kb-clone).
- O `gx18-mcp` é o **canal de escrita seguro** para GX18. O `gxnext` continua **proibido**
  para qualquer escrita/abertura na KB GX18 (incidente 17/06/2026).
- `confirm: true` é obrigatório em toda operação de escrita. Em `gx_sql`/`gx_db_query`,
  escrita exige `readOnly: false` **e** `confirm: true`.
```
