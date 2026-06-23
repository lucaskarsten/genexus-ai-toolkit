# ApiExampleProducts

Objeto API REST de exemplo que expõe endpoints para listar e buscar produtos. Referência para criação de APIs GeneXus via gx18-mcp.

## Identificação na KB

| Campo | Valor |
|-------|-------|
| EntityTypeId | 86 |
| Seção de código | `source` (mapeia para `ServiceGroupSource` no SDK) |
| Diferença de WebPanel | EntityTypeId 86 vs. 43 — tipo distinto na KB |

## Criar via MCP

```json
gx_create(
  type: "api",
  name: "ApiExampleProducts",
  sections: {
    source: "Service 'GetProducts'\n  Verb: Get\n  Path: '/products'\n\n  &Products.FromJson(GetProducts())\n\n  RestAttribute: 'application/json'\nEndService"
  }
)
```

## Editar via MCP

```json
gx_modify(
  name:    "ApiExampleProducts",
  type:    86,
  section: "source",
  content: "Service 'GetProducts'\n  Verb: Get\n  Path: '/products'\n  ...\nEndService"
)
```

## Ler de volta

```json
gx_read(type: 86, name: "ApiExampleProducts", section: "source")
```

## Estrutura do source

| Elemento | Descrição |
|----------|-----------|
| `Service 'Nome'` | Define um endpoint (abre o bloco) |
| `Verb: Get / Post / Put / Delete` | Método HTTP |
| `Path: '/rota/{param}'` | Caminho relativo; `{param}` vira variável `&param` |
| `RestAttribute: 'application/json'` | Content-type da resposta |
| `EndService` | Fecha o bloco |

## Endpoints do exemplo

| Endpoint | Verbo | Path | Descrição |
|----------|-------|------|-----------|
| `GetProducts` | GET | `/products` | Lista todos os produtos |
| `GetProductById` | GET | `/products/{id}` | Busca produto por ID |

## Variáveis

Declare as variáveis no objeto (via IDE ou `gx_variable`) para que o build não rejeite tokens não resolvidos:

| Nome | Tipo | Direção |
|------|------|---------|
| `&Products` | SDT (coleção) | out |
| `&Product` | SDT ou Transaction | out |
| `&id` | Numeric(9) | in (via path) |

## Notas

- API objects não têm seção `events` — toda a lógica fica em `source` (ServiceGroupSource).
- O GeneXus gera um servlet REST separado para cada objeto API.
- Para autenticação/autorização, adicionar `Rules` com `IntegratedSecurityLevel` ou validação customizada no source.
- `gx_build` é stub — compilar sempre pelo IDE GX18 após criar/modificar.
