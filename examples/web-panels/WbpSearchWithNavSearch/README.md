# WbpSearchWithNavSearch

A Web Panel that uses `UcNavSearch` to filter a grid in real-time via pub/sub.

## What it demonstrates

- Wiring a UC event (`OnSelect`) to a grid refresh
- Passing filter data from UC to WBP via `UcNavSearch1.ItemSelected`
- `BuildControls` sub pattern for `Start` + `Refresh` with no duplication
- `Load` event for grid data binding on every refresh
- `msg()` for early-return error display
- Alternative `Search` button event as a manual trigger

## Wiring explanation

`UcNavSearch` publishes `OnSelect` when the user picks a search result. The WBP subscribes by naming its event handler `UCNavSearch1.OnSelect` — GeneXus wires these by naming convention, no explicit subscribe call needed.

Flow:
1. `UcNavSearch1` fires `OnSelect`
2. WBP event reads `UcNavSearch1.ItemSelected` and stores it in `&FilterTerm`
3. `SearchGrid.CurrentPage` resets to 1 (avoid stale pagination)
4. `SearchGrid.Load()` triggers the `Load` event, which re-runs the `For Each` with the new filter

## Reference

- WBP pattern guide: [`skills/genexus-expert.md`](../../../skills/genexus-expert.md) — WEB PANEL / WEB COMPONENT section (Pub/Sub with UcNavSearch, Events Lifecycle, Error Handling)
- UC source: [`examples/user-controls/UcNavSearch/UcNavSearch.view`](../../user-controls/UcNavSearch/UcNavSearch.view)
- UC reference: [`examples/user-controls/UcNavSearch/README.md`](../../user-controls/UcNavSearch/README.md)

## How to adapt

- Replace `SearchGrid` with your actual grid variable name in the GeneXus object
- Replace `UcNavSearch1` with the instance name you placed on the WBP screen
- Change `Item.Name Like '%' + &FilterTerm + '%'` to match your table and column
- If you need to filter by ID (not label), use `UcNavSearch1.ItemSelected` as a numeric key and adapt the `Where` clause accordingly
- If `UcNavSearch1` navigates to a URL automatically (when `Items` includes `"url"`), the `OnSelect` handler is optional — add it only for side effects (logging, grid filtering, highlighting)
