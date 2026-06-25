<div align="center">
  <img src="assets/icon-source.png" alt="GeneXus AI Toolkit" width="140" />

  <h1>GeneXus AI Toolkit</h1>

  <p><strong>Dê a qualquer LLM expertise profunda em GeneXus 18.</strong><br/>
  Gere UCs, DSOs, Web Panels e Procedures corretos na primeira tentativa.<br/>
  Leia e escreva sua Knowledge Base diretamente do Claude, VS Code ou qualquer cliente MCP.</p>

  <p>
    <a href="https://github.com/lucaskarsten/genexus-ai-toolkit/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/lucaskarsten/genexus-ai-toolkit?label=release&color=4CAF50&style=for-the-badge"/></a>
    <a href="https://www.npmjs.com/package/gx18-mcp"><img alt="npm" src="https://img.shields.io/npm/v/gx18-mcp?color=CB3837&style=for-the-badge&logo=npm"/></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge"/></a>
    <a href="https://github.com/lucaskarsten/genexus-ai-toolkit/discussions"><img alt="Discussions" src="https://img.shields.io/badge/discussions-welcome-blueviolet?style=for-the-badge"/></a>
    <a href="https://www.genexus.com"><img alt="GeneXus 18" src="https://img.shields.io/badge/GeneXus-18-0078D4?style=for-the-badge"/></a>
  </p>

  <p><em>Works with Claude Code · Claude Desktop · VS Code Copilot · Cursor · OpenAI Codex CLI · ChatGPT</em></p>
</div>

---

## 🚀 Versão 2.0 — Um Salto Enorme de Usabilidade

<div align="center">

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🎉  Chegamos na v2.0 — GeneXus AI Toolkit está maior do que       ║
║       nunca. 47 ferramentas MCP, UI de chat completa com            ║
║       Markdown e paste de imagens, round-trip XPZ para scripts      ║
║       de UC, clone SQL de WBC/WBP, suite de benchmark,             ║
║       auto-update e muito mais.                                      ║
║                                                                      ║
║   A Nara (nossa labrador) chegou pra ficar. 🐕                       ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

</div>

### O que há de novo na v2.0

| Área | O que mudou |
|---|---|
| 🔧 **47 ferramentas MCP** | De 19 para 47 — `gx_clone`, `gx_bulk_modify`, `gx_compare`, `gx_diff`, `gx_lint`, `gx_stats`, `gx_modules`, `gx_attribute`, `gx_dead_code`, `gx_patch_xpz` e muito mais |
| 📝 **Scripts de UC via XPZ** | `gx_modify script:AfterShow` e `script:<Method>` — edita scripts de UserControl diretamente sem abrir o IDE |
| 🏗️ **Clone SQL de WBC/WBP** | `gx_clone` para WebComponent e WebPanel via SQL 100% — sem NullRef headless |
| 💬 **Chat UI completo** | Markdown rendering, paste de imagens, animações, streaming — interface de chat profissional integrada ao MCP |
| 📚 **MCP Resources embarcados** | 8 docs técnicos disponíveis como recursos MCP para qualquer cliente — sem precisar copiar arquivos |
| 🐕 **Mascote Nara** | Identidade visual renovada com Nara a labrador |
| 📊 **Suite de Benchmark** | 47 ferramentas × 12 objetos — mede performance e detecta regressões automaticamente |
| ⚡ **Worker auto-recycle** | Elimina o slowdown progressivo — o worker C# recicla automaticamente e não vaza recursos |
| 🔒 **Proteção de integridade** | `gx_import` e `gx_modify events` bloqueados para WBC/WBP — previne corrupção de blobs tokenizados |

---

## O que seu AI pode fazer com este toolkit

