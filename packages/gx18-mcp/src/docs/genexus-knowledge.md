# GeneXus 18 Platform Knowledge

Reference guide for LLMs working with GeneXus 18 Knowledge Bases via gx18-mcp.
Covers the object model, event lifecycle, syntax patterns, UserControl patterns, DSO, and
variables — the platform context needed to read, create, and modify GeneXus objects correctly.

> For canonical GeneXus syntax and modeling patterns, also consult the **nexa skill**
> at `skills/nexa/nexa/SKILL.md` (register with `claude --add-dir skills/nexa/nexa`).

---

## Object Model

### Core object types

| Type | EntityTypeId | Role |
|------|-------------|------|
| Procedure | 34 | Server-side logic; compiles to Java class |
| WebPanel | 43 | Web page with events, grid, UI controls |
| WebComponent | 43 | Reusable UI component (embedded in panels) |
| UserControl | 147 | Custom HTML/JS/CSS control injected into panels |
| Transaction | 39 | Data entry form + table definition |
| SDT | 36 | Structured data type (like a struct/DTO) |
| DSO | 161 | Design System Object — CSS/token overrides |
| API | 86 | REST API object |
| DataSelector | 88 | Reusable data filter |

### Object identity

Each object has:
- **EntityId** — numeric ID unique within its EntityTypeId
- **EntityVersionId** — numeric ID of the current version (increments on every save)
- **EntityVersionName** — the object's name (string)
- **UserId** — the KB user who last saved (must match Windows identity — see gx_whoami)

### Team Development & UserId

GeneXus uses Windows identity to stamp authorship on every save. Wrong UserId permanently
corrupts Team Development history. The gx18-mcp SDK worker runs as the current Windows user
and verifies UserId after every write. Never write via tools that don't perform this check.

---

## GeneXus 18 Code Syntax

### Procedure source

```genexus
// Variables: declared in Variables tab; referenced as &VarName
// Attributes: referenced directly by name (no prefix)
// Rules: in Rules section (separate from source)

Parm(in:&InputSdt, out:&OutputSdt);   // in Rules section

// Source section:
For each Client
  Where ClientActive = True
  &ClientItem = new()
  &ClientItem.ClientId   = ClientId
  &ClientItem.ClientName = ClientName
  &OutputSdt.Items.Add(&ClientItem)
EndFor
```

### Rules (Procedure)

```genexus
Parm(in:&pParam1, in:&pParam2, out:&pResult);
Error('Message') if &pParam1 = 0;
```

### Events (WebPanel / WebComponent)

```genexus
Event Start
  // Runs on first load (GET). Initialize variables, load data.
  &ClientId = &HttpRequest.GetVariable('ClientId')
EndEvent

Event Refresh
  // Runs on every postback (POST). Re-query grids.
  For each Client ...
  EndFor
EndEvent

Event Load
  // Runs once per grid row. Populate grid attributes.
  &GridClientId   = ClientId
  &GridClientName = ClientName
EndEvent

Event 'ClickButton'
  // Custom event triggered by a button or UC
  Composite
    Call(PrcDoAction, &Parm)
    Refresh
  EndComposite
EndEvent

Event OnMessage(&NotificationInfo)
  // Receives async WebNotification from a Submit procedure
  If &NotificationInfo.Id = &MyGuid
    &MySdt.FromJson(&NotificationInfo.Message)
    Refresh
  EndIf
EndEvent
```

### Submit (async background procedure)

A Procedure called with `.Submit` runs in a background thread. Use it to avoid blocking the UI
for slow operations (queries, external calls). The result is pushed back via WebNotification.

