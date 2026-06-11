# Common Pitfalls in GeneXus User Controls

Real-world traps found in production GeneXus codebases. Ordered by recurrence frequency.

---

## 1. Re-init guard with `getAttribute` requires explicit comparison

The most common guard bug. Using a falsy check instead of a strict equality check inverts the logic.

```javascript
// ❌ WRONG — this guard NEVER blocks re-init
// getAttribute returns null when attribute is absent, which is falsy
// So the "if (!getAttribute)" fires on EVERY AfterShow call (null is falsy)
var el = document.getElementById('my-uc-' + ucid);
if (!el.getAttribute('data-init')) return;  // backwards! allows re-run when null
el.setAttribute('data-init', '1');

// ✅ CORRECT — strict string comparison
var el = document.querySelector('[data-ucid="' + ucid + '"]');
if (!el) return;
if (el.getAttribute('data-init') === '1') return;  // blocks on second run
el.setAttribute('data-init', '1');
// only reaches here on first execution per instance
```

**Why it matters**: Without the guard, event listeners accumulate on every postback. A button ends up firing 2×, 3×, N× clicks.

---

## 2. XSS via `innerHTML` without escaping

Injecting untrusted data directly into `innerHTML` is an XSS vector and also causes HTML parse errors when the data contains `<`, `>`, `"`, or `&`.

```javascript
// ❌ WRONG — breaks with special characters, enables XSS
panel.innerHTML = '<span>' + item.label + '</span>';

// ✅ CORRECT — always escape before innerHTML
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

panel.innerHTML = '<span>' + esc(item.label) + '</span>';
```

Apply `esc()` to every user-controlled value that goes into `innerHTML`. No exceptions.

---

## 3. `textContent` displays HTML entities literally

When GeneXus injects HTML-encoded content into a div, reading `innerHTML` gives you `&amp;`, `&lt;`, etc. as literal strings. `textContent` does not decode them — you need to use a temporary DOM element.

```javascript
// Scenario: GeneXus injected "&lt;script&gt;" into a data div
var dataDiv = document.getElementById('uc-data-' + ucid);

// ❌ WRONG — dataDiv.textContent returns "&lt;script&gt;" (literal entities)
var text = dataDiv.textContent;

// ✅ CORRECT — decode via temporary div
function decodeHtml(s) {
    var d = document.createElement('div');
    d.innerHTML = s;
    return d.textContent || d.innerText || '';
}

var text = decodeHtml(dataDiv.innerHTML);
```

This is the standard browser technique for decoding HTML entities.

---

## 4. Manual JSON construction in GeneXus always breaks

Manually concatenating JSON strings in GeneXus code fails as soon as a field contains quotes, accents, newlines, or any special character.

```genexus
// ❌ WRONG — breaks with any special character in &Nome or &Id
UCMyControl.ItemsJson = !'[{"id":"' + &Id + '","label":"' + &Nome + '"}]'

// ✅ CORRECT — use SDT.ToJson() which handles all escaping
&SdtItem.Id    = &Id
&SdtItem.Label = &Nome
&SdtCollection.Add(&SdtItem)
UCMyControl.ItemsJson = &SdtCollection.ToJson()
```

`SDT.ToJson()` is the only safe way to build JSON in GeneXus. Manual concatenation is a time bomb.

---

## 5. Typos in SDT field names propagate silently

If you mistype an SDT field name in JavaScript (e.g., `item.Lable` instead of `item.Label`), the access returns `undefined`. JavaScript does not throw an error — you just get empty values everywhere and no stack trace to help.

```javascript
// Suppose the JSON has: [{"id": "1", "label": "My Item"}]
var items = JSON.parse(raw);

// ❌ WRONG — typo, returns undefined silently
var label = items[0].Lable;   // undefined

// ✅ CORRECT — match SDT field names exactly
var label = items[0].label;   // "My Item"
```

**Best practice**: log the raw JSON during development to verify exact field names before writing accessor code.

```javascript
// Temporary debug — remove before delivery
console.log('UC data:', JSON.stringify(items[0]));
```

---

## 6. For Each loops need explicit handling for empty collections

In GeneXus, the `&last` variable used for comma separation must be initialized to `-1`. If you initialize it to `0` and the collection is empty, the last-item logic silently produces wrong output.

