# GeneXus 18 Runtime JavaScript API Reference

The GeneXus runtime injects `window.gx` into all application pages. Inside UC `AfterShow` scripts, `window.gx` is available with the APIs documented here.

> **Important**: These are internal GeneXus runtime APIs. Behavior may vary between GeneXus versions. Verify against your specific GeneXus version and compiler target (Java/Tomcat, .NET, etc.). Always use safe access patterns: `if (window.gx && gx.dom) { ... }`.

---

## Safe Access Pattern

Always guard against missing APIs:

```javascript
// ✅ Safe — works even if API is unavailable
function safeAddClass(el, cls) {
    if (window.gx && gx.dom && gx.dom.addClass) {
        gx.dom.addClass(el, cls);
    } else {
        el.classList.add(cls);  // fallback to native
    }
}
```

---

## `gx.dom` — DOM Utilities

DOM manipulation helpers available in the GeneXus runtime context.

```javascript
// Class manipulation
gx.dom.addClass(element, 'my-class');
gx.dom.removeClass(element, 'my-class');
gx.dom.hasClass(element, 'my-class');   // returns boolean
gx.dom.toggleClass(element, 'my-class');

// Safe innerHTML injection (uses GeneXus sanitization)
gx.dom.setInnerHtml(element, '<span>content</span>');

// HTML escaping
var safe = gx.dom.encode('string with <special> &chars');
// → 'string with &lt;special&gt; &amp;chars'
```

### Usage Example

```javascript
(function () {
    var self = this;
    var ucid = this.ucid;

    var el = document.querySelector('[data-ucid="' + ucid + '"]');
    if (!el) return;
    if (el.getAttribute('data-uc-init') === '1') return;
    el.setAttribute('data-uc-init', '1');

    var encode = (window.gx && gx.dom && gx.dom.encode)
        ? function(s) { return gx.dom.encode(s == null ? '' : String(s)); }
        : function(s) {
            return String(s == null ? '' : s)
                .replace(/&/g,'&amp;').replace(/</g,'&lt;')
                .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        };

    var panel = el.querySelector('[data-part="panel"]');
    var html = '<button class="item">' + encode(self.Label) + '</button>';

    if (window.gx && gx.dom && gx.dom.setInnerHtml) {
        gx.dom.setInnerHtml(panel, html);
    } else {
        panel.innerHTML = html;
    }

}).call(this);
```

---

## `gx.evt` — Event Utilities

Cross-browser event handling utilities.

```javascript
// Attach event listener
gx.evt.attach(element, 'click', function(e) {
    // handler
});

// Stop event propagation
gx.evt.stopPropagation(e);

// Get event source (target element)
var target = gx.evt.source(e);

// gx.evt.on_ready — runs when DOM is ready
gx.evt.on_ready(function() {
    // safe to access DOM here
});
```

### Usage Example

```javascript
var trigger = el.querySelector('[data-part="trigger"]');
var panel   = el.querySelector('[data-part="panel"]');

function open() {
    if (window.gx && gx.dom) {
        gx.dom.addClass(trigger, 'btn--open');
        gx.dom.addClass(panel, 'dropdown--open');
    }
    trigger.setAttribute('aria-expanded', 'true');
}

function close() {
    if (window.gx && gx.dom) {
        gx.dom.removeClass(trigger, 'btn--open');
        gx.dom.removeClass(panel, 'dropdown--open');
    }
    trigger.setAttribute('aria-expanded', 'false');
}

if (window.gx && gx.evt) {
    gx.evt.attach(trigger, 'click', function(e) {
        gx.evt.stopPropagation(e);
        if (gx.dom.hasClass(panel, 'dropdown--open')) close(); else open();
    });

    gx.evt.attach(document, 'click', function(e) {
        var src = gx.evt.source(e);
        if (src && !el.contains(src)) close();
    });
}
```

---

## `gx.fx.obs` — Pub/Sub (Observable Events)

The GeneXus runtime pub/sub system for JavaScript ↔ GeneXus communication.

```javascript
// Publish an event (JavaScript → GeneXus)
gx.fx.obs.notify('EventName.action', 'parameter-value');

// Subscribe to an event (JavaScript → JavaScript)
gx.fx.obs.suscribe('EventName.action', function(param) {
    // handler receives the parameter
});

// Unsubscribe
gx.fx.obs.unsuscribe('EventName.action', handlerReference);
```

> Note: GeneXus spells it `suscribe` (not `subscribe`) — this is not a typo.

### JS → GeneXus Communication

This is the recommended way to trigger GeneXus events from JavaScript:

```javascript
// In UC AfterShow script
function notifyGeneXus(action, param) {
    if (window.gx && gx.fx && gx.fx.obs && gx.fx.obs.notify) {
        gx.fx.obs.notify('MyModule.action', param);
    }
}
```

```genexus
// In WebPanel — subscribe to the event
Event 'MyModule.action'
    // &EventParam receives the value passed from JS
    Do 'HandleAction'
EndEvent
```

### JS → JS Communication (between UCs)

```javascript
// UC A publishes
gx.fx.obs.notify('navigation.itemSelected', itemId);

// UC B listens
gx.fx.obs.suscribe('navigation.itemSelected', function(id) {
    // react to selection in UC A
});
```

---

## `gx.http.storage` — Storage Abstractions

Abstractions over browser session/local storage.

