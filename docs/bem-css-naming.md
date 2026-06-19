# BEM CSS Naming for GeneXus DSOs

This guide defines how to name CSS classes in GeneXus Design System Objects (DSOs). All classes must follow BEM strictly. When in doubt, the rule wins over intuition.

---

## TL;DR

```
.block                      /* Block: independent entity */
.block__element             /* Element: part of block (2 underscores) */
.block--modifier            /* Block modifier (2 dashes) */
.block__element--modifier   /* Element modifier */
```

**Non-negotiable rules:**

1. Element separator: `__` (two underscores)
2. Modifier separator: `--` (two dashes)
3. Words inside block/element/modifier: `kebab-case` (`.user-card__avatar-image--rounded`)
4. **Never** nest elements (`.block__el1__el2` is PROHIBITED)
5. **Never** create a standalone modifier without block/element (`.--active` is PROHIBITED)
6. Names describe **semantic role**, never appearance (`.button--primary`, not `.button--blue`)

---

## 1. DSO Folder Structure

```
DesignSystem/
  Base/
    DsoBase              ← tokens (colors, spacing, fonts, radius)

  Components/
    DsoButtons           ← button variants
    DsoLabels            ← labels, badges, tags
    DsoInputs            ← inputs
    DsoForm              ← forms
    DsoGrid              ← grids
    DsoToast             ← toast notifications
    DsoEssential         ← essential components
    DsoLoading           ← loading states

  Layout/
    DsoHeader            ← header, page-heading, containers
    DsoNavigation        ← sidebar, nav-panel, nav-search

  Modules/              ← (create when volume justifies)
    ModA/DsoModA         ← classes exclusive to Module A
    ModB/DsoModB         ← classes exclusive to Module B

  DsoGenexus            ← overrides for GeneXus auto-generated classes
  DsoYourApp            ← entry point: @imports only, no classes
```

---

## 2. Conceptual Separation

### `Base` → `DsoBase`

Global tokens: colors, spacing, fonts, radius. Never put component-specific or module-specific classes here. Tokens are added here only after they appear in 3+ modules.

### `Layout` → `DsoHeader` + `DsoNavigation`

Page structure:
- header
- page-heading
- containers
- sidebar
- breadcrumb

Defines **how the page is organized**, not the content. Classes carry no module prefix.

### `Components` → `DsoButtons`, `DsoLabels`, `DsoInputs`...

Atomic, reusable components — buttons, labels, badges, inputs, grids, forms, toasts. Must be **module-agnostic** (reusable anywhere). No prefix.

### `Modules` → `DsoModA`, `DsoModB`...

Each module gets its own DSO when volume justifies it:
- Classes specific to that module
- Component customizations
- Internal layouts exclusive to the module

Classes carry the module's BEM prefix (`moda-`, `modb-`...). Create only when reaching 2-of-3: 5+ classes, 3+ Web Panels, isolated semantics.

### `DsoGenexus`

Overrides for classes GeneXus emits automatically (`.Attribute`, `.TextBlock`, `.Button`...). Standardizes the visual of all fields without touching each screen individually.

```css
styles DsoGenexus
{
    @import DsoBase;

    .Attribute  { /* default field style */ }
    .TextBlock  { /* default text style */ }
    .Button     { /* default button style */ }
}
```

### `DsoYourApp` (Entry Point)

Set as the Style property of Web Panels. Contains only `@import` statements — **no classes, no tokens**. If it has classes, migrate them to the correct DSO.

---

## 3. Naming Conventions

**BEM strict, kebab-case, no exceptions:**

```
.block__element--modifier
```

Examples:
```css
.card { }
.card__title { }
.card--highlighted { }

.button { }
.button--primary { }
.button--size-large { }
```

### Non-negotiable rules

| Rule | Correct | Wrong |
|------|---------|-------|
| Element separator | `.card__title` | `.card-title`, `.card_title` |
| Modifier separator | `.button--primary` | `.button-primary`, `.button_primary` |
| Compound names | `.user-card__avatar-image` | `.userCard`, `.UserCard` |
| No nested elements | `.card__title` | `.card__body__title` |
| No standalone modifier | `.card.highlighted` | `.--highlighted` |
| Semantic, not visual | `.button--primary` | `.button--blue` |

