# TrnExampleProduct

Transaction de exemplo com os campos mais comuns: chave numérica, nome, descrição longa, preço e flag ativo. Referência para criação de Transactions via gx18-mcp.

> **Pitfall crítico:** o SDK pode lançar `ValidationException` durante `RefreshDefaultDependentParts()` ao tentar auto-gerar o form Web/Win. Se ocorrer, criar o TRN sem `structure` e adicionar os atributos via IDE.

## Identificação na KB

| Campo | Valor |
|-------|-------|
| EntityTypeId | 39 |
| Seção relevante | `structure` |

## Estrutura

| Atributo | Tipo GeneXus | Length | Decimals | Chave | Descrição |
|----------|-------------|--------|----------|-------|-----------|
| `ProductId` | numeric | 9 | 0 | Sim | Chave primária (obrigatória) |
| `ProductName` | varchar | 100 | 0 | Não | Nome do produto |
| `ProductDescription` | longvarchar | — | — | Não | Descrição longa |
| `ProductPrice` | numeric | 12 | 2 | Não | Preço unitário |
| `ProductActive` | boolean | — | — | Não | Status ativo/inativo |

> `key: true` no primeiro item é obrigatório para Transaction válida. Sem chave o GeneXus rejeita na compilação.

## Criar via MCP

```json
gx_create(
  type: "transaction",
  name: "TrnExampleProduct",
  sections: {
    structure: [
      { "name": "ProductId",          "type": "numeric",     "length": 9,   "decimals": 0, "key": true },
      { "name": "ProductName",        "type": "varchar",     "length": 100, "decimals": 0 },
      { "name": "ProductDescription", "type": "longvarchar" },
      { "name": "ProductPrice",       "type": "numeric",     "length": 12,  "decimals": 2 },
      { "name": "ProductActive",      "type": "boolean" }
    ]
  }
)
```

Se o SDK lançar `ValidationException` durante a criação com structure, criar sem:

```json
gx_create(type: "transaction", name: "TrnExampleProduct")
```

E adicionar os atributos via IDE GX18 (Transaction Editor → adicionar atributos manualmente).

## Verificar estrutura

```json
gx_structure(type: 39, name: "TrnExampleProduct")
```

## Mecanismo interno do SDK

O SDK cria a estrutura via:

```csharp
var attr = Attribute.Create(model);
attr.Name     = "ProductId";
attr.Type     = eDBType.NUMERIC;
attr.Length   = 9;
attr.Decimals = 0;
level.AddAttribute(attr);
```

A colisão de `ValidationException` ocorre na chamada interna `RefreshDefaultDependentParts()` que tenta gerar formulários padrão Web/Win — processo idêntico ao que o IDE faz ao salvar pela primeira vez.

## Usar em Procedure

```genexus
// Inserir via For Each
For Each Product
    Where ProductId = &Id
    ProductName   = &Nome
    ProductActive = True
EndFor

// Ou via new:
new Product
    ProductId     = &NextId
    ProductName   = "Novo Produto"
    ProductActive = True
EndNew
```

## Editar layout web

O layout web da Transaction (form gerado automaticamente) é editado exclusivamente pelo IDE GX18 (Transaction Editor → Web tab) ou via XPZ patchado. Não há suporte a `gx_modify(section:"layout")` para Transactions no SDK atual.

## Notas

- Transactions criam tabelas físicas no Oracle após `Create/Reorganize Database` no IDE.
- Convenção de prefixo neste projeto: `Trn<Prefixo><Nome>` (ex.: `TrnFoccoProduct`).
- `gx_build` é stub — compilar e reorganizar sempre pelo IDE GX18.