**Caller (WebComponent):**
```genexus
Event Start
  If &HttpRequest.Method = 'GET'
    &Guid = GUID.NewGuid().ToString()
  EndIf
EndEvent

Event Refresh
  If &HttpRequest.Method <> 'GET'
    PrcMyQuery.Submit(!"", &Guid, &SdtContext, &SdtParm)
  EndIf
EndEvent

Event OnMessage(&NotificationInfo)
  If &NotificationInfo.Id = &Guid
    &MySdt.FromJson(&NotificationInfo.Message)
    Refresh
  EndIf
EndEvent
```

**Submit Procedure:**
```genexus
// Parm(in:&pCallerInfo, in:&pGuid, in:&pContext, in:&pParm);
PrcNucSetContext(&pContext)   // restore session context

// ... do slow query ...

&NotificationInfo.Id      = &pGuid
&NotificationInfo.Object  = !'WbcMyComponent'
&NotificationInfo.Message = &MySdt.ToJson()
&WebNotification.NotifyClient(&WebNotification.ClientId, &NotificationInfo)
```

**Variable types:**
- `&NotificationInfo` → GeneXus.Common.Server.NotificationInfo (SDT)
- `&WebNotification`  → GeneXus.Common.Server.Socket (external object)

---

## UserControl Patterns

UserControls are custom HTML/CSS/JS controls embedded in panels. They have:
- **Template section** (`gx_read type=147 section=template`): HTML + `<PROPERTIES>` XML
- **Properties section** (`gx_read type=147 section=properties`): property type definitions
- **AfterShow script** (only in `.xpz`): initialization JS, runs after each render
- **Method scripts** (only in `.xpz`): named JS methods called by panel events

### AfterShow — the safe initialization pattern

```javascript
(function() {
  'use strict';

  // Init guard — prevents double-initialization in re-render cycles
  var $ctrl = jQuery('#' + ContainerName);
  if ($ctrl.data('uc-init')) return;
  $ctrl.data('uc-init', true);

  // Access UC properties (set in the panel's property grid)
  var myProp = Properties.MyPropertyName;

  // DOM manipulation — use ContainerName to scope queries
  $ctrl.find('.my-element').text(myProp);

  // Subscribe to GeneXus pub/sub events
  gx.fx.obs.attach('gx.grid.onAfterRender', function(ctx) {
    if (ctx.gridId && ctx.gridId.indexOf(ContainerName) >= 0) {
      // re-initialize after grid re-render
    }
  });
})();
```

### MutationObserver pattern (lazy initialization)

```javascript
(function() {
  'use strict';
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.nodeType === 1 && !node.dataset.ucInit) {
          node.dataset.ucInit = 'true';
          initMyControl(node);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Also initialize any already-present nodes:
  document.querySelectorAll('.my-control:not([data-uc-init])').forEach(initMyControl);
})();
```

### jQuery performance rules

- **Never use `:hidden` or `:visible`** — they force a full reflow per element (`getClientRects`)
- Use `querySelectorAll` scoped to ContainerName instead of global jQuery selectors
- Register global observers (gx.fx.obs, MutationObserver) **once** — use a window flag guard:
  ```javascript
  if (!window.__myUcObserverBound) {
    window.__myUcObserverBound = true;
    gx.fx.obs.attach('gx.grid.onAfterRender', handler);
  }
  ```

### UC Property types (in `<PROPERTIES>` XML)

```xml
<Properties>
  <Property>
    <Id>MyLabel</Id>
    <Type>text</Type>
    <Default>Default text</Default>
    <Description>Label shown above the control</Description>
  </Property>
  <Property>
    <Id>IsVisible</Id>
    <Type>checkbox</Type>
    <Default>true</Default>
  </Property>
  <Property>
    <Id>Mode</Id>
    <Type>combobox</Type>
    <Values>Option1;Option2;Option3</Values>
    <Default>Option1</Default>
  </Property>
</Properties>
```

Access in AfterShow: `Properties.MyLabel`, `Properties.IsVisible`, `Properties.Mode`.

---

## DSO — Design System Object

DSOs override theme CSS. They have three sections: `tokens`, `styles`, `elements`.

