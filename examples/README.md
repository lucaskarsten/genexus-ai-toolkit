# Examples — GeneXus 18 Object Templates

Working examples for each GeneXus object type supported by gx18-mcp. Every folder contains a source file in the format the MCP tools consume, plus a README with the exact `gx_create`/`gx_modify` calls and known pitfalls.

## User Controls (UC)

| Example | Description |
|---|---|
| [UcDropdownMenu](user-controls/UcDropdownMenu/) | Button with collapsible JSON-driven dropdown panel |
| [UcNavSearch](user-controls/UcNavSearch/) | Navigation search component |
| [UcToastNotification](user-controls/UcToastNotification/) | Toast notification display |
| [UcUserMenu](user-controls/UcUserMenu/) | User menu with dropdown |

Template: [`templates/uc.template.md`](templates/uc.template.md)

## Procedures (PRC)

| Example | Description |
|---|---|
| [PrcExampleHelloWorld](procedures/PrcExampleHelloWorld/) | Minimal procedure with `Parm(in/out)`, rules and source — base template for `gx_create` |

## Web Components (WBC)

| Example | Description |
|---|---|
| [WbcExampleCard](web-components/WbcExampleCard/) | Minimal web component skeleton with Start/Refresh events and GxMultiForm layout |

## Web Panels (WBP)

| Example | Description |
|---|---|
| [WbpSearchWithNavSearch](web-panels/WbpSearchWithNavSearch/) | WebPanel integrating the NavSearch user control |

## API Objects

| Example | Description |
|---|---|
| [ApiExampleProducts](api-objects/ApiExampleProducts/) | REST API with GET endpoints — ServiceGroupSource format, EntityTypeId 86 |

## SDTs

| Example | Description |
|---|---|
| [SdtExamplePerson](sdts/SdtExamplePerson/) | SDT with 4 members (numeric, varchar ×2, boolean) — structure JSON format for `gx_create` |

## Data Selectors

| Example | Description |
|---|---|
| [DsExampleActiveClients](data-selectors/DsExampleActiveClients/) | Filter for active clients — name-only via MCP; logic edited via IDE or XPZ |

## Transactions (TRN)

| Example | Description |
|---|---|
| [TrnExampleProduct](transactions/TrnExampleProduct/) | Transaction with 5 attributes and primary key — structure JSON format, known pitfalls |

## Design System Objects (DSO)

See [`design-system/`](design-system/) for token and CSS examples.

Template: [`templates/dso.template.md`](templates/dso.template.md)

---

## Quick reference: MCP tool per object type

| Type | Create | Modify | Read back |
|---|---|---|---|
| procedure | `gx_create(type:"procedure", ...)` | `gx_modify(type:34, section:"source")` | `gx_read(type:34, section:"source")` |
| webpanel | `gx_create(type:"webpanel", ...)` | `gx_modify(type:43, section:"events")` | `gx_read(type:43, section:"events")` |
| webcomponent | `gx_create(type:"webcomponent", ...)` | `gx_modify(type:43, section:"events")` | `gx_read(type:43, section:"events")` |
| api | `gx_create(type:"api", ...)` | `gx_modify(type:86, section:"source")` | `gx_read(type:86, section:"source")` |
| usercontrol | `gx_create(type:"usercontrol", ...)` | `gx_modify(type:147, section:"template")` | AfterShow → `gx_export` + read .xpz |
| dso | `gx_create(type:"dso", ...)` | `gx_modify(type:161, section:"styles")` | `gx_read(type:161, section:"styles")` |
| sdt | `gx_create(type:"sdt", ...)` | — | `gx_structure(type:36, name:...)` |
| dataselector | `gx_create(type:"dataselector", name:...)` | — via IDE | `gx_read(type:88, ...)` |
| transaction | `gx_create(type:"transaction", ...)` | `gx_modify(type:39, section:"rules")` | `gx_structure(type:39, name:...)` |