```javascript
// Session storage
gx.http.storage.setSessionValue('key', 'value');
var val = gx.http.storage.getSessionValue('key');

// Local storage
gx.http.storage.setLocalValue('key', 'value');
var val = gx.http.storage.getLocalValue('key');

// Remove
gx.http.storage.removeSessionValue('key');
gx.http.storage.removeLocalValue('key');
```

### Usage Example

```javascript
// Cache user preference
var pref = gx.http.storage.getSessionValue('nav-collapsed');
if (pref === 'true') {
    collapseNav();
}

// Save preference on toggle
function toggleNav() {
    var collapsed = gx.dom.hasClass(navEl, 'nav--collapsed');
    gx.dom.toggleClass(navEl, 'nav--collapsed');
    gx.http.storage.setSessionValue('nav-collapsed', String(!collapsed));
}
```

---

## `gx.grid` — Grid Operations

APIs for interacting with GeneXus Grid controls from JavaScript.

```javascript
// Get grid element by internal name
var grid = gx.grid.getGrid('GridName');

// Refresh grid data
gx.grid.refresh('GridName');

// Get current page
var page = gx.grid.getCurrentPage('GridName');

// Navigate pages
gx.grid.nextPage('GridName');
gx.grid.prevPage('GridName');
gx.grid.firstPage('GridName');
gx.grid.lastPage('GridName');
```

### UC Injecting into Grid Footer

A common pattern is to find a GeneXus grid in the DOM and inject totals into the `<tfoot>`:

```javascript
// GeneXus grid internal names are UPPERCASE — use case-insensitive search
var gridId    = (self.GridName || '').toUpperCase();
var container = document.querySelector("[id*='" + gridId + "' i]");
var table     = container ? container.querySelector('table') : null;
var tfoot     = table ? table.querySelector('tfoot') : null;

if (tfoot) {
    var row = '<tr><td colspan="5" class="grid-footer__totals">';
    row += esc(self.TotalLabel) + ': ' + esc(self.TotalValue);
    row += '</td></tr>';
    tfoot.innerHTML = row;
}
```

---

## `gx.popup` — Popup/Modal Management

APIs for controlling GeneXus popup windows.

```javascript
// Close current popup
gx.popup.close();

// Close popup by ID
gx.popup.close('popupId');

// Check if inside a popup
var inPopup = gx.popup.isPopup();
```

### Detecting GeneXus Popup Open/Close

GeneXus popups are injected as elements with IDs starting with `gxp`. Use a MutationObserver to react:

```javascript
var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
            if (node.nodeType === 1) {
                var id  = (node.id || '');
                var cls = (node.className || '').toString();
                if (id.indexOf('gxp') > -1 || cls.indexOf('gx-popup') > -1) {
                    // A GeneXus popup opened — close any floating panels
                    closeDropdown();
                }
            }
        });
    });
});
observer.observe(document.body, { childList: true, subtree: false });
```

---

## `gx.fn` — Function Utilities

General utility functions available in the GeneXus runtime.

```javascript
// Type checking
gx.fn.isFunction(fn);   // returns boolean
gx.fn.isString(val);    // returns boolean
gx.fn.isArray(val);     // returns boolean

// Object utilities
gx.fn.extend(target, source);  // shallow merge

// String utilities
gx.fn.trim(str);        // trim whitespace
```

---

## Floating Dropdown Positioning Pattern

A reusable pattern for positioning a floating dropdown panel below its trigger element:

```javascript
function positionDropdown(triggerEl, panelEl) {
    var rect = triggerEl.getBoundingClientRect();
    panelEl.style.position = 'fixed';
    panelEl.style.top      = (rect.bottom + 4) + 'px';
    panelEl.style.left     = rect.left + 'px';
    panelEl.style.width    = rect.width + 'px';
    panelEl.style.zIndex   = '9999';
}

// Close on scroll (critical for fixed-positioned dropdowns)
$(window).off('scroll.ns_' + ucid).on('scroll.ns_' + ucid, closeDropdown);
$(document).off('scroll.ns_' + ucid).on('scroll.ns_' + ucid, '*', closeDropdown);
```

---

## Injecting CSS Dynamically (Keyframe Workaround)

When CSS `@keyframes` or `::-webkit-scrollbar` don't apply from the UC `<style>` block (iframe context), inject via JavaScript:

```javascript
function injectCss(id, css) {
    if (document.getElementById(id)) return;  // guard — only inject once
    var style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
}

injectCss('my-uc-keyframes-' + ucid, [
    '@keyframes my-uc-spin {',
    '  from { transform: rotate(0deg); }',
    '  to { transform: rotate(360deg); }',
    '}'
].join(''));
```

---

## jQuery in GeneXus Context

GeneXus 18 includes jQuery globally. `$` is available in UC scripts.

**Always use `.off()` before `.on()` to prevent listener accumulation:**

```javascript
// ✅ CORRECT — prevents duplicate handlers after Refresh
$('#my-el-' + ucid).off('click').on('click', function(e) {
    // handler
});

// Document-level events — use namespace for safe cleanup
$(document).off('click.ns_' + ucid).on('click.ns_' + ucid, function(e) {
    if (!el.contains(e.target)) close();
});

// ❌ WRONG — accumulates handlers on each Refresh
$('#my-el-' + ucid).on('click', function(e) { ... });
```
