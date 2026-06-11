# GeneXus 18 User Controls — Complete Guide

This guide covers the full lifecycle of a User Control in GeneXus 18: architecture, screen template, properties, scripts, WebPanel integration, and debugging. Read it before creating or editing any UC.

---

## 1. The 5 Fundamental Laws

These rules are non-negotiable. Violating any of them produces bugs that are hard to trace.

### Law 1 — `<script>` in Screen Template NEVER executes

HTML5 ignores scripts injected via `innerHTML`. All JavaScript logic must go exclusively in `<Script When="AfterShow">` inside `<Definition>`.

```xml
<!-- ❌ WRONG: never works -->
<div>...</div>
<script>alert('this will never run');</script>

<!-- ✅ CORRECT -->
<Definition auto="false">
    <Script Name="Init" When="AfterShow">
        (function() { /* all logic here */ }).call(this);
    </Script>
</Definition>
<div>...</div>
```

### Law 2 — `AfterShow` re-executes on EVERY postback

Without a re-init guard, event listeners accumulate on each postback. A button click fires 2×, 3×, N× times.

```javascript
// ✅ CORRECT PATTERN — guard on the root element
var el = document.querySelector('[data-ucid="' + ucid + '"]');
if (!el) return;
if (el.getAttribute('data-uc-init') === '1') return;  // ← CRITICAL
el.setAttribute('data-uc-init', '1');
// only reaches here on first execution per instance
```

### Law 3 — `ucid` is mandatory

Without `ucid`, DOM IDs become `my-btn-` (no suffix). Two instances of the same UC on one page collide.

```xml
<Property Name="ucid" Type="string" Default="" />  <!-- always in Definition -->
```

In the WebPanel, always set `ucid` first:
```genexus
UCMyControl.ucid   = !'myUniqueId'   // FIRST
UCMyControl.Label  = &MyVariable
```

### Law 4 — Long text goes in content div, never in HTML attribute

Quotes, newlines, `<`, and `&` inside attributes break the HTML.

```xml
<!-- ❌ WRONG: long text in attribute -->
<div data-text="{{LongAnalysis}}">...</div>

<!-- ✅ CORRECT: content in invisible div -->
<div id="uc-data-{{ControlName}}" style="display:none">{{LongAnalysis}}</div>
```

Reading in JavaScript:
```javascript
var dataDiv = document.getElementById('uc-data-' + ucid);
var text = dataDiv ? dataDiv.textContent || dataDiv.innerText : '';
```

### Law 5 — Backslash in regex disappears in GeneXus

```javascript
// ❌ May work or not (depends on GX compiler version)
var re = /\n/g;

// ✅ Always safe
var re = new RegExp(String.fromCharCode(10), 'g');  // \n
var re = new RegExp(String.fromCharCode(9),  'g');  // \t
```

---

## 2. UC Anatomy

A User Control in GeneXus 18 consists of two parts in the IDE:

| Tab | Contents |
|-----|----------|
| **Screen Template** | HTML markup rendered in the browser |
| **Properties** | XML Definition: properties, events, AfterShow script |
| **Documentation** | Description of the UC for team reference |

The old `.control` + `.js` model (GeneXus 15 and earlier) is superseded. The new model stores everything inside the Knowledge Base as a native object.

| Aspect | Old Model | New Model |
|--------|-----------|-----------|
| Location | UserControls/ folder | Inside the KB |
| Installation | `Genexus.exe /install` | Drag from toolbox |
| HTML | Separate `.html` file | Screen Template tab |
| JS Logic | Separate `.js` (HTMLUserControl class) | Scripts in Properties tab |
| Identification | `{{ucid}}` in scripts | Use `this.ControlName` in Scripts |

---

## 3. Minimum Template

### Properties (Definition)

```xml
<Definition auto="false">
  <Property Name="ucid"   Type="string" Default="" />
  <Property Name="Label"  Type="string" Default="" />

  <Event Name="OnChange"/>

  <Script Name="AfterShow" When="AfterShow">
    (function () {
      var self = this;
      var ucid = this.ucid;

      var el = document.querySelector('[data-ucid="' + ucid + '"]');
      if (!el) return;
      if (el.getAttribute('data-uc-init') === '1') return;
      el.setAttribute('data-uc-init', '1');

      function esc(s) {
        return String(s == null ? '' : s)
          .replace(/&/g,'&amp;').replace(/</g,'&lt;')
          .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      var label = document.getElementById('uc-label-' + ucid);
      if (label) label.textContent = self.Label;

    }).call(this);
  </Script>
</Definition>
```

