# User Control Template Guide

A quick-start reference for creating GeneXus 18 User Controls.

---

## The 5 Laws (Summary)

1. **`<script>` in Screen Template NEVER executes** — all JS goes in `<Script When="AfterShow">`
2. **`AfterShow` re-runs on every postback** — always use a re-init guard
3. **`ucid` is mandatory** — set it FIRST in the WebPanel, before all other properties
4. **Long text in content div, never in attribute** — attributes break with quotes and newlines
5. **Backslash in regex disappears** — use `new RegExp(String.fromCharCode(10), 'g')`

For the full guide: [docs/user-controls-guide.md](../../docs/user-controls-guide.md)

---

## Minimum .view Template

### Properties (XML Definition)

```xml
<Definition auto="false">
  <Property Name="ucid"  Type="string" Default="" />
  <Property Name="Label" Type="string" Default="" />

  <Event Name="OnSelect"/>

  <Script Name="AfterShow" When="AfterShow">
    (function () {
      var self = this;
      var ucid = this.ucid;

      /* ── guard: runs once per instance ── */
      var el = document.querySelector('[data-ucid="' + ucid + '"]');
      if (!el) return;
      if (el.getAttribute('data-uc-init') === '1') return;
      el.setAttribute('data-uc-init', '1');

      /* ── utility: escape for innerHTML ── */
      function esc(s) {
        return String(s == null ? '' : s)
          .replace(/&/g,'&amp;').replace(/</g,'&lt;')
          .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      /* ── utility: decode GeneXus HTML entities ── */
      function decode(s) {
        return (s || '')
          .replace(/&quot;/g,'"').replace(/&amp;/g,'&')
          .replace(/&lt;/g,'<').replace(/&gt;/g,'>');
      }

      /* ── read label ── */
      var labelEl = el.querySelector('[data-part="label"]');
      if (labelEl) labelEl.textContent = self.Label;

      /* ── fire event example ── */
      el.addEventListener('click', function() {
        if (typeof self.OnSelect === 'function') self.OnSelect();
      });

      /* ── MutationObserver for AJAX Refresh ── */
      var dataEl = document.getElementById('uc-data-' + ucid);
      if (dataEl) {
        new MutationObserver(function() {
          el.removeAttribute('data-uc-init');
          window['ucReinit_' + ucid] && window['ucReinit_' + ucid]();
        }).observe(dataEl, { attributes: true, childList: true, characterData: true });
      }

    }).call(this);
  </Script>
</Definition>
```

### Screen Template (HTML)

```html
<style>
/* Replace "myuc" with your 3-4 char CSS prefix */
.myuc-root { font-family: 'Noto Sans', sans-serif; box-sizing: border-box; }
.myuc-root * { box-sizing: border-box; }
.myuc-root__label { font-size: 14px; color: #1a1a1a; }
</style>

<div class="myuc-root" data-ucid="{{ucid}}">
  <span class="myuc-root__label" data-part="label">{{Label}}</span>
</div>

<!-- Long/variable content goes in a content div, never in an attribute -->
<div id="uc-data-{{ControlName}}" style="display:none">{{LongContent}}</div>
```

---

## Using in a WebPanel

```genexus
Event Start
    // 1. ucid ALWAYS first
    UCMyControl1.ucid  = !'my-ctrl-1'
    // 2. then other properties
    UCMyControl1.Label = "Click me"
EndEvent

Event Refresh
    Do 'BuildMyControl'
EndEvent

Sub 'BuildMyControl'
    UCMyControl1.ucid  = !'my-ctrl-1'
    UCMyControl1.Label = &MyLabel
EndSub

Event UCMyControl1.OnSelect
    // handle event
    // use &EventParam if you passed a value via vEVENTPARAM
EndEvent
```

---

## Pre-Delivery Checklist

- [ ] `auto="false"` in `<Definition>`
- [ ] `ucid` is the first property set in the WebPanel
- [ ] Re-init guard uses `=== '1'` (not `!getAttribute(...)`)
- [ ] All HTML injection uses `esc()` or `gx.dom.encode()`
- [ ] Long text in invisible content div, not in HTML attribute
- [ ] No `let`, `const`, or arrow functions — ES5 only
- [ ] CSS classes use a unique 3-4 char prefix (BEM kebab-case)
- [ ] Tested with 2+ instances on the same page
- [ ] Tested after a GeneXus Refresh (AJAX)
