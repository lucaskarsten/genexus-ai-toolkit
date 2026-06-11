# UcDropdownMenu

A button with a collapsible dropdown panel. Items are loaded from a JSON array. Fires a `OnItemClick` event when the user selects an item.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ucid` | string | — | Unique instance ID. Always set first in WebPanel. |
| `Label` | string | `"Options"` | Button label text |
| `Items` | string | `"[]"` | JSON array of items: `[{"id": "...", "label": "..."}]` |
| `ItemSelected` | string | `""` | Populated by the UC when an item is clicked. Read in the `OnItemClick` event via `&EventParam` or `UCDropdownMenu1.ItemSelected`. |

## Events

| Event | When fired |
|-------|-----------|
| `OnItemClick` | When the user clicks an item in the dropdown |

## Items JSON Format

```json
[
  {"id": "action-new",  "label": "New Item"},
  {"id": "action-copy", "label": "Duplicate"},
  {"id": "action-del",  "label": "Delete"}
]
```

## WebPanel Integration

```genexus
Event Start
    Do 'BuildDropdown'
EndEvent

Sub 'BuildDropdown'
    // 1. ucid ALWAYS first
    UCDropdownMenu1.ucid  = !'header-dropdown'
    UCDropdownMenu1.Label = "New"

    // 2. Build items via SDT
    &SdtItem.Id    = !'action-new'
    &SdtItem.Label = "New Record"
    &SdtItems.Add(&SdtItem)

    &SdtItem2.Id    = !'action-copy'
    &SdtItem2.Label = "Duplicate"
    &SdtItems.Add(&SdtItem2)

    UCDropdownMenu1.Items = &SdtItems.ToJson()
EndSub

Event UCDropdownMenu1.OnItemClick
    &SelectedAction = UCDropdownMenu1.ItemSelected
    Do Case
        Case &SelectedAction = !'action-new'
            WbpMyPanel.Popup()
        Case &SelectedAction = !'action-copy'
            Do 'DuplicateRecord'
    EndCase
EndEvent
```

## Expected Behavior

- Button renders with the `Label` text and a chevron icon
- Clicking the button opens the dropdown panel
- Clicking outside the panel, scrolling, or pressing Escape closes it
- Clicking an item: sets `ItemSelected` and fires `OnItemClick`
- If `Items` is empty (`[]`), the chevron is hidden
- Multiple instances on the same page work independently

## Notes

- CSS prefix is `dropdown-` (classes: `.dropdown`, `.dropdown__trigger`, `.dropdown__item`, etc.)
- All colors use hardcoded fallback values — replace with your DSO token references if using within a GeneXus DSO
- Keyboard accessible: Enter/Space to toggle, Escape to close
