# DsExampleActiveClients

DataSelector de exemplo que filtra clientes ativos com saldo positivo. Referência para criação de dataselectores via gx18-mcp.

> **Status: experimental** — o SDK gx18-mcp suporta apenas criação name-only para dataselector. A lógica interna (`defined by`, `where`, `order`) deve ser editada via IDE GX18 ou via XPZ.

## Identificação na KB

| Campo | Valor |
|-------|-------|
| EntityTypeId | 88 |
| Seção relevante | `structure` (name-only via MCP) |

## Criar via MCP (name-only)

```json
gx_create(
  type: "dataselector",
  name: "DsExampleActiveClients"
)
```

Isso cria o objeto vazio na KB. A lógica (`defined by`, `where`, `order`) é adicionada depois via IDE ou XPZ.

## Editar lógica interna via XPZ

Como o SDK não expõe escrita da lógica de dataselector, o caminho é:

1. Exportar pelo IDE (Knowledge Manager → Export) ou:
   ```json
   gx_export(type: 88, name: "DsExampleActiveClients")
   ```
2. Abrir o `.xpz` (ZIP), localizar o CDATA do objeto.
3. Substituir o conteúdo pela lógica desejada (ver `DsExampleActiveClients.gx` nesta pasta).
4. Re-importar:
   ```json
   gx_import(
     xpzFile:       "output/DS/DsExampleActiveClients_patched.xpz",
     type:          "dataselector",
     name:          "DsExampleActiveClients",
     fullOverwrite: true,
     confirm:       true
   )
   ```

## Sintaxe do dataselector

| Cláusula | Descrição |
|----------|-----------|
| `defined by <atributo>` | Atributo âncora (define o escopo de tabela) |
| `Where <condição>` | Filtro; múltiplas cláusulas são AND |
| `Order by <atributo>` | Ordenação do resultado |

## Usar em WebPanel / Procedure

```genexus
// Dentro de um For Each, referenciar o DataSelector:
For Each Client
    Using DsExampleActiveClients
    Where ClientRegion = &Region
    ...
EndFor
```

O dataselector pode receber parâmetros adicionais no `where` do `For Each` que o usa — funciona como filtro composável.

## Verificar criação

```json
gx_find(name: "DsExampleActiveClients")
gx_read(type: 88, name: "DsExampleActiveClients", section: "source")
```

## Notas

- DataSelectors não geram Java standalone — são referenciados em `For Each` e compilados embutidos no objeto que os usa.
- Renomear um DataSelector quebra todos os `For Each Using <Nome>` que o referenciam — preferir criar novo e deprecar o antigo.
- `gx_build` é stub — compilar sempre pelo IDE GX18 após criar/modificar.
