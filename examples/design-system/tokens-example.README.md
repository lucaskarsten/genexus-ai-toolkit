# tokens-example.json — Design Token Structure

This file shows the recommended structure for design tokens exported from a design tool (Figma, Tokens Studio, etc.) and how they map to GeneXus DSO token syntax.

---

## JSON Structure → DSO Token Name

GeneXus DSO tokens use dot-notation paths where slashes from the JSON path become dots and segments are joined with hyphens:

| JSON Path | GeneXus DSO Token |
|-----------|------------------|
| `colors.action.primary.default` | `$colors.action-primary-default` |
| `colors.action.primary.hover` | `$colors.action-primary-hover` |
| `colors.text.primary` | `$colors.text-primary` |
| `colors.text.secondary` | `$colors.text-secondary` |
| `colors.bg.container.base` | `$colors.bg-container-base` |
| `colors.border.primary` | `$colors.border-primary` |
| `spacing.m` | `$spacing.m` |
| `spacing.xl` | `$spacing.xl` |
| `fontSizes.body` | `$fontSizes.body` |
| `fonts.Label-Regular` | `$fonts.Label-Regular` |
| `radius.s` | `$radius.s` |
| `radius.pill` | `$radius.pill` |
| `custom.icon-size-medium` | `$custom.icon-size-medium` |

## Transformation Rule

```
JSON: "colors" > "action" > "primary" > "default": "#0066FF"
DSO:  $colors.action-primary-default

JSON: "spacing" > "m": "16px"
DSO:  $spacing.m
```

The rule:
1. The top-level key becomes the `$group` prefix
2. All remaining segments are joined with `-` (hyphen)
3. Final syntax: `$group.segment1-segment2-segment3`

## Using Tokens in a DSO File

```css
styles DsoMyComponent
{
    @import DsoBase;

    .my-button {
        background-color: $colors.action-primary-default;
        color: $colors.text-on-dark;
        padding: $spacing.s $spacing.m;
        border-radius: $radius.s;
        font-family: $fonts.Label-Bold;
        font-size: $fontSizes.body;
    }

    .my-button:hover {
        background-color: $colors.action-primary-hover;
    }

    .my-button--disabled {
        background-color: $colors.border-primary;
        color: $colors.text-disabled;
    }
}
```

## Token Groups

| Group prefix | What it covers |
|-------------|---------------|
| `$colors` | All color values — action, text, bg, border, icon, scrollbar |
| `$spacing` | Spacing scale (xs/s/m/l/xl) and semantic spacings |
| `$fontSizes` | Font size scale |
| `$fonts` | Font family names |
| `$radius` | Border radius scale |
| `$custom` | Project-specific custom values (icon sizes, etc.) |

## Important Notes

- Tokens are defined in your `DsoBase` object in GeneXus. Always verify what tokens are actually available before using them in other DSOs.
- Using an undefined token produces no error but falls back to nothing — the property is silently skipped.
- Token names in `DsoBase` are case-sensitive and casing-locked on first save — always use `kebab-case`.
- Never use hardcoded hex values or `px` values in DSOs when a matching token exists.
