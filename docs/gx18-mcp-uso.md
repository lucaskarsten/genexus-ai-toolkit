# gx18-mcp — Guia de uso

Servidor MCP nativo para **GeneXus 18** que lê e escreve na Knowledge Base **sem** corromper o
Team Development como o `gxnext` (GeneXus Next 2026) faz. Leitura via SQL direto (zero revisões);
escrita via SDK GX18 com o **usuário Windows correto** (autor = você, não uma identidade de serviço).

> Para arquitetura, bootstrap headless do SDK e detalhes internos, ver
> [`gx18-mcp.md`](gx18-mcp.md). Este arquivo é só **como usar**.

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

## 6. Tools disponíveis

### Leitura (SQL direto — zero revisões)

| Tool | Args | Faz |
|---|---|---|
| `gx_find` | `pattern`, `type?`, `limit?` | Busca objetos por nome (LIKE) |
| `gx_list` | `type`, `module?`, `limit?`, `offset?` | Lista objetos de um tipo |
| `gx_get` | `name`, `type` | Header + sub-componentes do objeto |
| `gx_read` | `name`, `type`, `section?` | Source reconstruído (blob GZip → texto) |
| `gx_properties` | `name`, `type` | Property bag do objeto |
| `gx_structure` | `name` | Atributos de uma Transaction |
| `gx_whoami` | — | Usuário Windows → UserId da KB |
| `gx_sql` | `query`, `readOnly?`, `confirm?` | SQL direto na KB |

`section` em `gx_read`: `source`, `events`, `rules`, `layout`, `variables`.

**`type` é o EntityTypeId** (valores verificados via SQL):

| Id | Tipo | Id | Tipo |
|---|---|---|---|
| 24 | Attribute | 39 | Transaction |
| 34 | Procedure | 147 | UserControl |
| 36 | SDT | 148 | WebPanel |
| 37 | Table | 149 | WebComponent |

> ℹ️ As descrições embutidas em algumas tools citam `43` para WebPanel/WebComponent — os valores
> reais podem variar por KB. Em caso de dúvida, use `gx_find` sem filtro de tipo
> (ele retorna o `entityTypeId` correto de cada resultado).

### Banco de dados

| Tool | Args | Faz |
|---|---|---|
| `gx_db_connections` | — | Lista conexões (`kb` sempre; `oracle` se `ORACLE_*` setado) |
| `gx_db_query` | `connection`, `query`, `readOnly?`, `limit?`, `confirm?` | SQL em conexão nomeada (`kb` ou `oracle`) |

`gx_db_query` cap de 1000 linhas. `oracle` roteia pelo worker C# (ODP.NET, suporta NNE).

### Escrita (SDK — autor verificado pós-save)

| Tool | Args | Faz |
|---|---|---|
| `gx_create` | `type`, `name`, `confirm`, + sections | Cria objeto novo |
| `gx_modify` | `name`, `type`, `section`, `content`, `confirm` | Substitui uma section |
| `gx_export` | `name`, `type`, `outputDir?` | Exporta `.xpz` real + valida |
| `gx_import` | `xpzFile`, `type`, `name`, `fullOverwrite?`, `confirm` | Importa `.xpz` via Knowledge Manager nativo (autor verificado). Round-trip export→editar→import alcança scripts de UC (`AfterShow`/`Methods`) que o `gx_modify` não toca |

Toda escrita exige **`confirm: true`**. O resultado inclui `userIdOk`, `userId`, `expectedUserId` —
se o autor não bater, a tool falha em vez de gravar lixo no Team Development.

`type` em `gx_create` (string): `procedure`, `webpanel`, `webcomponent`, `api`, `usercontrol`,
`dso`, `sdt`, `dataselector`, `transaction` (⚠️ experimental).

Sections aceitas por tipo:

| Tipo | Sections |
|---|---|
| `procedure` | `source`, `rules`, `conditions` |
| `webpanel` / `webcomponent` | `events`, `rules`, `conditions`, `layout` |
| `api` | `source` (service group), `events` |
| `usercontrol` | `template`, `properties` |
| `dso` | `tokens`, `styles`, `elements` (header tem que casar o nome: `styles <Nome> { … }`) |
| `sdt` / `transaction` | `structure` (array) |

Item de `structure`:
```json
{ "name": "Price", "type": "Numeric", "length": 10, "decimals": 2, "key": false }
```
`type` ∈ `Character`, `VarChar`, `LongVarChar`, `Numeric`, `Int`, `Date`, `DateTime`, `Boolean`, `GUID`.

### Ainda não implementadas (stubs)