### GeneXus Casing Restriction

**Critical**: GeneXus locks the casing on first save. If you save `.UserCard`, you cannot later use `.user-card` — the IDE treats them as different classes. Always use `kebab-case` from the very first save. Never use PascalCase or camelCase, even temporarily.

---

## 4. Module Namespacing

```css
/* ❌ PROHIBITED — cascade creates coupling and fights BEM */
.mod-a .card { }

/* ✅ CORRECT — prefix in the block name */
.moda-invoice-card { }
.moda-invoice-card__title { }
.moda-invoice-card--overdue { }
```

### Defining Your Module Prefixes

Choose 3-4 character kebab prefixes that reflect your project's domain structure. Examples:

| Module | Prefix |
|--------|--------|
| Module A (e.g., Finance) | `fin-` |
| Module B (e.g., Sales) | `ven-` |
| Module C (e.g., Purchasing) | `pur-` |
| Core/Shared | `nuc-` |
| Portal | `prt-` |

Define your project's prefix table once and enforce it consistently. Classes without a module prefix are generic and go in `Components/` DSOs.

---

## 5. @import Order in Entry Point DSO

The last import wins in a collision. Order: **generic → specific**.

```css
styles DsoYourApp
{
    @import DsoBase;           /* 1st always: tokens available to all */
    @import DsoGenexus;        /* GeneXus auto-class overrides */
    @import DsoLoading;
    @import DsoForm;
    @import DsoGrid;
    @import DsoInputs;
    @import DsoButtons;
    @import DsoLabels;
    @import DsoEssential;
    @import DsoToast;
    @import DsoHeader;         /* Layout last: highest precedence */
    @import DsoNavigation;
    /* Module DSOs go before Layout DSOs if they exist:
    @import DsoModA;
    @import DsoModB;
    */
}
```

**Ordering rules:**
- `DsoBase` first — everyone depends on its tokens
- Components in the middle
- Layout last — highest precedence for page structure
- Module DSOs (if added to entry point) go before Layout DSOs
- If a module DSO is consumed directly by a Web Panel (bypassing the entry point), it must `@import DsoBase` internally

---

## 6. When to Create a New DSO vs Add to Existing

### Add to existing DSO (default)

If the domain is already covered by a DSO, the class goes there.

| The class is... | Goes in... |
|-----------------|-----------|
| Token, transversal utility | `DsoBase` |
| GeneXus auto-class override | `DsoGenexus` |
| Button variant | `DsoButtons` |
| Label, badge, tag variant | `DsoLabels` |
| Page structure (heading, container) | `DsoHeader` |
| Module-specific | `Modules/<Module>/Dso<Module>` |

### Create new DSO — only when 2-of-3 criteria are met

- **Volume**: 5+ BEM classes from the same domain
- **Reuse**: used in 3+ Web Panels
- **Independence**: clear semantics, isolated from existing DSOs

### Never

- Promote a class to `DsoBase` just because "it might be reused" — only after appearing in 3+ modules
- Create a layout class in the entry point DSO — it is only an aggregator
- Create a module class in `DsoBase` or the entry point
- Duplicate the same class in two DSOs — if both need it, it's generic and belongs in the correct hierarchy DSO

---

## 7. General Rules

### Tokens — always, no exceptions

```css
/* ✅ CORRECT */
color: $colors.text-primary;
background-color: $colors.bg-container-base;
padding: $spacing.m;
border-radius: $radius.s;

/* ❌ PROHIBITED */
color: #333333;
background-color: #ffffff;
padding: 16px;        /* when $spacing.m = 16px exists */
border-radius: 8px;   /* when $radius.s = 8px exists */
```

Always verify available tokens in `DsoBase` before writing CSS. Do not guess token names — an unknown token silently falls back to nothing.

**Units**: always `px` inside DSO — never `dip`.

### @include vs Cross-DSO Mix

```css
/* ✅ @include works within the SAME DSO */
@mixin my-typography {
    font-family: $fonts.Label-Regular;
    font-size: $fontSizes.body;
}
.my-element { @include my-typography; }

/* ❌ @include from another DSO = silent failure */
.my-element { @include DsoBase.text-block; }  /* does not work */

/* ✅ Cross-DSO: use mix via Class property in GeneXus */
/* In GeneXus IDE, control Class property: "text-block my-element" */
```

