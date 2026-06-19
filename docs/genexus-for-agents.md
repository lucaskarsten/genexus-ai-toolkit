# GeneXus for Agents — Setup Guide

GeneXus for Agents (disponível desde GeneXus Next 2026.01) expõe o Knowledge Base via MCP — permitindo que agentes de IA criem objetos, modifiquem propriedades, executem builds e consultem metadados por linguagem natural.

Este toolkit inclui configuração pronta para **Claude Code**, **OpenAI Codex CLI**, e **VS Code / Cursor**.

---

## Pré-requisitos

- **GeneXus Next 2026.01** ou posterior
- Este toolkit clonado com submodules: `git clone --recurse-submodules ...`
- `.env` configurado: copie `.env.example` → `.env` e preencha `GX_DOCKER_FOLDER`

---

## 1. Iniciar o GeneXus MCP Server

### Opção A — Docker (recomendado)

Configure o path do Docker no `.env`:

```
GX_DOCKER_FOLDER=C:\Users\você\Downloads\gx-desktop-web-1.2.48-r117
```

Depois suba com o script do toolkit:

```powershell
.\scripts\start-gxnext.ps1
```

O script lê `GX_DOCKER_FOLDER` do `.env`, sobe o stack (`gxweb + gxms + sql + opensearch`) e aguarda a IDE ficar disponível.

| Endpoint | URL |
|---|---|
| IDE | http://localhost:3000 |
| MCP | http://localhost:**8001**/mcp |

### Opção B — GeneXus Next nativo

Abra o GeneXus Next normalmente. O `GeneXus.Services.Host.exe` sobe automaticamente.

| Endpoint | URL |
|---|---|
| IDE | (app desktop) |
| MCP | http://localhost:**1989**/mcp |

> Se usar nativo, mude a URL de MCP para `http://localhost:1989/mcp` nos configs abaixo.

**Configurar pasta de KBs (opcional):**

Crie `GeneXusNext\bl\settings-overrides.json`:

```json
{
  "ProjectsFolder": "C:\\KBs",
  "ProjectsDataFolder": "C:\\KBs",
  "SqlServerDefaultInstance": ".\\SQLEXPRESS"
}
```

---

## 2. Claude Code

Este toolkit já inclui `.mcp.json` na raiz. O servidor é detectado automaticamente ao abrir o projeto.

**Verificar conexão:**

```
/mcp
```

Você deve ver `gxnext ✅ connected`.

**Adicionar manualmente (se necessário):**

```bash
# Projeto — Docker
claude mcp add --transport http gxnext http://localhost:8001/mcp

# Projeto — nativo
claude mcp add --transport http gxnext http://localhost:1989/mcp

# Global (todos os projetos)
claude mcp add --scope user --transport http gxnext http://localhost:1989/mcp
```

**Instalar a skill nexa:**

```bash
claude --add-dir skills/nexa/nexa
```

---

## 3. OpenAI Codex CLI

Este toolkit inclui `codex.toml` na raiz, que é lido automaticamente pelo Codex CLI.

```bash
# Instalar Codex CLI (uma vez)
npm install -g @openai/codex

# Executar no diretório do toolkit
codex
```

O `codex.toml` já aponta para `http://localhost:8001/mcp`. Se usar GeneXus Next nativo, edite a URL:

```toml
# codex.toml
[mcp_servers.gxnext]
type = "http"
url  = "http://localhost:1989/mcp"
```

**Contexto GeneXus para o Codex:** copie os skills para o contexto da sessão ou inclua via `--context`:

```bash
codex --context skills/genexus-expert.md "Crie uma Transaction chamada Product"
```

---

## 4. VS Code (GitHub Copilot Agent) / Cursor

Este toolkit inclui `.vscode/mcp.json` com a configuração do `gxnext`.

**VS Code:** Copilot agent mode detecta `.vscode/mcp.json` automaticamente. Abra o projeto e verifique em **MCP Servers** no painel do Copilot.

**Cursor:** Crie `.cursor/mcp.json` com o mesmo conteúdo de `.vscode/mcp.json`:

```bash
cp .vscode/mcp.json .cursor/mcp.json
```

```json
{
  "servers": {
    "gxnext": {
      "type": "http",
      "url": "http://localhost:8001/mcp"
    }
  }
}
```

---

## 5. ChatGPT Desktop

ChatGPT Desktop suporta MCP via configuração manual no app.

1. Abra **Settings → Beta features → Model Context Protocol**
2. Adicione servidor:
   - **Name:** gxnext
   - **Type:** HTTP
   - **URL:** `http://localhost:8001/mcp`
3. Reinicie o ChatGPT Desktop

---

## 6. Fluxo de trabalho típico

```
Prompt natural (qualquer agente)
    ↓
Skill nexa (contexto GeneXus)
    ↓
Ferramentas gxnext via MCP
  └─ criar/modificar objetos no KB
  └─ configurar propriedades
  └─ executar build
    ↓
GeneXus Next compila → resultado ao agente
```

**Exemplos de prompts:**

```
Crie uma Transaction chamada Customer com CustomerId (autonumber), CustomerName e CustomerEmail.

Adicione regra de validação em Order: TotalAmount não pode ser negativo.

Execute o build do modelo Java para a KB atual.

Liste todos os WebPanels que referenciam a Transaction Product.

Crie um WebPanel WbpCustomerList com grid paginado da Transaction Customer.
```

---

## 7. ⚠️ gxnext + KB GeneXus 18 — incompatibilidade destrutiva

**Nunca use ferramentas gxnext que abram a KB em uma KB GeneXus 18.** Isso inclui `open_knowledge_base`, `import_text_to_kb`, `build_all`, e qualquer outra operação de escrita.

