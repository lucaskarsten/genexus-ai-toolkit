# DSO Template Guide

A quick-start reference for creating GeneXus Design System Objects (DSOs).

---

## DSO File Structure

```css
styles DsoMyComponent
{
    /* 1. Import DsoBase first (all DSOs except DsoBase itself) */
    @import DsoBase;

    /* 2. Your CSS rules here */
    .my-component {
        background-color: $colors.bg-container-base;
        padding: $spacing.m;
    }
}
```

The file name and the `styles` name must match exactly: `DsoMyComponent.css` → `styles DsoMyComponent`.

---

## Importing Another DSO

```css
styles DsoMyComponent
{
    /* Always import DsoBase first */
    @import DsoBase;

    /* Import additional DSOs as needed */
    @import DsoButtons;

    /* Your classes below */
    .my-component { }
}
```

**Rule**: `@import` only works within the same DSO. You cannot `@include` a mixin from another DSO.

---

## Token Usage Syntax

Tokens are defined in `DsoBase`. Always use tokens — never hardcode hex values or `px` when a token exists.

```css
/* Colors */
color: $colors.text-primary;
background-color: $colors.bg-container-base;
border-color: $colors.border-primary;

/* Spacing */
padding: $spacing.m;              /* 16px */
gap: $spacing.s;                  /* 8px */
margin-bottom: $spacing.l;        /* 24px */

/* Typography */
font-family: $fonts.Label-Regular;
font-size: $fontSizes.body;       /* 14px */

/* Border radius */
border-radius: $radius.s;         /* 8px */
border-radius: $radius.pill;      /* 9999px */

/* Custom */
width: $custom.icon-size-medium;  /* 24px */
```

Always verify which tokens are available in your `DsoBase` before writing CSS. Using an undefined token produces a silent fallback (no error, no value).

---

## BEM Class Example

```css
styles DsoCard
{
    @import DsoBase;

    /* ── Block ─────────────────────────────────────── */
    .card {
        background-color: $colors.bg-container-base;
        border: 1px solid $colors.border-primary;
        border-radius: $radius.s;
        padding: $spacing.m;
    }

    /* ── Elements ──────────────────────────────────── */
    .card__header {
        display: flex;
        align-items: center;
        gap: $spacing.s;
        margin-bottom: $spacing.m;
    }

    .card__title {
        font-family: $fonts.Label-Bold;
        font-size: $fontSizes.body-large;
        color: $colors.text-primary;
    }

    .card__body {
        font-family: $fonts.Label-Regular;
        font-size: $fontSizes.body;
        color: $colors.text-secondary;
    }

    /* ── Modifiers ─────────────────────────────────── */
    .card--highlighted {
        border-color: $colors.action-primary-default;
    }

    .card--disabled {
        opacity: 0.5;
        pointer-events: none;
    }

    .card__title--truncated {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}
```

---

## @include Within Same DSO

`@include` works only for mixins defined in the same DSO:

```css
styles DsoCard
{
    @import DsoBase;

    /* Define mixin */
    @mixin card-typography {
        font-family: $fonts.Label-Regular;
        font-size: $fontSizes.body;
        line-height: 1.5;
    }

    /* Use mixin */
    .card__body { @include card-typography; }
    .card__description { @include card-typography; color: $colors.text-secondary; }
}
```

For cross-DSO composition, use the Class property in GeneXus IDE: set `Class = "text-block my-component__text"`.

---

## Token-First Rule

```css
/* ❌ PROHIBITED — hardcoded values */
.my-component {
    color: #1A1A1A;
    padding: 16px;
    border-radius: 8px;
    font-size: 14px;
}

/* ✅ CORRECT — token-first */
.my-component {
    color: $colors.text-primary;
    padding: $spacing.m;
    border-radius: $radius.s;
    font-size: $fontSizes.body;
}
```

**Units**: always `px` in DSO files — never `dip`.

---

## When to Create a New DSO

Apply the **2-of-3 rule**:

| Criterion | Threshold |
|-----------|-----------|
| **Volume** | 5+ BEM classes from the same domain |
| **Reuse** | Used in 3+ Web Panels |
| **Independence** | Clear, isolated semantics from existing DSOs |

If 2 or more criteria are met, create a new DSO. Otherwise, add the class to the most appropriate existing DSO.

### Decision tree

```
New class needed?
│
├─ Is it a token override or utility?  → DsoBase
├─ Is it a GeneXus auto-class?        → DsoGenexus
├─ Is it a button variant?            → DsoButtons
├─ Is it a label/badge/tag?           → DsoLabels
├─ Is it page structure?              → DsoHeader / DsoNavigation
└─ Is it module-specific?
    ├─ Module DSO exists?             → add there
    └─ No, and 2-of-3 rule met?       → create Modules/<Module>/Dso<Module>
```
