# WbcExampleCard

Web Component esqueleto para uso como card reutilizável em dashboards e painéis. Demonstra o ciclo de vida mínimo (`Start` / `Refresh`) e o formato de layout `GxMultiForm`.

## WebPanel vs. WebComponent

| Aspecto | WebPanel | WebComponent |
|---------|----------|--------------|
| EntityTypeId | 43 | 43 (mesmo tipo) |
| Flag SDK | `IsWebComponent = false` | `IsWebComponent = true` |
| Uso | Página standalone | Embutido em outro WBP/WBC via `Component` |
| Chamada async | `Submit` direto | `Comp.Submit(!"", ...)` no host |

A diferença é apenas a flag — o objeto é o mesmo tipo (43) na KB.

## Criar via MCP

```json
gx_create(
  type: "webcomponent",
  name: "WbcExampleCard",
  sections: {
    events: "Event Start\n    &Titulo = 'Card de Exemplo'\n    &Descricao = 'Componente reutilizável'\nEndEvent\n\nEvent Refresh\n    //\nEndEvent"
  }
)
```

Para um WebPanel comum (não componente):

```json
gx_create(type: "webpanel", name: "WbpExamplePage", sections: { events: "..." })
```

## Editar eventos via MCP

```json
gx_modify(
  name:    "WbcExampleCard",
  type:    43,
  section: "events",
  content: "Event Start\n    &Titulo = 'Novo Título'\nEndEvent"
)
```

## Editar layout via MCP

O layout é um `GxMultiForm` (blob decodificado via `gx_read`). Para modificar:

1. Ler o layout atual:

```json
gx_read(type: 43, name: "WbcExampleCard", section: "layout")
```

2. Editar o XML do `<GxMultiForm>` (classes de controles usam nomes amigáveis como `"desktop__heading--2"`).

3. Reescrever:

```json
gx_modify(
  name:    "WbcExampleCard",
  type:    43,
  section: "layout",
  content: "<GxMultiForm>...</GxMultiForm>"
)
```

> **Pitfall:** classes de controle no blob são ref-IDs de tema (`<themeGuid>-NNN`), mas o setter do SDK aceita o **nome amigável** (ex.: `class="desktop__heading--3"`) e resolve no save. Sempre usar o nome amigável ao gravar.

## Variáveis

| Nome | Tipo sugerido | Descrição |
|------|--------------|-----------|
| `&Titulo` | Character(100) | Título exibido no card |
| `&Descricao` | Character(255) | Texto descritivo |

## Padrão de carga assíncrona

Para não bloquear o refresh do host, use o padrão Submit/OnMessage:

```genexus
// No WbcExampleCard:
Event Start
    If &HttpRequest.Method = 'GET'
        &Guid = GUID.NewGuid().ToString()
    EndIf
EndEvent

Event Refresh
    If &HttpRequest.Method <> 'GET'
        SectionLoading.Show()
        PrcExampleCardSubmit.Submit(!"", &Guid, &SdtNucContext)
    EndIf
EndEvent

Event OnMessage(&NotificationInfo)
    If &NotificationInfo.Id = &Guid
        &SdtDados.FromJson(&NotificationInfo.Message)
        SectionLoading.Hide()
    EndIf
EndEvent
```

Consulte `examples/web-panels/WbpSearchWithNavSearch/` para o padrão completo de integração com UC.
