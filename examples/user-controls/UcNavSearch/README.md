# UcNavSearch

A navigation search input with a live-filter dropdown. Items are passed as a JSON array. Fires `OnSelect` when the user picks a result. Supports keyboard navigation and accent-insensitive filtering.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ucid` | string | — | Unique instance ID. Always set first in WebPanel. |
| `Placeholder` | string | `"Search..."` | Input placeholder text |
| `Items` | string | `"[]"` | JSON array: `[{"id": "...", "label": "...", "url": "..."}]` |
| `ItemSelected` | string | `""` | Set by the UC when user selects a result. Read in `OnSelect`. |

## Events

| Event | When fired |
|-------|-----------|
| `OnSelect` | When the user clicks or presses Enter on a search result |

## Items JSON Format

```json
[
  {"id": "dashboard",  "label": "Dashboard",           "url": "/dashboard"},
  {"id": "sales",      "label": "Sales Report",         "url": "/sales/report"},
  {"id": "customers",  "label": "Customer List",        "url": "/customers"},
  {"id": "settings",   "label": "Account Settings",     "url": "/settings"}
]
```

The `url` field is optional. If provided, the UC navigates to it automatically when selected. If omitted, only `OnSelect` fires.

## WebPanel Integration

```genexus
Event Start
    Do 'BuildNavSearch'
EndEvent

Sub 'BuildNavSearch'
    UCNavSearch1.ucid        = !'nav-search'
    UCNavSearch1.Placeholder = "Search menus..."

    // Build items from database/SDT
    For Each TrnMenu
        &SdtItem.Id    = TrnMenu.MenuId.ToString()
        &SdtItem.Label = TrnMenu.MenuLabel
        &SdtItem.Url   = TrnMenu.MenuUrl
        &SdtItems.Add(&SdtItem)
    EndFor
    UCNavSearch1.Items = &SdtItems.ToJson()
EndSub

Event UCNavSearch1.OnSelect
    &SelectedId = UCNavSearch1.ItemSelected
    // Optional: log access, highlight selected item, etc.
EndEvent
```

## Expected Behavior

- Empty state: shows placeholder text, dropdown hidden
- Typing: filters items in real-time (accent-insensitive, case-insensitive)
- Matching items shown in dropdown; "No results" shown if no match
- Clicking item or pressing Enter: fires `OnSelect`, navigates to `url` if present
- Keyboard: ArrowDown/ArrowUp to navigate dropdown items, Escape to close
- Clicking outside closes the dropdown

## Notes

- CSS prefix: `navsearch-` (classes: `.navsearch`, `.navsearch__input`, `.navsearch__item`, etc.)
- Accent-insensitive search: "sao" matches "São Paulo"
- `SDT.ToJson()` must be used in GeneXus — never manual concatenation
- Max dropdown height: 280px with overflow scroll
- Replace hardcoded color values with your project's DSO tokens if embedding in a token-driven DSO