### Writing DSO styles via gx_modify

```
gx_modify name=DsoMyTheme type=161 section=styles content="
@import DsoBase;

.my-component {
  color: var(--color-primary);
  font-size: var(--font-size-body);
}

.my-component--active {
  background: var(--color-primary-light);
}
"
```

**Critical:** use the friendly `@import DsoBase;` form, NOT `@import @<guid>@` (the GUID form
that appears in raw blob decodes). The GUID form causes `ValidationException` on save.

### Class naming (BEM convention)

```css
/* Block */
.dashboard {}

/* Element */
.dashboard__header {}
.dashboard__card {}

/* Modifier */
.dashboard__card--active {}
.dashboard__card--loading {}

/* Desktop variant (theme prefix) */
.desktop__heading--1 {}
.desktop__body--large {}
```

---

## Special Variables

| Variable | Type | Description |
|----------|------|-------------|
| `&HttpRequest` | HttpRequest | Current HTTP request (Method, GetVariable, etc.) |
| `&HttpResponse` | HttpResponse | HTTP response (headers, status) |
| `&WebNotification` | GeneXus.Common.Server.Socket | Send async notifications to browser |
| `&NotificationInfo` | GeneXus.Common.Server.NotificationInfo | Notification payload (Id, Object, Message) |
| `&Session` | Session | Server-side session (Get, Set) |

---

## Modules & Object Organization

Modules are hierarchical namespaces. Use `gx_modules` to list them.

Example: common modules in a FoccoLojas-type KB (run `gx_modules` to list yours):

| Module | EntityId | Contains |
|--------|---------|---------|
| Root | 1 | Top-level objects |
| NUC | 116 | Core/nucleus objects |
| VEN | 106 | Sales module |
| VEN_Dashboards | 201 | Dashboard panels and components |
| UserControls | 185 | All UserControl objects |
| DesignSystem | 238 | DSO objects |

Move an object: `gx_move name=X type=N targetModule=NUC confirm=true`

---

## KB SQL — Key Tables

```sql
-- Find object by name
SELECT ev.EntityTypeId, ev.EntityId, ev.EntityVersionId, ev.EntityVersionName
FROM EntityVersion ev
WHERE ev.EntityVersionName LIKE '%MyObject%'
ORDER BY ev.EntityTypeId, ev.EntityVersionName;

-- Object revision history
SELECT ev.EntityVersionId, ev.EntityVersionDescription,
       u.EntityVersionName AS Author, ev.LastUpdate
FROM EntityVersion ev
JOIN EntityVersion u ON u.EntityTypeId = 7 AND u.EntityId = ev.UserId
WHERE ev.EntityTypeId = 34 AND ev.EntityVersionName = 'PrcMyProc'
ORDER BY ev.LastUpdate DESC;

-- Module membership
SELECT mev.ModelParentEntityId AS ModuleId,
       parent.EntityVersionName AS ModuleName
FROM ModelEntityVersion mev
JOIN EntityVersion parent ON parent.EntityTypeId = 100 AND parent.EntityId = mev.ModelParentEntityId
WHERE mev.EntityTypeId = 147 AND mev.EntityId = 57;  -- EntityId 57 = a UserControl
```

**UserId mapping:** EntityTypeId 7 = KBUser. `EntityVersionName` = Windows identity string.
Wrong UserId on writes = corrupted Team Development history.

---

## Build & Deploy Notes

- **Write via gx18-mcp → IDE build** — gx_modify and gx_import update KB source but do not compile
- **IDE Build All (F5)** regenerates Java, JavaScript, CSS from the KB
- **Tomcat static/** at `C:\tomcat\webapps\FoccoLojasJava\static` — UC render.js and DSO CSS deployed here
- **render.js** is auto-generated from UC template; edits here are overwritten on next build
- After any gx_sql write to KB metadata, call **gx_reload** to clear the SDK worker's model cache