```genexus
// ❌ WRONG — &last = 0 causes off-by-one when collection is empty
&last = 0
For Each Item
    ...
EndFor

// ✅ CORRECT — initialize to -1, update inside the loop
&last = -1
For Each Item
    &last = Item.Position
EndFor

// Also add explicit empty-collection handling:
If &Collection.Count = 0
    UCMyControl.ItemsJson = !'[]'
    Return
EndIf
```

---

## 7. `Iif` branches are swapped

A classic GeneXus mistake: swapping the "true" and "false" branches in `Iif`.

```genexus
// Signature: Iif(condition, valueIfTrue, valueIfFalse)

// ❌ WRONG — &Nome is empty, so IsEmpty is true, but we're returning &Nome (empty)
UCMyControl.Label = Iif(IsEmpty(&Nome), &Nome, !'Default')
//                                       ↑ true branch runs when &Nome IS empty → returns ""

// ✅ CORRECT — when &Nome is empty, return the fallback; otherwise return &Nome
UCMyControl.Label = Iif(IsEmpty(&Nome), !'Default', &Nome)
//                                        ↑ true branch = "it IS empty" → use default
```

**Mnemonic**: `Iif(condition, THEN, ELSE)` — read it as: "IF this is true, THEN use A, ELSE use B."

---

## 8. Pass only the modifier class, not the full class string

When a UC property controls visual state (e.g., a color variant), pass only the modifier suffix. The UC should compose the full class name internally.

```genexus
// ❌ WRONG — passing the full class name couples the caller to UC internals
UCMyControl.Variant = !'my-button my-button--primary'

// ✅ CORRECT — pass only the modifier value
UCMyControl.Variant = !'primary'
```

In the UC JavaScript, compose the class:

```javascript
var variant = control.Variant || 'default';
btnEl.className = 'my-button my-button--' + variant;
```

This way, renaming the CSS class only requires changing the UC — not all WebPanels that use it.

---

## 9. Old code left in `Event Start` after extracting to a Sub

When you refactor initialization code from `Event Start` into a dedicated `Sub`, the original code must be removed from `Event Start`. Leaving it there means the logic runs twice: once in Start and once when the Sub is called.

```genexus
// ❌ WRONG after refactor — MontaControle runs twice
Event Start
    // code you meant to move...
    UCMyControl.ucid  = !'MyId'    // still here from before refactor
    UCMyControl.Label = &Nome      // still here from before refactor
    Do 'MontaControle'             // also runs it via Sub
EndEvent

// ✅ CORRECT — remove from Start after extracting
Event Start
    Do 'MontaControle'
EndEvent

Sub 'MontaControle'
    UCMyControl.ucid  = !'MyId'
    UCMyControl.Label = &Nome
EndSub
```

---

## 10. VarChar fields for URLs need minimum 500 characters

GeneXus default VarChar length is often 20 or 50. Modern URLs (with query parameters, OAuth tokens, redirect URLs) routinely exceed 200 characters. Always declare URL fields with sufficient length.

```genexus
// ❌ WRONG — truncates long URLs silently
&Url     : VarChar(100)
&RedirectUrl : VarChar(50)

// ✅ CORRECT — use at least 500 for any URL field
&Url         : VarChar(500)
&RedirectUrl : VarChar(1000)  // OAuth redirect URLs can be very long
&ApiEndpoint : VarChar(500)
```

Silent truncation is one of the hardest bugs to diagnose because the GeneXus compiler does not warn you — it just cuts the string at the declared length.

---

## Quick Reference

| # | Symptom | Root Cause | Fix |
|---|---------|-----------|-----|
| 1 | Event fires N times on one click | Guard uses `!getAttribute()` (inverted) | Use `=== '1'` explicit comparison |
| 2 | HTML broken / XSS risk | `innerHTML` with unescaped user data | `esc()` every value before innerHTML |
| 3 | `&amp;` appears as literal text | `textContent` on HTML-encoded content | `decodeHtml()` via temp div |
| 4 | JSON errors with special chars | Manual string concatenation | `SDT.ToJson()` always |
| 5 | Empty values, no error | SDT field name typo in JS | Log raw JSON; match names exactly |
| 6 | Last-item logic wrong on empty list | `&last = 0` initialization | Initialize to `-1` |
| 7 | Wrong value in Iif branch | Condition result inverted | Read as "IF true THEN ... ELSE ..." |
| 8 | Style breaks when CSS renamed | Full class in property | Pass only modifier suffix |
| 9 | Init runs twice, events double | Old code left in Start after refactor | Remove original after extracting Sub |
| 10 | URL truncated silently | VarChar too short | VarChar(500) minimum for URLs |
