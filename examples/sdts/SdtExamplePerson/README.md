# SdtExamplePerson

SDT (Structured Data Type) de exemplo com os tipos primitivos mais comuns: numeric, varchar, boolean. Referência para criação de SDTs via gx18-mcp.

## Identificação na KB

| Campo | Valor |
|-------|-------|
| EntityTypeId | 36 |
| Seção relevante | `structure` |

## Estrutura

| Membro | Tipo GeneXus | Length | Decimals | Descrição |
|--------|-------------|--------|----------|-----------|
| `PersonId` | numeric | 9 | 0 | Identificador único |
| `PersonName` | varchar | 60 | 0 | Nome completo |
| `PersonEmail` | varchar | 100 | 0 | E-mail |
| `Active` | boolean | — | — | Status ativo/inativo |

## Criar via MCP

```json
gx_create(
  type: "sdt",
  name: "SdtExamplePerson",
  sections: {
    structure: [
      { "name": "PersonId",    "type": "numeric", "length": 9,   "decimals": 0 },
      { "name": "PersonName",  "type": "varchar", "length": 60,  "decimals": 0 },
      { "name": "PersonEmail", "type": "varchar", "length": 100, "decimals": 0 },
      { "name": "Active",      "type": "boolean" }
    ]
  }
)
```

## Verificar estrutura criada

```json
gx_structure(type: 36, name: "SdtExamplePerson")
```

## Mecanismo interno do SDK

O SDK cria os membros via `SDTLevel.AddItem(name, eDBType, length, decimals)`. O enum `eDBType` (namespace `Artech.Genexus.Common`) aceita:

| String no JSON | eDBType |
|----------------|---------|
| `"numeric"` | NUMERIC |
| `"varchar"` | VARCHAR |
| `"longvarchar"` | LONGVARCHAR |
| `"boolean"` | Boolean |
| `"date"` | DATE |
| `"datetime"` | DATETIME |
| `"guid"` | GUID |
| `"int"` | INT |

## Usar em WebPanel / Procedure

```genexus
// Declarar variável do tipo SDT
&Person    is SdtExamplePerson
&PersonCol is SdtExamplePerson Collection

// Preencher
&Person.PersonId   = 1
&Person.PersonName = "João Silva"
&Person.Active     = True
&PersonCol.Add(&Person)

// Serializar para JSON (para passar para UC ou API)
&Json = &PersonCol.ToJson()
```

## Limitações conhecidas

- Export XPZ de SDT **recém-criado** (mesma sessão do worker) pode retornar `false`. SDTs existentes exportam normalmente.
- Estrutura complexa (itens aninhados / coleção dentro de SDT) requer criação via IDE GX18 — o SDK só suporta membros simples de nível 1 via `gx_create`.
- Para alterar a estrutura de um SDT existente, usar o IDE (a API SDK não expõe `RemoveItem`).