**Por quê:** O GeneXus Next usa um `UserId` interno diferente do usuário Windows da sessão. Ao abrir uma KB GX18, o servidor registra uma nova `EntityVersion` para cada objeto que processa — mesmo sem alterar nada. Isso resulta em:
- Dezenas de milhares de revisões falsas no Team Development
- Todos os objetos aparecendo como "modificados" pelo usuário errado
- Histórico de versões corrompido, difícil de reverter sem intervenção SQL direta

Este comportamento foi confirmado em produção em 17/06/2026. O recovery custou ~6 horas de trabalho SQL.

### Ferramentas seguras vs. proibidas em KB GX18

| Ferramenta gxnext | GX18 | Motivo |
|---|---|---|
| `export_kb_to_text` | ✅ segura | Lê direto do SQL sem abrir sessão KB |
| `validate_kb_text_files` | ✅ segura | Só valida, não abre KB |
| `get_kb_property` | ✅ segura | Leitura de config |
| `open_knowledge_base` | 🚫 **PROIBIDA** | Cria revisões em todos os objetos processados |
| `import_text_to_kb` | 🚫 **PROIBIDA** | Implica abertura da KB |
| `import_knowledge_manager` | 🚫 **PROIBIDA** | Importação em massa + abertura |
| `build_all` / `build_one` | 🚫 **PROIBIDA** | Compila = salva implicitamente |
| `reorganize` | 🚫 **PROIBIDA** | Reescreve estrutura interna |
| `create_or_impact_database` | 🚫 **PROIBIDA** | Altera banco de deploy |

### Alternativas para KB GX18

| Necessidade | Alternativa segura |
|---|---|
| Exportar objetos (XPZ) | IDE GeneXus 18 → Knowledge Manager → Export |
| Ler conteúdo de objetos | `export_kb_to_text` ou SQL direto via `GX_KB_SERVER` |
| Criar/modificar objetos | Gerar templates em `output/` → aplicar manualmente no IDE GX18 |
| Build | IDE GeneXus 18 — nunca via gxnext em KB GX18 |

> Se o dano já ocorreu, consulte `docs/kb-sql-reference.md` → seção "Recovery — dano do gxnext em KB GX18".

---

## 8. Troubleshooting — servidor gxnext não responde

Se as ferramentas gxnext retornam "MCP transport dropped" ou não respondem, o servidor pode ter travado sem encerrar.

**Diagnosticar:**

```powershell
netstat -an | findstr 8001
```

Se não aparecer nenhuma linha, a porta não está escutando.

**Iniciar manualmente (GeneXus Next nativo):**

```powershell
cd "C:\Users\<seu-usuario>\AppData\Local\Programs\GeneXus\GeneXus Next"
.\bl\GeneXus.Services.Host.exe
```

Aguarde ~15 segundos. O servidor está pronto quando logar:

```
Now listening on: http://localhost:8001
Application started. Press Ctrl+C to shut down.
```

> A KB configurada no `.mcp.json` é aberta automaticamente. Se for uma KB GX18, **não use nenhuma ferramenta de escrita** — consulte a seção 7 acima.

---

## 9. import_text_to_kb — padrão de rootDirectory

A ferramenta `import_text_to_kb` requer que o `rootDirectory` seja um diretório **limpo com apenas os arquivos a importar**. Usar o root do projeto causa "MCP server transport dropped mid-call" de forma consistente — o servidor faz timeout ao tentar indexar o diretório inteiro.

**Padrão correto:**

```
1. Criar diretório temporário: output/<CATEGORIA>/tmp_import/
2. Copiar APENAS os arquivos alvo, mantendo a estrutura src/:
   tmp_import/
     src/
       <Modulo>/
         <SubModulo>/
           NomeDoObjeto.webcomponent.layout.xml
     src.ns/
       Themes/
         NomeDoDSO.designsystem.main.gx
3. Usar tmp_import/ como rootDirectory na chamada
4. Deletar tmp_import/ após o import
```

**Estrutura de paths exigida dentro do rootDirectory:**

| Tipo | Caminho |
|---|---|
| WebComponent (WBC) | `src/<Modulo>/<SubModulo>/NomeDoObjeto.webcomponent.layout.xml` |
| WebPanel (WBP) | `src/<Modulo>/<SubModulo>/NomeDoObjeto.webpanel.layout.xml` |
| DSO | `src.ns/Themes/NomeDoDSO.designsystem.main.gx` |
| Procedure | `src/<Modulo>/<SubModulo>/NomeDoObjeto.procedure.gx` |

> Esta ferramenta é proibida para KBs GeneXus 18 — consulte a seção 7.

---

## 10. gxnext vs. edição manual de arquivos

| Situação | Use |
|---|---|
| Criar/modificar objetos diretamente no KB | `gxnext` via MCP |
| Gerar templates para revisar antes de aplicar | Skills deste toolkit → `output/` |
| Consultar estrutura do KB via SQL | `docs/kb-sql-reference.md` |
| Inspecionar HTML/CSS gerado pelo compilador | `GX_COMPILER_OUTPUT` + scripts |

Com GeneXus Next + gxnext, não é necessário copiar-colar arquivos `.view` no IDE — o agente aplica as mudanças diretamente no KB.

---

## Referências

- [GeneXus for Agents — documentação oficial](https://wiki.genexus.com/commwiki/wiki?61619)
- [GeneXus MCP Server](https://wiki.genexus.com/commwiki/wiki?61623)
- [Guia de instalação Windows Native](https://wiki.genexus.com/commwiki/wiki?61624)
- [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) — skill nexa oficial
- [openai/codex](https://github.com/openai/codex) — Codex CLI
