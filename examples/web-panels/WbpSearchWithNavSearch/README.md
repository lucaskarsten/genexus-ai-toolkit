# WbpSearchWithNavSearch

A Web Panel that uses `UcNavSearch` to filter a grid in real-time via pub/sub.

## What it demonstrates

- Wiring a UC event (`OnSelect`) to a grid refresh
- Passing filter data from UC to WebPanel via `&EventParam`
- `BuildControls` sub pattern for Start + Refresh
- `msg()` for error display

## Properties wired

| UC property | Value |
|---|---|
| `ucid` | `!'search-nav'` (set FIRST) |
| `Placeholder` | Search prompt text |
| `Items` | `&SearchItems.ToJson()` |

## Events handled

| Event | What it does |
|---|---|
| `UCSearch1.OnSelect` | Sets `&FilterTerm = &EventParam`, then `Refresh` |

## Reference

- UC source: [`examples/user-controls/UcNavSearch/UcNavSearch.view`](../../user-controls/UcNavSearch/UcNavSearch.view)
- WBP pattern guide: [`skills/genexus-expert.md`](../../../skills/genexus-expert.md) — WEB PANEL / WEB COMPONENT section