### Screen Template

```html
<style>
.my-uc { font-family: 'Noto Sans', sans-serif; }
.my-uc * { font-family: inherit; font-size: 14px; line-height: 140%; }
</style>

<div class="my-uc" data-ucid="{{ucid}}">
  <span id="uc-label-{{ControlName}}" class="my-uc__label">{{Label}}</span>
</div>
```

### How to use in a WebPanel

```genexus
Event Start
    UCMyControl1.ucid  = !'ctrl1'
    UCMyControl1.Label = "Hello World"
EndEvent

Event UCMyControl1.OnChange
    // handle event
EndEvent
```

---

## 4. Properties

### XML Syntax

```xml
<Definition auto="false">
  <Property Name="PropName"   Type="string"  Default="default-value" />
  <Property Name="NumericVal" Type="string"  Default="0" />
  <Property Name="IsActive"   Type="string"  Default="false" />
  <Event    Name="OnClick" />
  <Script   Name="AfterShow"  When="AfterShow">
    // initialization code
  </Script>
  <Script   Name="Open">
    // callable method (no parameters)
  </Script>
  <Script   Name="SetValue"   Parameters="pValue">
    // callable method with parameters
  </Script>
</Definition>
```

### Property Types

| GX Type | Use case | Notes |
|---------|----------|-------|
| `string` | Text, JSON, boolean flags | Most versatile — default choice |
| `string` (boolean) | True/false flags | Compare with `=== "true"` in JS |
| `string` (JSON) | Collections, complex data | `SDT.ToJson()` in GX, `JSON.parse()` in JS |
| `string` (numeric) | Monetary values, decimals | `Type="numeric"` truncates decimals — use string |

### Critical Rules

- `auto="false"` — always use; prevents GeneXus from inferring properties automatically.
- Never use `ucid` as a property if using `this.ControlName` (they serve the same purpose; `this.ControlName` is always unique).
- Numeric properties with decimals must use `Type="string"` — `Type="numeric"` truncates decimal places.
- `ControlName` is a GeneXus internal property — never create a property with that name.
- Limit: approximately 20 properties/scripts per UC — plan economically.

### Escape Rules

| Mustache | Behavior |
|----------|----------|
| `{{Prop}}` | HTML-escaped output (safe for attributes and text) |
| `{{{Prop}}}` | Raw/unescaped output (only for trusted HTML content) |

Use `{{Prop}}` by default. Use `{{{Prop}}}` only when you intentionally need HTML to render (e.g., injecting pre-built HTML from server).

---

## 5. Naming Conventions

### UC Object Names

```
Uc<Module><Name>
```

| Component | Convention | Examples |
|-----------|-----------|---------|
| UC file | `Uc<Module><Name>.view` | `UcNavSearch.view`, `UcModAButton.view` |
| Module | PascalCase, 2-4 chars | `Nav`, `ModA`, `Fin`, `Dashboard` |
| CSS prefix | 3-4 chars, kebab | `nav-`, `moda-`, `fin-`, `dash-` |
| DOM IDs | `prefix-part-{{ucid}}` | `nav-input-{{ucid}}` |
| `ucid` property | always lowercase | `ucid` — never `UcId` or `UCID` |

### Generic Module Examples

Define your own module prefixes to match your project's domain structure. Examples:

| Module | Prefix |
|--------|--------|
| Navigation | `nav-` |
| Module A | `moda-` |
| Module B | `modb-` |
| Dashboard | `dash-` |
| Common/Shared | `cmn-` |

Generic (reusable across modules) components use no prefix: `.button`, `.card`, `.badge`.

---

## 6. HTML Template Rules

### Golden Rule: Long Text in Content Div

Never put variable-length text in HTML attributes. Always use a content div.

```html
<!-- ❌ WRONG — breaks with quotes, newlines, < > & -->
<div data-analysis="{{AnalysisText}}">...</div>

<!-- ✅ CORRECT — invisible div holds the content -->
<div id="uc-data-{{ControlName}}" style="display:none">{{AnalysisText}}</div>
```

### IDs Always Include `-{{ControlName}}`

```html
<!-- ❌ WRONG — collides when two instances on same page -->
<div id="my-panel">

<!-- ✅ CORRECT -->
<div id="my-panel-{{ControlName}}">
```

