# UcUserMenu

An avatar + name button that opens a dropdown panel with user information and action buttons (Settings, Sign Out).

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ucid` | string | — | Unique instance ID. Always set first in WebPanel. |
| `UserName` | string | `""` | Full name displayed in trigger and panel |
| `UserEmail` | string | `""` | Email address shown in the dropdown header |
| `AvatarUrl` | string | `""` | URL to the user's avatar image. If empty, shows the first letter of UserName. |

## Events

| Event | When fired |
|-------|-----------|
| `OnLogout` | When the user clicks "Sign Out" |
| `OnSettings` | When the user clicks "Settings" |

## WebPanel Integration

```genexus
Event Start
    Do 'BuildUserMenu'
EndEvent

Sub 'BuildUserMenu'
    UCUserMenu1.ucid      = !'header-user-menu'
    UCUserMenu1.UserName  = &LoggedUserName
    UCUserMenu1.UserEmail = &LoggedUserEmail
    UCUserMenu1.AvatarUrl = &LoggedUserAvatarUrl
EndSub

Event UCUserMenu1.OnLogout
    // Handle logout: clear session, redirect to login, etc.
    WebSession.Clear()
    WbpLogin.Call()
EndEvent

Event UCUserMenu1.OnSettings
    WbpUserSettings.Popup()
EndEvent
```

## Expected Behavior

- Shows avatar (image or initial letter fallback) + name + chevron
- Clicking opens a panel with full name, email, and action buttons
- Clicking outside or scrolling closes the panel
- Keyboard accessible: Enter/Space to toggle, Escape to close
- Multiple instances work independently (different `ucid` values)

## Notes

- CSS prefix: `usermenu-` (classes: `.usermenu`, `.usermenu__trigger`, `.usermenu__avatar`, etc.)
- Avatar fallback uses first character of `UserName` on a blue background
- "Sign Out" button is styled in red (danger variant)
- Replace hardcoded color values with your project's DSO tokens if embedding in a token-driven DSO
