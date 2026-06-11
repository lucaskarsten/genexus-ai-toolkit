# UcToastNotification

An inline toast notification component. Supports four types (success, error, warning, info), auto-dismiss after a configurable duration, and a dismiss button.

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ucid` | string | — | Unique instance ID. Always set first in WebPanel. |
| `Message` | string | `""` | The notification text to display |
| `Type` | string | `"info"` | Visual variant: `success`, `error`, `warning`, or `info` |
| `Duration` | string | `"4000"` | Auto-dismiss delay in milliseconds. Set to `"0"` to disable auto-dismiss. |

## Events

| Event | When fired |
|-------|-----------|
| `OnDismiss` | When the toast is dismissed (by button click or auto-timeout) |

## Methods

| Method | Description |
|--------|-------------|
| `Show` | Programmatically show the toast |
| `Hide` | Programmatically hide the toast |

## WebPanel Integration

### Show a success toast after an action

```genexus
Event Start
    UCToastNotification1.ucid     = !'toast-save'
    UCToastNotification1.Message  = "Record saved successfully"
    UCToastNotification1.Type     = !'success'
    UCToastNotification1.Duration = !'3000'
EndEvent

// Show after save
Sub 'SaveRecord'
    // ... save logic ...
    If not &Errors
        UCToastNotification1.Message = "Saved successfully"
        UCToastNotification1.Type    = !'success'
        UCToastNotification1.Show()
    Else
        UCToastNotification1.Message = "Save failed. Check the errors."
        UCToastNotification1.Type    = !'error'
        UCToastNotification1.Duration = !'0'  // don't auto-dismiss errors
        UCToastNotification1.Show()
    EndIf
EndSub

Event UCToastNotification1.OnDismiss
    // Optional: log dismiss, clean up, etc.
EndEvent
```

## Type Variants

| Type | Color | Use case |
|------|-------|----------|
| `success` | Green | Operation completed successfully |
| `error` | Red | Operation failed, validation error |
| `warning` | Orange | Non-critical warning, confirm action |
| `info` | Blue | Informational message |

## Expected Behavior

- Toast is hidden by default (`hidden` attribute)
- Setting `Message` in `AfterShow` and calling `Show()` makes it visible
- After `Duration` ms, it auto-dismisses and fires `OnDismiss`
- Clicking the `×` button also dismisses and fires `OnDismiss`
- Setting `Duration` to `"0"` disables auto-dismiss
- The icon placeholder (`&#9432;`) can be replaced with your icon system

## Notes

- CSS prefix: `toast-` (classes: `.toast`, `.toast__message`, `.toast__dismiss`, etc.)
- Uses CSS transitions for show/hide animation
- `role="alert"` + `aria-live="assertive"` for accessibility
- Positioning (fixed/absolute for floating toasts) should be added by the parent WebPanel's CSS — this UC renders inline by default