`gx_set_property`, `gx_rename`, `gx_validate`, `gx_build` — registradas mas o worker ainda não
implementa. Não use em produção. Ver issues [#11](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/11)
e [#12](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/12).

---

## 7. Exemplos

**Verificar identidade antes de qualquer escrita:**
```json
// gx_whoami → { windowsUser: "DOMAIN\\developer", kbOpen, sdkReady }
```

**Ler o source de uma procedure:**
```json
// gx_read
{ "name": "PrcMyProcedure", "type": 34, "section": "source" }
```

**Criar uma procedure:**
```json
// gx_create
{ "type": "procedure", "name": "PrcMyHello", "confirm": true,
  "source": "msg(\"hello from gx18-mcp\")" }
// → { userIdOk: true, entityId, ... }
```

**Criar um SDT:**
```json
// gx_create
{ "type": "sdt", "name": "SdtMyItem", "confirm": true,
  "structure": [
    { "name": "Id",    "type": "Int",     "length": 9 },
    { "name": "Name",  "type": "VarChar", "length": 60 },
    { "name": "Value", "type": "Numeric", "length": 12, "decimals": 2 }
  ] }
```

**Exportar para `.xpz` (também valida):**
```json
// gx_export
{ "name": "PrcMyHello", "type": 34 }
// → grava <GX_OUTPUT_PATH>\PrcMyHello.xpz
```

**Consultar Oracle:**
```json
// gx_db_query
{ "connection": "oracle", "query": "SELECT COUNT(*) FROM USER_TABLES" }
```

---

## 8. Decisões de ferramenta — caminho certo vs caminho longo

Quando em dúvida, use a ferramenta mais direta. Esta seção lista os erros mais comuns.

### Anti-padrões frequentes

| ❌ Caminho longo (errado) | ✅ Ferramenta certa | Motivo |
|---|---|---|
| Ler `javaoracle/web/src/main/java/<proc>.java` | `gx_read name=X type=34 section=source` | O Java é gerado — pode estar desatualizado; o source na KB é canônico |
| Ler `static/UserControls/<uc>/<uc>render.js` | `gx_read name=X type=147 section=source` | O render.js é gerado no build — qualquer edição é sobrescrita |
| SQL manual em `EntityVersion WHERE EntityVersionName LIKE '%X%'` | `gx_find pattern=X` | gx_find retorna id, tipo e nome já formatados |
| SQL manual em `EntityVersionComposition` para estrutura de TRN | `gx_structure name=X` | gx_structure decodifica o blob e retorna campos formatados |
| `gx_read type=147 section=events` para scripts AfterShow/Methods de UC | `gx_export` → abrir .xpz | gx_read não captura as partes de script de UC; só o export as inclui |
| `gx_import` para editar source de objeto existente | `gx_modify name=X type=N section=source content=... confirm:true` | gx_import não sobrescreve objeto existente (silencioso) |
| `gx_modify` para editar AfterShow/Methods de UC | `gx_export` → patch CDATA → `gx_import` | gx_modify não alcança as partes de script do UserControl |
| `gx_read section=properties` para saber o valor de uma propriedade | `gx_properties name=X type=N` | gx_read retorna definições XML de property; gx_properties retorna o valor real |
| `gx_db_query connection=kb` para query na KB | `gx_sql query=...` | gx_sql já aponta para a KB — gx_db_query com kb é redundante |
| Gerar código em `output/` quando a intenção é criar na KB | `gx_create type=X name=Y confirm:true` | output/ é rascunho para revisão humana; gx_create escreve diretamente na KB |
| Assumir que o UserId está correto e escrever direto | `gx_whoami` antes de qualquer write | gx_whoami confirma identidade Windows; author errado corrompe Team Development |

### Workflows completos

**Ler source de qualquer objeto:**
```
gx_find pattern=<nome>           → confirma entityTypeId real
gx_read name=<nome> type=<id> section=source
```

**Criar procedure nova:**
```
gx_whoami                        → confirma UserId
gx_find pattern=<nome>           → garante que não existe
gx_create type=procedure name=X source="..." confirm:true
gx_export name=X type=34         → valida e gera .xpz de backup
```

**Editar source de objeto existente:**
```
gx_whoami                        → confirma UserId
gx_read name=X type=N section=source   → lê conteúdo atual
gx_modify name=X type=N section=source content="..." confirm:true
```

**Editar scripts AfterShow/Methods de UserControl:**
```
gx_whoami                        → confirma UserId
gx_export name=X type=147        → gera output/X.xpz
# Abrir .xpz (ZIP), editar CDATA dentro de <Script Name="AfterShow">
# Bumpar lastUpdate + recalcular checksum md5
gx_import xpzFile=output/X.xpz type=usercontrol name=X fullOverwrite:true confirm:true
gx_export name=X type=147        → re-exporta para verificar que o script entrou
```

**Editar DSO (tokens/styles):**
```
gx_whoami
gx_read name=X type=161 section=styles   → lê CSS atual
gx_modify name=X type=161 section=styles content="@import DsoBase;\n..." confirm:true
# Nota: usar @import DsoBase; (nome amigável), NÃO o GUID que aparece no blob
```

**Query ad-hoc para exploração:**
```
gx_sql query="SELECT ev.EntityVersionName, ev.EntityTypeId FROM EntityVersion ev WHERE ev.EntityVersionName LIKE '%X%'"
# Para Oracle:
gx_db_query connection=oracle query="SELECT COUNT(*) FROM USER_TABLES"
```

**Round-trip export → editar → import (técnica geral):**
```
gx_export name=X type=N outputDir=output/
# Editar output/X.xpz: é ZIP com um único *.xml; scripts em CDATA
# Bumpar lastUpdate no <Object> + novo checksum md5
gx_import xpzFile=output/X.xpz type=<tipo-string> name=X fullOverwrite:true confirm:true
```

---

## 9. Regras de segurança

- **Teste de escrita só no clone**, nunca na KB live. Procedimento de clone em
  [`gx18-mcp.md`](gx18-mcp.md#testing-safely--the-kb-clone).
- O `gx18-mcp` é o **canal de escrita seguro** para GX18. O `gxnext` continua **proibido**
  para qualquer escrita/abertura na KB GX18 (incidente 17/06/2026).
- `confirm: true` é obrigatório em toda operação de escrita. Em `gx_sql`/`gx_db_query`,
  escrita exige `readOnly: false` **e** `confirm: true`.
```