<table>
<tr>
<th>❌ Sem o toolkit</th>
<th>✅ Com o toolkit</th>
</tr>
<tr>
<td>Inventa nomes de API que não existem</td>
<td>Usa apenas <code>gx.*</code> runtime APIs documentadas</td>
</tr>
<tr>
<td>Gera JS que quebra após AJAX Refresh</td>
<td>Aplica AfterShow + MutationObserver corretos</td>
</tr>
<tr>
<td>CSS que colide com auto-classes do GeneXus</td>
<td>Segue convenções BEM e estrutura DSO</td>
</tr>
<tr>
<td>Adivinha tipos de propriedade — quebra decimais silenciosamente</td>
<td>Sabe que <code>Type="numeric"</code> trunca; usa <code>string</code> + <code>Str()</code></td>
</tr>
<tr>
<td>Cria objetos com o UserId errado no Team Dev</td>
<td>SDK GX18 com sua identidade Windows — UserId correto em todo save</td>
</tr>
<tr>
<td>Editar scripts de UC requer abrir o IDE</td>
<td><code>gx_modify script:AfterShow</code> edita direto via XPZ round-trip</td>
</tr>
<tr>
<td>Análise de impacto manual e demorada</td>
<td><code>gx_impact</code>, <code>gx_where_used</code>, <code>gx_dead_code</code> — análise instantânea</td>
</tr>
<tr>
<td>Sem visibilidade sobre diferenças e histórico</td>
<td><code>gx_diff</code>, <code>gx_history</code>, <code>gx_compare</code> — rastreabilidade completa</td>
</tr>
</table>

---

## Download & Quick Start

### 🏆 Opção 1 — Standalone exe (recomendado para usuários finais)

Sem Node.js, Git ou qualquer instalação prévia necessária.