Note: `{{ControlName}}` works in HTML attributes. In `<script>` tags inside Screen Template, use `this.ControlName` instead — mustache is not interpolated inside script blocks.

---

## 7. CSS in UCs

All CSS belongs in a `<style>` block in the Screen Template — never inline in JavaScript.

```html
<style>
/* Unique 3-4 char prefix prevents conflicts with global GeneXus CSS */
.nav-search { box-sizing: border-box; }
.nav-search * { box-sizing: border-box; }
.nav-search__input { }
.nav-search__input--focused { }
.nav-search__results { }
.nav-search__results--open { }
</style>
```

### Box Sizing

Always add `box-sizing: border-box` to your root element and all descendants. GeneXus default table layout fights with content-box.

### Keyframe Naming

Prefix keyframe names to avoid conflicts:

```css
/* ❌ WRONG — generic name may conflict with other UCs */
@keyframes spin { }

/* ✅ CORRECT — prefixed with UC CSS prefix */
@keyframes nav-spin { }
```

### Scrollbar in UC iframe context

GeneXus may run UCs inside iframes where `::-webkit-scrollbar` in the Screen Template `<style>` does not apply. Workaround via JavaScript:

```javascript
var listEl = document.getElementById('nav-list-' + ucid);
var uniqueCls = 'nav-list-' + ucid.replace(/-/g, '');
listEl.classList.add(uniqueCls);
var style = document.createElement('style');
style.textContent =
    '.' + uniqueCls + '::-webkit-scrollbar { width: 6px; }' +
    '.' + uniqueCls + '::-webkit-scrollbar-thumb { background: #B3B3B3; border-radius: 8px; }';
listEl.ownerDocument.head.appendChild(style);
```

---

## 8. JavaScript Patterns

### Script Tag `When` Values

```xml
<Script Name="AfterShow"    When="AfterShow">   <!-- runs after element renders -->
<Script Name="Open">                             <!-- callable method, no auto-run -->
<Script Name="SetValue"     Parameters="p1">    <!-- callable method with params -->
```

### IIFE + Guard (Mandatory Pattern)

```javascript
(function () {
    /* ── setup ─────────────────────────────────── */
    var self = this;
    var ucid = this.ucid;

    var el = document.querySelector('[data-ucid="' + ucid + '"]');
    if (!el) return;
    if (el.getAttribute('data-uc-init') === '1') return;
    el.setAttribute('data-uc-init', '1');

    /* ── utilities ──────────────────────────────── */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function decodeHtml(s) {
        var d = document.createElement('div');
        d.innerHTML = s;
        return d.textContent || d.innerText || '';
    }

    /* ── parse data ─────────────────────────────── */
    var items = [];
    try {
        var raw = (self.Items || '').trim();
        if (raw) items = JSON.parse(raw);
    } catch (e) { items = []; }

    /* ── main logic ─────────────────────────────── */

    /* ── fire GeneXus event ─────────────────────── */
    function fireSelect(id) {
        if (self && typeof self.OnSelect === 'function') {
            self.OnSelect();
        }
    }

    /* ── close on outside click ─────────────────── */
    document.addEventListener('click', function (e) {
        if (!el.contains(e.target)) close();
    });

}).call(this);
```

### ES5 Rules (Mandatory)

GeneXus 18 JavaScript context requires ES5:

```javascript
// ✅ ES5 correct
var name = 'value';
var fn = function(a, b) { return a + b; };

// ❌ Prohibited in GeneXus
let x = 1;
const Y = 2;
var fn = (a) => a * 2;              // arrow function
var s = `template ${variable}`;     // template literal
var { a, b } = obj;                 // destructuring
class MyClass { }                   // class syntax
```

### Reading Data from Properties

```javascript
// Simple string property
var label = self.Label || '';

// JSON collection
var items = [];
try {
    var raw = (self.Items || '').trim();
    if (raw) items = JSON.parse(raw);
} catch (e) { items = []; }

// GeneXus injects HTML entities — decode if needed
function decode(s) {
    return (s || '[]')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
var items = JSON.parse(decode(self.CollectionData || '[]'));
```

### Numeric Values with Decimals

```genexus
// In WebPanel — use Str() to preserve decimals
UCMyControl.Value = Str(&MyNumeric, 20, 2)
```