### Seletores escopados cross-DSO são removidos silenciosamente

O compilador GeneXus DSO descarta sem aviso qualquer regra CSS que combine classes de DSOs diferentes no mesmo seletor:

```css
/* ❌ REMOVIDO SILENCIOSAMENTE pelo compilador */
/* .dashboard__card-body pertence a DsoDashboard */
/* .desktop__heading--2 pertence a DsoTipografia */
/* Escrever isso dentro de QUALQUER DSO = regra ignorada */
.dashboard__card-body .desktop__heading--2 {
    font-size: 36px;  /* nunca aplicado — regra não existe no CSS gerado */
}
```

O compilador aplica isolamento por camada — cada DSO só pode controlar seus próprios seletores. A regra não aparece no DevTools após compilar; o browser aplica o valor original como se a regra não existisse. **Não há erro, não há aviso.**

**Alternativas corretas:**

```css
/* ✅ Opção 1: usar classe diferente que já tenha o tamanho desejado */
/* Trocar a classe no layout XML do WBC para uma que já exista com o valor correto */
/* Ex: desktop__heading--3 já tem 36px → usar isso no .xml em vez de --2 */

/* ✅ Opção 2: criar nova classe no DSO que "possui" o contexto externo */
/* .dashboard__card--count adicionada ao DsoDashboard funciona porque */
/* o contexto "dashboard" pertence a esse DSO */
styles DsoDashboard {
    .dashboard__card--count { font-size: 36px; }
}
/* No layout XML: Class="dashboard__card--count" */
```

**Regra de bolso:** para cada par `.classA .classB`, ambas as classes devem ser definidas no mesmo DSO — ou a regra será descartada.

### Renaming a DSO

GeneXus does not automatically update `@import` references when you rename a DSO. Manually review all places that reference the old name before renaming.

---

## 8. Complete BEM Example

```css
/* ==========================================================================
   Block: nav-item
   Used in: sidebar navigation
   ========================================================================== */

.nav-item {
    display: flex;
    align-items: center;
    gap: $spacing.s;
    height: $spacing.nav-item-height;
    padding: 0 $spacing.s;
    border-radius: $radius.s;
    cursor: pointer;
    color: $colors.text-secondary;
    text-decoration: none;
}

.nav-item__icon {
    width: $custom.icon-size-small;
    height: $custom.icon-size-small;
    flex-shrink: 0;
    color: $colors.icon-primary;
}

.nav-item__label {
    font-family: $fonts.Label-Regular;
    font-size: $fontSizes.body;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.nav-item__badge {
    font-size: $fontSizes.caption;
    background-color: $colors.action-primary-default;
    color: $colors.text-on-dark;
    border-radius: $radius.pill;
    padding: 2px 6px;
}

/* -- Modifiers -- */

.nav-item--active {
    background-color: $colors.action-selected-subtle;
    color: $colors.action-selected-default;
}

.nav-item--active .nav-item__icon {
    color: $colors.action-selected-default;
}

.nav-item--disabled {
    opacity: 0.5;
    pointer-events: none;
    cursor: default;
}

.nav-item--size-compact {
    height: 24px;
    padding: 0 $spacing.xs;
}
```

---

## 9. Quick Decision Tree

```
New CSS needed?
│
├─ Is it a token (color, spacing, font, radius)?
│   └─ → DsoBase
│
├─ Is it a GeneXus auto-generated class (.Button, .TextBlock, .Form)?
│   └─ → DsoGenexus
│
├─ Is it a reusable atomic component (button, label, input)?
│   └─ → DsoButtons / DsoLabels / DsoInputs / etc.
│
├─ Is it page structure (header, sidebar, containers)?
│   └─ → DsoHeader / DsoNavigation
│
└─ Is it specific to one module?
    └─ Does Modules/<Module>/Dso<Module> exist?
        ├─ Yes → add there
        └─ No  → create if 2-of-3 criteria met; otherwise add to generic Component DSO
```
