# PrcExampleHelloWorld

Procedure minimalista que recebe um nome e retorna uma saudação. Serve como referência de formato para procedures GeneXus via gx18-mcp.

## Estrutura do arquivo `.prc`

Um `.prc` tem duas seções implícitas:

| Seção | Descrição |
|-------|-----------|
| `rules` | Declaração de parâmetros via `Parm(...)` — primeira linha |
| `source` | Corpo da procedure — linha(s) seguintes |

## Parâmetros

| Nome | Direção | Tipo | Descrição |
|------|---------|------|-----------|
| `&Nome` | `in` | Character | Nome a cumprimentar |
| `&Saudacao` | `out` | Character | Saudação gerada |

## Criar via MCP

```json
gx_create(
  type: "procedure",
  name: "PrcExampleHelloWorld",
  sections: {
    rules:  "Parm(in:&Nome; out:&Saudacao);",
    source: "&Saudacao = 'Olá, ' + &Nome + '!'"
  }
)
```

Antes de criar, verificar se já existe:

```json
gx_find(name: "PrcExampleHelloWorld")
```

## Editar via MCP

Para alterar só o `source`:

```json
gx_modify(
  name:    "PrcExampleHelloWorld",
  type:    34,
  section: "source",
  content: "&Saudacao = 'Bem-vindo, ' + &Nome + '!'"
)
```

Para alterar só o `rules` (parâmetros):

```json
gx_modify(
  name:    "PrcExampleHelloWorld",
  type:    34,
  section: "rules",
  content: "Parm(in:&Nome; in:&Prefixo; out:&Saudacao);"
)
```

## Variáveis

As variáveis (`&Nome`, `&Saudacao`) precisam existir no objeto antes de compilar. Elas são criadas automaticamente pelo SDK quando você passa `sections.rules` com o `Parm` — o GeneXus as infere dos parâmetros declarados.

Para variáveis adicionais no `source` que não aparecem no `Parm`, use `gx_variable` após a criação ou adicione via IDE.

## Ler de volta

```json
gx_read(type: 34, name: "PrcExampleHelloWorld", section: "source")
gx_read(type: 34, name: "PrcExampleHelloWorld", section: "rules")
```

> **Nota:** `gx_read` para procedures (EntityTypeId 34) decodifica o blob GZip e retorna o texto da seção solicitada. O corpo completo da procedure está em `section:"source"`; a declaração de parâmetros está em `section:"rules"`.

## Limitações conhecidas

- O Java gerado fica em `C:\KBs\...\javaoracle\web\src\main\java\<nome>.java` — só atualizado após Build no IDE.
- `gx_build` é stub (`NotImplementedException`) — build sempre pelo IDE GX18.