```javascript
// In UC — parse robustly
function parseGxNumber(v) {
    if (!v) return 0;
    // Handle both Brazilian (1.234,56) and English (1,234.56) formats
    var s = v.toString();
    if (s.indexOf(',') > s.indexOf('.')) {
        // Brazilian: remove dots, replace comma
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        // English: remove commas
        s = s.replace(/,/g, '');
    }
    return parseFloat(s) || 0;
}
```

### escapeHtml

```javascript
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
```

### Regex Without Backslash

```javascript
// Backslash in regex literals may be stripped by GeneXus compiler
var newline  = String.fromCharCode(10);  // \n
var tab      = String.fromCharCode(9);   // \t
var asterisk = String.fromCharCode(42);  // *

var reNewline = new RegExp(String.fromCharCode(10), 'g');
text = text.replace(reNewline, '<br>');
```

### MutationObserver for AJAX Refresh

GeneXus Refresh re-injects HTML but does not re-execute scripts. Use MutationObserver to react to data changes:

```javascript
// Watch data div for changes (property updates)
var dataEl = document.getElementById('uc-data-' + ucid);
if (dataEl) {
    new MutationObserver(function() {
        // re-run initialization or rendering
        render();
    }).observe(dataEl, {
        attributes: true, childList: true, characterData: true
    });
}

// Watch parent container for re-injection
var parent = el.parentNode;
if (parent) {
    new MutationObserver(function() {
        render();
    }).observe(parent, { childList: true });
}
```

### GX Context API

GeneXus 18 provides `window.gx` in the page context. Available APIs (verify against your GX version):

```javascript
// Safe access pattern
if (window.gx && gx.dom) {
    gx.dom.addClass(el, 'my-class');
    gx.dom.removeClass(el, 'my-class');
    gx.dom.hasClass(el, 'my-class');
}

if (window.gx && gx.evt) {
    gx.evt.attach(el, 'click', handler);
    gx.evt.stopPropagation(e);
    gx.evt.source(e);  // returns event target
}

if (window.gx && gx.dom && gx.dom.setInnerHtml) {
    gx.dom.setInnerHtml(panel, html);
}
```

---

## 9. Custom Events (UC → WebPanel)

Three patterns for firing events from UC JavaScript to GeneXus WebPanel.

### Option A: Direct event call (recommended)

```javascript
// In UC AfterShow script
function fireEvent(id) {
    if (self && typeof self.OnSelect === 'function') {
        self.OnSelect();
    }
}
```

```genexus
// In WebPanel
Event UCMyControl1.OnSelect
    // handle selection
EndEvent
```

### Option B: Event parameter via vEVENTPARAM

```javascript
// In UC — set parameter then fire
function fireSelect(id) {
    var ep = document.querySelector('input[name="vEVENTPARAM"]');
    if (ep) ep.value = id;
    if (self && typeof self.OnSelect === 'function') self.OnSelect();
}
```

```genexus
Event UCMyControl1.OnSelect
    &SelectedId = &EventParam  // &EventParam receives vEVENTPARAM value
EndEvent
```

### Option C: Pub/Sub via gx.fx.obs (JS → GeneXus)

```javascript
// In UC JavaScript
if (window.gx && gx.fx && gx.fx.obs) {
    gx.fx.obs.notify('MyEvent.action', 'parameter-value');
}
```

```genexus
// In WebPanel — subscribe to the event
Event 'MyEvent.action'
    // &EventParam has the parameter value
    Do 'HandleAction'
EndEvent
```

---

## 10. WBP ↔ UC Communication

### Flow

```
WebPanel (GeneXus code)
    │
    │  1. Set properties: UCMyCtrl.Label = &Val
    │  2. Refresh → GeneXus injects HTML
    │  3. AfterShow executes in browser
    ▼
User Control (JavaScript)
    │
    │  4. Read properties: self.Label
    │  5. Render HTML
    │  6. User interaction → fire event
    ▼
WebPanel (GeneXus code)
    │  7. Event UCMyCtrl.OnSelect fires
    │  8. &EventParam has the value
    ▼
```

### Setting Properties from WebPanel

```genexus
Sub 'BuildMyControl'
    // 1. ucid ALWAYS first
    UCMyControl1.ucid  = !'ctrl-unique-id'

    // 2. simple properties
    UCMyControl1.Label = &MyVariable
    UCMyControl1.IsActive = Iif(&Flag = 1, !'true', !'false')

    // 3. collections — NEVER manual concatenation
    &JsonItems = &MySDT.ToJson()
    UCMyControl1.Items = &JsonItems
EndSub
```

