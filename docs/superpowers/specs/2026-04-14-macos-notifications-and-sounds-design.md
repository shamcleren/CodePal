# macOS Notifications And Sounds — Design Spec

## Overview

Add native macOS notifications and optional system sounds when a session undergoes a key state transition. Notifications are enabled by default; sounds are disabled by default. Clicking a notification activates the CodePal window and scrolls to the relevant session.

This is the first v1.1.0 feature. It has no external blockers and can be implemented entirely within the main process and settings layer.

## Trigger States

| Transition | Notification title (zh-CN) | Notification title (en) | System sound | Condition |
|---|---|---|---|---|
| any → `completed` | "{tool} 任务完成" | "{tool} task completed" | `Glass` | Previous status was `running` or `waiting` |
| any → `waiting` | "{tool} 等待决策" | "{tool} waiting for decision" | `Ping` | Session has at least one pending action |
| any → `error` | "{tool} 任务出错" | "{tool} task errored" | `Basso` | Previous status was `running` or `waiting` |
| `idle` → `running` | "{tool} 恢复活动" | "{tool} resumed" | `Tink` | Previous status was specifically `idle` |

`{tool}` is the display name of the agent (e.g. "Cursor", "Claude Code", "Codex", "CodeBuddy").

Notification body: the session title when available, empty otherwise.

## Debounce

Same session + same target status must not produce repeated notifications within a 30-second cooldown window.

Implementation: a `Map<string, number>` keyed by `{sessionId}:{targetStatus}`, storing the last notification timestamp in milliseconds. Before sending a notification, check whether `Date.now() - lastTimestamp < 30_000`. Stale entries are cleaned up lazily or on a periodic sweep.

## Settings Model

Extend `AppSettings` with a new `notifications` key:

```typescript
type NotificationSettings = {
  enabled: boolean;        // master switch, default true
  soundEnabled: boolean;   // sound switch, default false
  completed: boolean;      // per-state toggle, default true
  waiting: boolean;        // default true
  error: boolean;          // default true
  resumed: boolean;        // idle → running, default true
};
```

Defaults:

```typescript
const defaultNotificationSettings: NotificationSettings = {
  enabled: true,
  soundEnabled: false,
  completed: true,
  waiting: true,
  error: true,
  resumed: true,
};
```

Settings patch type adds `notifications?: Partial<NotificationSettings>` to `AppSettingsPatch`.

The `normalizeAppSettings`, `cloneAppSettings`, and `mergeAppSettings` functions must handle the new key following the same defensive pattern used by `display` and `history`.

Settings version stays at `1`; the new key is additive and has safe defaults when absent.

## Architecture

### New module

`src/main/notification/notificationService.ts`

Single factory function:

```typescript
function createNotificationService(deps: {
  settingsService: SettingsService;
  getMainWindow: () => BrowserWindow | null;
}): NotificationService;
```

Returned interface:

```typescript
interface NotificationService {
  onSessionStateChange(params: {
    sessionId: string;
    tool: string;
    prevStatus: SessionStatus | undefined;
    nextStatus: SessionStatus;
    title?: string;
  }): void;
}
```

Responsibilities:

1. Read current `NotificationSettings` from `settingsService`.
2. Check master switch → check per-state switch → check debounce.
3. If all checks pass, create and show an `electron.Notification`.
4. If `soundEnabled`, play the mapped macOS system sound via a spawned `afplay /System/Library/Sounds/{name}.aiff` call (lightweight, no native module needed).
5. On notification `click`, call `mainWindow.show()` + `mainWindow.webContents.send('codepal:focus-session', sessionId)`.

### Hook point in main.ts

After `sessionStore.applyEvent(event)` at the existing event handling block (current lines 322-326):

```typescript
const prevStatus = prevSession?.status;
const nextSession = sessionStore.getSession(event.sessionId);
if (nextSession && prevStatus !== nextSession.status) {
  notificationService.onSessionStateChange({
    sessionId: event.sessionId,
    tool: event.tool,
    prevStatus,
    nextStatus: nextSession.status,
    title: nextSession.title,
  });
}
```