1. Baixe `GeneXusAIToolkit-windows.zip` da [última release](https://github.com/lucaskarsten/genexus-ai-toolkit/releases/latest)
2. Extraia para qualquer pasta (ex.: `C:\Tools\GeneXusAIToolkit\`)
3. Dê duplo clique em `GeneXusAIToolkit.exe`
4. O browser abre automaticamente com a UI de setup
5. Preencha os caminhos da KB e clique em **Save** — o servidor MCP está disponível na porta `7337`

A pasta `worker\` deve ficar ao lado do `.exe`. Não mova o executável sozinho.

Na próxima inicialização, o `.exe` verifica atualizações em background — quando há nova versão, baixa e aplica silenciosamente ao fechar.

### 📦 Opção 2 — npm

Requer Node.js 18+.

```bash
npm install -g gx18-mcp
gx18-mcp ui
```

### 🔧 Opção 3 — Clone (para contribuidores)

```bash
git clone --recurse-submodules https://github.com/lucaskarsten/genexus-ai-toolkit.git
cd genexus-ai-toolkit/packages/gx18-mcp
npm install
npm run build
node dist/bin/gx18-mcp.js ui
```

---

## Conectar ao Claude Desktop, VS Code ou Claude Code

Após salvar os caminhos da KB, vá para a aba **Connections** na UI. Cada cliente suportado tem um botão:

| Botão | O que faz |
|---|---|
| **Register** (Claude Desktop) | Escreve a entrada `gx18` no `claude_desktop_config.json`. Detecta automaticamente o caminho MS Store e o padrão (`AppData\Roaming\Claude\`). |
| **Register** (VS Code) | Escreve em `.vscode/mcp.json` no diretório de trabalho atual. |
| **Register** (Claude Code project) | Escreve em `.mcp.json` no diretório atual — detectado automaticamente quando Claude Code abre a pasta. |

Após registrar, **reinicie o Claude Desktop ou recarregue a janela do VS Code**.

O comando registrado aponta diretamente para o exe — sem `npx` ou Node.js em runtime:

```json
{
  "mcpServers": {
    "gx18": {
      "command": "C:\\Tools\\GeneXusAIToolkit\\GeneXusAIToolkit.exe",
      "args": ["start"]
    }
  }
}
```

---

## 47 Ferramentas MCP

O servidor `gx18` expõe **47 ferramentas** ao seu cliente AI, organizadas em categorias:

### 🔍 Leitura & Descoberta

| Ferramenta | O que faz |
|---|---|
| `gx_find` | Busca objetos por nome/padrão na KB |
| `gx_list` | Lista objetos de um tipo/módulo |
| `gx_get` | Detalhes completos de um objeto (tipo, módulo, datas) |
| `gx_read` | Lê source, events, layout, properties, template de um objeto |
| `gx_properties` | Propriedades SDK de um objeto |
| `gx_structure` | Estrutura de Transaction (atributos e níveis) |
| `gx_attribute` | Detalhes de atributos da KB |
| `gx_variable` | Lê/lista variáveis de um objeto |
| `gx_modules` | Lista módulos da KB com hierarquia |
| `gx_whoami` | Usuário Windows atual → UserId na KB |

### 📊 Análise & Qualidade

| Ferramenta | O que faz |
|---|---|
| `gx_analyze` | Dependências, uses/used-by de um objeto |
| `gx_where_used` | Onde um objeto é referenciado |
| `gx_impact` | Impacto de mudanças (cascata) |
| `gx_dead_code` | Detecta procedures/UCs não referenciados |
| `gx_search` | Busca full-text no source code da KB |
| `gx_lint` | Verifica convenções e anti-patterns |
| `gx_compare` | Compara dois objetos da KB |
| `gx_diff` | Diff entre versões de um objeto |
| `gx_stats` | Estatísticas gerais da KB |
| `gx_history` | Histórico de versões de um objeto |

### ✏️ Escrita (requer `confirm: true`)

| Ferramenta | O que faz |
|---|---|
| `gx_create` | Cria objeto novo via SDK GX18 (UserId correto) |
| `gx_modify` | Edita source/events/layout/template de objeto existente |
| `gx_set_property` | Altera propriedades individuais |
| `gx_rename` | Renomeia objeto |
| `gx_delete` | Remove objeto da KB |
| `gx_clone` | Clona objeto (100% SQL para WBC/WBP — sem NullRef) |
| `gx_move` | Move objeto para outro módulo |
| `gx_bulk_modify` | Modifica múltiplos objetos em lote |
| `gx_variable` | Cria/atualiza variáveis de um objeto |

### 📦 XPZ — Export/Import/Patch

| Ferramenta | O que faz |
|---|---|
| `gx_export` | Exporta objeto para `.xpz` (inclui UCs via SQL XPZ builder) |
| `gx_read_xpz` | Lista e lê scripts dentro de um `.xpz` |
| `gx_patch_xpz` | Aplica patch CDATA num script de `.xpz` |
| `gx_import` | Importa `.xpz` na KB (UserId-verificado) |

### 🗄️ Banco de Dados

| Ferramenta | O que faz |
|---|---|
| `gx_sql` | SQL direto contra a KB (SQL Server) |
| `gx_db_connections` | Lista conexões de banco configuradas |
| `gx_db_query` | Query em Oracle via ODP.NET (suporte a NNE) |

### ⚙️ Configuração & Diagnóstico

| Ferramenta | O que faz |
|---|---|
| `gx_save_config` | Atualiza caminhos da KB e reinicia o worker — direto do chat |
| `gx_doctor` | Diagnóstico de saúde do servidor e da KB |
| `gx_reload` | Força reload da KB no worker (após SQL writes diretos) |
| `gx_validate` | Valida objeto antes de salvar |

> Ferramentas de escrita requerem `confirm: true` e ficam desabilitadas no modo somente leitura (`GX18_READONLY=true`).

---

## Skills — Carregue expertise GeneXus no seu AI

Skills são arquivos Markdown que você carrega no seu cliente AI. Elas dão ao Claude (ou qualquer LLM) expertise profunda em GeneXus 18 como contexto de sistema.

### `genexus-uc.md` — Especialista em User Controls

Contexto expert para criar, refatorar e debugar UCs GeneXus 18.

- AfterShow Pattern A (IIFE + init-guard) e Pattern B (`window["ucInit_"]` + setTimeout)
- MutationObserver para re-render pós-AJAX Refresh
- SDT → JSON serialização (`Type="string"` + `decode()`)
- Floating dropdown, Control Type, jQuery namespace patterns
- 5-step decision path executado antes de qualquer geração de código

```bash
# Claude Code
cp skills/genexus-uc.md ~/.claude/skills/
```

### `genexus-expert.md` — Expert Geral GeneXus 18

Cobre todos os tipos de objeto GX18 com padrões testados em produção, mais referência rápida dos construtos GeneXus mais usados (tipos de atributo, rules, triggers) extraídos dos arquivos de referência nexa.

```bash
cp skills/genexus-expert.md ~/.claude/skills/
cp skills/genexus-kb-sql.md ~/.claude/skills/
```

### `skills/nexa/` — Skill Oficial GeneXus (autoridade de linguagem)

O submodulo oficial [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills). 24+ tipos de objetos GeneXus, referência completa de linguagem (rules, events, properties, data types). Carregue quando trabalhar em estrutura de objetos, design de transações, ou qualquer coisa que requeira a spec GeneXus autoritativa.

```bash
# Registrar com Claude Code
claude --add-dir skills/nexa/nexa

# Manter atualizado
git submodule update --remote skills/nexa
```

**ChatGPT / Copilot / outros LLMs:** cole o conteúdo de qualquer arquivo `.md` de skill no system prompt ou custom instructions.

---

## Recursos MCP Embarcados

Disponíveis para qualquer cliente MCP via `gx18://docs/<nome>`:

| Recurso | Conteúdo |
|---|---|
| `gx18://docs/quick-reference` | Tabela de decisão tool→tarefa, EntityTypeIds, sequências obrigatórias |
| `gx18://docs/usage-guide` | Referência completa de ferramentas, anti-patterns, exemplos |
| `gx18://docs/entity-types` | Todos os tipos com EntityTypeId, SDK type, suporte a escrita |
| `gx18://docs/write-safety` | Checklist pré-voo obrigatório antes de qualquer operação de escrita |
| `gx18://docs/xpz-workflow` | Guia completo de round-trip XPZ (scripts AfterShow/Methods de UC) |
| `gx18://docs/xpz-format-reference` | Schema XML do XPZ, Part GUIDs, tipagem de variáveis |
| `gx18://docs/genexus-knowledge` | Modelo de objetos, events, sintaxe, padrões canônicos |
| `gx18://docs/user-controls` | Guia de UC: AfterShow, MutationObserver, jQuery, catálogo de UCs |

---

## O que está incluído

```
genexus-ai-toolkit/
├── packages/
│   └── gx18-mcp/              # Servidor MCP GeneXus 18 (npm + exe standalone)
│       ├── src/               # TypeScript source (47 tools, UI, SDK bridge, config)
│       │   ├── ui/            # Web UI local (chat + dashboard + configuração)
│       │   ├── sdk-bridge/    # Bridge IPC com o worker C#
│       │   ├── tools/         # Implementações das 47 ferramentas MCP
│       │   └── docs/          # 8 docs técnicos embarcados como MCP Resources
│       ├── benchmark/         # Suite de benchmark (47 tools × 12 objetos)
│       ├── worker/            # Worker C# (SDK GX18, Oracle ODP.NET, IPC)
│       └── dist/worker/       # Worker pré-compilado + DLLs Oracle (commitado)
├── assets/                    # Ícone Nara e assets visuais
├── skills/                    # Skill files para LLMs
│   ├── genexus-uc.md          # Especialista em User Controls (GX18)
│   ├── genexus-expert.md      # Expert geral GX18 + digest de linguagem nexa
│   ├── genexus-kb-sql.md      # Acesso SQL direto à KB
│   └── nexa/                  # Skill oficial GeneXus Labs (submodule)
├── docs/                      # Guias de referência técnica
│   ├── user-controls-guide.md
│   ├── bem-css-naming.md
│   ├── common-pitfalls.md
│   ├── runtime-api-reference.md
│   ├── kb-sql-reference.md
│   ├── gx18-mcp.md
│   ├── genexus-for-agents.md
│   └── llm-engineering.md
├── .claude/agents/            # Subagentes especializados Claude Code
│   ├── gx-uc-builder.md       # Criação e modificação de UCs
│   ├── gx-wbp-builder.md      # Wiring de Web Panels e Web Components
│   ├── gx-kb-explorer.md      # Leitura de KB via gx18-mcp + SQL
│   ├── gx-dso-designer.md     # DSO CSS + design tokens
│   └── gx-reviewer.md         # Revisão de qualidade de código
├── examples/                  # Templates prontos para uso
│   ├── user-controls/         # 4 exemplos de UC funcionando
│   ├── design-system/         # Template DSO + design tokens
│   ├── web-panels/            # Exemplo WBP com pub/sub
│   └── templates/             # Scaffolds de UC e DSO
└── output/                    # Arquivos gerados por AI (gitignored, local)
```

---

## Clientes AI Suportados

| Cliente | Como conectar |
|---|---|
| **Claude Desktop** | Aba Connections → Register. Detecta automaticamente caminho MS Store. |
| **VS Code Copilot** | Aba Connections → Register (escreve `.vscode/mcp.json`). Habilite Agent mode no Copilot. |
| **Claude Code** | Aba Connections → Register (escreve `.mcp.json`). Detectado automaticamente na abertura do projeto. |
| **Cursor** | Register escreve `.cursor/mcp.json`. Ou copie `.vscode/mcp.json` → `.cursor/mcp.json`. |
| **OpenAI Codex CLI** | `codex.toml` está incluído no repo — detectado automaticamente no `codex`. |
| **ChatGPT Desktop** | App settings → MCP → Add `http://localhost:7337/mcp` manualmente. |

---

## Exemplos de UCs prontos

| UC | O que faz |
|----|---|
| [`UcDropdownMenu`](examples/user-controls/UcDropdownMenu/) | Botão + lista colapsável, itens via JSON, evento OnItemClick |
| [`UcUserMenu`](examples/user-controls/UcUserMenu/) | Avatar + nome + dropdown com logout/settings |
| [`UcToastNotification`](examples/user-controls/UcToastNotification/) | Alertas toast (success / error / warning / info) com auto-dismiss e métodos `Show()` / `Hide()` |
| [`UcNavSearch`](examples/user-controls/UcNavSearch/) | Busca com filtro live, navegação por teclado (setas + Escape), evento OnSelect |

Todos os quatro exemplos seguem os mesmos padrões — são o ground truth que o AI usa ao gerar novos UCs.

---

## Documentação de Referência

| Guia | Quando ler |
|---|---|
| [user-controls-guide.md](docs/user-controls-guide.md) | Criando ou editando qualquer User Control |
| [bem-css-naming.md](docs/bem-css-naming.md) | Escrevendo CSS para DSOs |
| [common-pitfalls.md](docs/common-pitfalls.md) | Debugando um UC que não funciona corretamente |
| [runtime-api-reference.md](docs/runtime-api-reference.md) | Usando `gx.fx.obs`, `gx.dom`, `gx.grid`, `gx.popup` |
| [kb-sql-reference.md](docs/kb-sql-reference.md) | Consultando a KB diretamente via SQL |
| [gx18-mcp.md](docs/gx18-mcp.md) | Arquitetura do gx18-mcp, matriz de suporte a escrita, setup de clone KB |
| [genexus-for-agents.md](docs/genexus-for-agents.md) | Configurando MCP para qualquer cliente AI |
| [llm-engineering.md](docs/llm-engineering.md) | Escrevendo ou melhorando skills e docs |

---

## Variáveis de Ambiente

| Variável | Obrigatória para | Descrição |
|---|---|---|
| `GX_KB_PATH` | gx18 MCP | Pasta raiz da KB GeneXus |
| `GX_KB_SERVER` | gx18 MCP | Instância SQL Server (padrão: `(localdb)\MSSQLLocalDB`) |
| `GX_KB_DATABASE` | gx18 MCP | Nome do banco de dados da KB |
| `GX_18_DIR` | gx18 MCP | Pasta de instalação do GeneXus 18 (auto-detectado se omitido) |
| `GX_OUTPUT_PATH` | Opcional | Pasta de output para arquivos gerados (padrão: `.\output`) |
| `GX_PROJECT_PREFIX` | Opcional | Prefixo para nomes de objetos gerados (ex.: `Acme`) |
| `GX_COMPILER_OUTPUT` | Opcional | Caminho de output do build GeneXus (Tomcat / .NET) |
| `GX18_READONLY` | Opcional | Defina `true` para desabilitar todas as ferramentas de escrita |

A UI salva configurações em `%LOCALAPPDATA%\gx18-mcp\config.json`. Variáveis de ambiente sobrescrevem a config salva quando ambas estão definidas.

Copie `.env.example` → `.env` e preencha seus valores.

---

## Para Desenvolvedores e Contribuidores

### Build

```bash
cd packages/gx18-mcp
npm install
npm run build            # TypeScript → dist/
npm run build:worker     # Worker C# SDK → dist/worker/
npm run build:exe        # Exe standalone → release/GeneXusAIToolkit.exe
npm test                 # Testes unitários Vitest
npm run test:all         # Unitários + integração + benchmark smoke
```

### Agentes (Claude Code)

O diretório `.claude/agents/` contém subagentes especializados disponíveis quando trabalhando neste projeto com Claude Code. Eles são automaticamente sugeridos quando a tarefa corresponde à descrição deles.

### Submodule nexa

O submodule `skills/nexa/` é a referência autoritativa de linguagem GeneXus mantida pelo GeneXus Labs. **Não** faz parte deste toolkit e é regido por sua própria licença.

```bash
# Inicializar após clone
git submodule update --init --recursive

# Atualizar para o mais recente
git submodule update --remote skills/nexa
```

---

## Opcional — GeneXus Next MCP

O script `scripts/optional/start-gxnext.ps1` inicia o GeneXus Next (versão Docker) se você quiser usar o servidor MCP oficial do GeneXus. Isso **não é necessário** para o workflow do gx18-mcp.

> ⚠️ **Atenção:** NÃO use ferramentas de escrita do gxnext em uma KB GeneXus 18 — cria revisões falsas com o usuário errado no Team Development. Ferramentas somente leitura (`export_kb_to_text`, `get_kb_property`) são seguras. Consulte [docs/genexus-for-agents.md](docs/genexus-for-agents.md) para detalhes.

---

## Recursos Oficiais GeneXus

| Recurso | O que é |
|---|---|
| [GeneXus for Agents](https://wiki.genexus.com/commwiki/wiki?61619) | Docs oficiais de integração MCP (GeneXus Next) |
| [genexuslabs/genexus-skills](https://github.com/genexuslabs/genexus-skills) | Repo oficial de skills — `skills/nexa/` é este submodule |
| [GeneXus Wiki](https://wiki.genexus.com) | Documentação completa da plataforma |
| [GeneXus Community](https://community.genexus.com) | Fóruns e Q&A |

---

## Contribuindo

PRs são bem-vindos — especialmente novos exemplos de UC, melhorias em skills e novos tools para o gx18-mcp. Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para diretrizes.

Perguntas ou ideias? Abra uma [Discussion](https://github.com/lucaskarsten/genexus-ai-toolkit/discussions).

---

## Licença

MIT — veja [LICENSE](LICENSE).

---

<div align="center">
  <img src="assets/icon-source.png" alt="Nara" width="60" />
  <br/>
  <sub>Feito com 🐕 pela Nara e muita IA · GeneXus AI Toolkit v2.0</sub>
</div>