### Calling UC Methods from WebPanel

```xml
<!-- Define method in UC Properties -->
<Script Name="Open">
    var ucid = this.ControlName;
    document.getElementById('panel-' + ucid).style.display = 'block';
</Script>

<Script Name="SetValue" Parameters="pValue">
    this.Value = pValue;
</Script>
```

```genexus
// Call in WebPanel
UCMyControl1.Open()
UCMyControl1.SetValue(&MyVar)
```

### Multiple Instances on the Same Page

Each instance needs a unique `ucid`. All DOM IDs must include it:

```html
<!-- Screen Template -->
<div id="my-panel-{{ControlName}}" data-ucid="{{ucid}}">
```

The `{{ControlName}}` mustache always resolves to the unique control name GeneXus assigns. Use it for DOM IDs. Use `{{ucid}}` for your custom data-attribute.

### Passing JSON Collections

```genexus
// ✅ CORRECT
For Each MyTable
    &SdtItem.Id    = MyTable.Id
    &SdtItem.Label = MyTable.Name
    &SdtCollection.Add(&SdtItem)
EndFor
UCMyControl1.Items = &SdtCollection.ToJson()

// ❌ WRONG — breaks with special characters
UCMyControl1.Items = !'[{"id":"' + &Id + '"}]'
```

---

## 11. Debugging Guide

### Pre-Checks (before opening DevTools)

- [ ] `ucid` is set as the FIRST property in the WebPanel Sub
- [ ] Properties XML has `auto="false"`
- [ ] All JavaScript is in `<Script When="AfterShow">` — not in `<script>` in Screen Template
- [ ] Guard uses `=== '1'` (not `!getAttribute(...)`)
- [ ] GeneXus cache cleared: Build All + browser Ctrl+Shift+R

### Step-by-Step Debugging

1. Open browser DevTools → select the correct iframe context (GeneXus UCs run in iframes)
2. In Console, type: `document.querySelector('[data-ucid="yourUcid"]')`
3. Check if the element exists and the `data-uc-init` attribute is set
4. Verify property values arrived: `document.querySelector('[data-ucid="yourUcid"]').getAttribute('data-prop1')`
5. If using a data div: check `document.getElementById('uc-data-yourControlName').textContent`

### Common JS Errors Table

| Error | Cause | Fix |
|-------|-------|-----|
| `{{ControlName}}` empty in script | Mustache doesn't work inside `<script>` | Use `this.ControlName` in Scripts |
| Event fires N times | Guard uses `!getAttribute` (inverted) | Use `=== '1'` comparison |
| JSON parse error: `&quot;` | GeneXus HTML-escapes property values | Use `decode()` function before `JSON.parse` |
| Numeric value truncated | `Type="numeric"` truncates decimals | Use `Type="string"` + `Str()` in GX |
| UC not re-rendering after Refresh | AfterShow doesn't re-execute after AJAX | Use MutationObserver |
| Two UCs interfering | DOM IDs without `ucid` suffix collide | Include `{{ControlName}}` in all IDs |
| `Uncaught SyntaxError: token '<'` | SVG/HTML literal inside JS string | Move SVG to HTML only |
| `Wrong number of parameters` | GeneXus old model limitation | Use `Parameters="p1, p2"` in `<Script>` |

### Quick Console Checks

```javascript
// Verify property arrived
var el = document.querySelector('[data-ucid="myUcId"]');
console.log('label:', el ? el.querySelector('.my-label').textContent : 'not found');

// Verify data div content
var dataDiv = document.getElementById('uc-data-MyControlName');
console.log('data:', dataDiv ? dataDiv.textContent.substring(0, 200) : 'not found');
```

---

## 12. Pitfalls Reference Table