This reads the previous status before `applyEvent` mutates the store, then compares after. The notification call is non-blocking and does not affect the existing broadcast or history-write flow.

### Sound playback

Use `child_process.execFile('afplay', [soundPath])` with the system sound path `/System/Library/Sounds/{name}.aiff`. This avoids adding native dependencies. The process is fire-and-forget; errors are logged but do not affect notification delivery.

Mapping:

| State | Sound file |
|---|---|
| completed | `/System/Library/Sounds/Glass.aiff` |
| waiting | `/System/Library/Sounds/Ping.aiff` |
| error | `/System/Library/Sounds/Basso.aiff` |
| resumed | `/System/Library/Sounds/Tink.aiff` |

### Click-to-focus flow

```
Notification click callback
  → mainWindow.show() + mainWindow.focus()
  → mainWindow.webContents.send('codepal:focus-session', sessionId)
  → renderer listens on 'codepal:focus-session'
  → scrolls to and expands the matching session row
```

Renderer-side: add an IPC listener in the session list component. On receiving `sessionId`, find the matching row, expand it, and call `scrollIntoView({ block: 'end', inline: 'nearest' })` (reusing the existing expanded-session scroll pattern).

Preload bridge: expose `'codepal:focus-session'` as an allowed receive channel.

## Settings UI

Add a new section in the settings panel, placed after the existing "面板显示" / "Display" group:

**Section title:** "通知" / "Notifications"

Contents:

- Toggle: 通知总开关 / Enable notifications (master)
- Toggle: 声音 / Sound (only visible when master is on)
- Four toggles (only visible when master is on):
  - 任务完成 / Task completed
  - 等待决策 / Waiting for decision
  - 任务出错 / Task errored
  - 恢复活动 / Resumed activity

When the master switch is off, the per-state toggles and sound toggle are hidden to reduce visual noise.

## i18n

All notification titles and settings labels need entries in both `en` and `zh-CN` translation files, following the existing i18n pattern.

## Testing

### Unit tests

- `notificationService` debounce logic: same session + same status within 30s → suppressed; after 30s → allowed.
- `notificationService` state matching: only the four defined transitions trigger notifications; other transitions (e.g. `offline → running`) do not.
- `notificationService` settings respect: master off → no notification; per-state off → no notification for that state; sound off → notification sent but no sound.
- Mock `electron.Notification` and `child_process.execFile` to verify calls without side effects.

### Settings tests

- `normalizeNotificationSettings` handles missing, partial, and invalid input.
- `mergeAppSettings` with notification patch round-trips correctly.
- Settings YAML persistence includes the new `notifications` key.

### Manual verification

- Trigger each of the four state transitions with a real agent and verify notification appears.
- Verify sound plays when enabled and does not play when disabled.
- Verify click on notification activates window and scrolls to correct session.
- Verify debounce suppresses repeated notifications within 30 seconds.

## Files to create or modify

### New files

- `src/main/notification/notificationService.ts` — notification service module
- `src/main/notification/__tests__/notificationService.test.ts` — unit tests

### Modified files

- `src/shared/appSettings.ts` — add `NotificationSettings` type, defaults, normalize/clone/merge
- `src/main/main.ts` — import and wire notification service, capture prevStatus before applyEvent
- `src/preload/index.ts` — expose `codepal:focus-session` channel
- `src/renderer/` — add focus-session IPC listener, scroll-to-session logic
- `src/renderer/` — add notification settings section in settings panel
- i18n translation files — add notification-related strings

## Out of scope

- Per-agent notification control (future version if needed)
- Custom sound files or brand sounds
- Do Not Disturb detection (macOS handles this at the system level)
- Notification grouping or stacking
- Action buttons on notifications (e.g. inline Allow/Deny)