| # | Problem | Solution |
|---|---------|----------|
| 1 | `ucid` → IDs hang empty `btn-` | Set ucid FIRST in WebPanel Sub |
| 2 | Long text in HTML attribute breaks with quotes/newlines | Invisible div: `<div style="display:none">{{Text}}</div>` |
| 3 | Backslash in regex stripped by GeneXus | `new RegExp(String.fromCharCode(10), 'g')` |
| 4 | UC in Grid → listeners multiply per row | Guard `getAttribute('data-uc-init') === '1'` |
| 5 | Guard `!getAttribute(...)` is INVERTED | Always `=== "1"` (not `!getAttribute(...)`) |
| 6 | UC doesn't update on filter change | MutationObserver on parent, or re-set properties |
| 7 | `innerHTML` without escape → XSS/broken HTML | `esc(s)` before any `innerHTML` |
| 8 | `textContent` shows literal `&amp;` | `decodeHtml(s)` via temp div |
| 9 | Old JS cached in browser | Build All + Ctrl+Shift+R |
| 10 | CSS classes conflict between UCs | Unique 3-4 char prefix on all classes |
| 11 | Number `1.234,56` fails `parseFloat` | `.Replace(',','.')` in GeneXus before passing |
| 12 | `let`/`const`/arrow → GeneXus error | `var` and `function()` mandatory |
| 13 | `<script>` in Screen Template doesn't execute | Move to `<Script When="AfterShow">` |
| 14 | `{{Prop}}` escapes HTML; `{{{Prop}}}` doesn't | Use `{{}}` for user data; `{{{}}}` only for trusted HTML |
| 15 | Manual JSON concatenation breaks on special chars | `SDT.ToJson()` always |
| 16 | Two UCs on same page interfere | Isolate with `window["ucInit_" + ucid]` pattern |
| 17 | Numeric value silently truncated | `Type="string"` + `Str(&Val, 20, 2)` in GeneXus |

---

## 13. Complete Example

A minimal analysis display UC — sanitized for generic use.

### Properties

```xml
<Definition auto="false">
  <Property Name="ucid"    Type="string" Default="" />
  <Property Name="Title"   Type="string" Default="" />
  <Property Name="Content" Type="string" Default="" />
  <Property Name="Status"  Type="string" Default="info" />

  <Event Name="OnDismiss"/>

  <Script Name="AfterShow" When="AfterShow">
    (function () {
      var self = this;
      var ucid = this.ucid;

      var el = document.querySelector('[data-ucid="' + ucid + '"]');
      if (!el) return;
      if (el.getAttribute('data-uc-init') === '1') return;
      el.setAttribute('data-uc-init', '1');

      function esc(s) {
        return String(s == null ? '' : s)
          .replace(/&/g,'&amp;').replace(/</g,'&lt;')
          .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      // Read long content from invisible div (Law 4)
      var contentDiv = document.getElementById('uc-content-' + ucid);
      var contentText = contentDiv ? (contentDiv.textContent || contentDiv.innerText) : '';

      var titleEl   = el.querySelector('.analysis__title');
      var bodyEl    = el.querySelector('.analysis__body');
      var dismissEl = el.querySelector('[data-part="dismiss"]');

      if (titleEl)   titleEl.textContent = self.Title;
      if (bodyEl)    bodyEl.textContent  = contentText;

      // Apply status modifier
      var status = self.Status || 'info';
      el.querySelector('.analysis__card').className = 'analysis__card analysis__card--' + status;

      if (dismissEl) {
        dismissEl.addEventListener('click', function() {
          el.style.display = 'none';
          if (typeof self.OnDismiss === 'function') self.OnDismiss();
        });
      }

      // MutationObserver for AJAX refresh
      if (contentDiv) {
        new MutationObserver(function() {
          window['ucInit_' + ucid] && window['ucInit_' + ucid]();
        }).observe(contentDiv, { childList: true, characterData: true });
      }

    }).call(this);
  </Script>
</Definition>
```

### Screen Template

```html
<style>
.analysis { }
.analysis__card {
    background: var(--bg-container-base, #fff);
    border: 1px solid var(--border-primary, #e0e0e0);
    border-radius: 8px;
    padding: 16px;
}
.analysis__card--info    { border-left: 4px solid #0066ff; }
.analysis__card--success { border-left: 4px solid #00aa44; }
.analysis__card--warning { border-left: 4px solid #ff9900; }
.analysis__card--error   { border-left: 4px solid #cc0000; }
.analysis__title  { font-weight: 700; margin-bottom: 8px; }
.analysis__body   { white-space: pre-wrap; }
.analysis__dismiss { cursor: pointer; float: right; }
</style>

<div class="analysis" data-ucid="{{ucid}}">
  <div class="analysis__card">
    <span class="analysis__dismiss" data-part="dismiss">×</span>
    <div class="analysis__title"></div>
    <div class="analysis__body"></div>
  </div>
</div>

<!-- Long content stored in div, not in attribute (Law 4) -->
<div id="uc-content-{{ControlName}}" style="display:none">{{Content}}</div>
```
