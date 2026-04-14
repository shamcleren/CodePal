# macOS Notifications And Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native macOS notifications with optional system sounds when session state transitions to completed, waiting, error, or resumed-from-idle, with click-to-focus behavior.

**Architecture:** A new `notificationService` module in the main process listens for session state changes after `sessionStore.applyEvent()`, checks settings and debounce, then fires Electron `Notification` + optional `afplay` sound. Clicking a notification sends a new IPC channel `codepal:focus-session` to the renderer, which expands and scrolls to the target session. Settings are extended with a `notifications` key persisted via the existing YAML settings service.

**Tech Stack:** Electron Notification API, Node.js `child_process.execFile` (afplay), Vitest, React (settings UI)

---

### Task 1: Extend AppSettings with NotificationSettings

**Files:**
- Modify: `src/shared/appSettings.ts`
- Modify: `src/main/settings/settingsService.test.ts`

- [ ] **Step 1: Write the failing test — notification settings survive round-trip**

Add to `src/main/settings/settingsService.test.ts`:

```typescript
it("round-trips notification settings through normalize", () => {
  const { normalizeAppSettings } = require("../../shared/appSettings");
  const result = normalizeAppSettings({
    version: 1,
    notifications: {
      enabled: false,
      soundEnabled: true,
      completed: false,
      waiting: true,
      error: true,
      resumed: false,
    },
  });
  expect(result.notifications).toEqual({
    enabled: false,
    soundEnabled: true,
    completed: false,
    waiting: true,
    error: true,
    resumed: false,
  });
});

it("fills default notification settings when key is missing", () => {
  const { normalizeAppSettings } = require("../../shared/appSettings");
  const result = normalizeAppSettings({ version: 1 });
  expect(result.notifications).toEqual({
    enabled: true,
    soundEnabled: false,
    completed: true,
    waiting: true,
    error: true,
    resumed: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/settings/settingsService.test.ts`
Expected: FAIL — `result.notifications` is `undefined`

- [ ] **Step 3: Add NotificationSettings type and defaults to appSettings.ts**

Add to `src/shared/appSettings.ts`, after the `HistorySettings` type and before the `AppSettings` type:

```typescript
export type NotificationSettings = {
  enabled: boolean;
  soundEnabled: boolean;
  completed: boolean;
  waiting: boolean;
  error: boolean;
  resumed: boolean;
};

export const defaultNotificationSettings: NotificationSettings = {
  enabled: true,
  soundEnabled: false,
  completed: true,
  waiting: true,
  error: true,
  resumed: true,
};
```

Add `notifications: NotificationSettings` to the `AppSettings` type:

```typescript
export type AppSettings = {
  version: 1;
  locale: AppLocale;
  display: UsageDisplaySettings;
  history: HistorySettings;
  notifications: NotificationSettings;
  codebuddy: {
    code: CodeBuddyEndpointSettings;
    enterprise: CodeBuddyEndpointSettings;
  };
};
```

Add `notifications?: Partial<NotificationSettings>` to `AppSettingsPatch`.

Add `notifications: { ...defaultNotificationSettings }` to `defaultAppSettings`.

Add `notifications: { ...settings.notifications }` to `cloneAppSettings`.

Add a `normalizeNotificationSettings` function:

```typescript
function normalizeNotificationSettings(value: unknown): NotificationSettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return { ...defaultNotificationSettings };
  }
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : defaultNotificationSettings.enabled,
    soundEnabled:
      typeof candidate.soundEnabled === "boolean"
        ? candidate.soundEnabled
        : defaultNotificationSettings.soundEnabled,
    completed:
      typeof candidate.completed === "boolean"
        ? candidate.completed
        : defaultNotificationSettings.completed,
    waiting:
      typeof candidate.waiting === "boolean"
        ? candidate.waiting
        : defaultNotificationSettings.waiting,
    error:
      typeof candidate.error === "boolean"
        ? candidate.error
        : defaultNotificationSettings.error,
    resumed:
      typeof candidate.resumed === "boolean"
        ? candidate.resumed
        : defaultNotificationSettings.resumed,
  };
}
```

Wire it into `normalizeAppSettings`:

```typescript
const notifications = normalizeNotificationSettings(candidate.notifications);
```

And include `notifications` in the returned object.

Wire it into `mergeAppSettings`:

```typescript
notifications: {
  ...current.notifications,
  ...(incoming.notifications ?? {}),
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/settings/settingsService.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite and lint**

Run: `npm test && npm run lint`
Expected: All pass. Some existing tests that snapshot `defaultAppSettings` may need the new `notifications` key added — fix any that fail.

- [ ] **Step 6: Commit**

```bash
git add src/shared/appSettings.ts src/main/settings/settingsService.test.ts
git commit -m "feat: add NotificationSettings to AppSettings"
```

---

### Task 2: Create notificationService with debounce and state matching

**Files:**
- Create: `src/main/notification/notificationService.ts`
- Create: `src/main/notification/notificationService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/notification/notificationService.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotificationService } from "./notificationService";
import type { NotificationSettings } from "../../shared/appSettings";
import { defaultNotificationSettings } from "../../shared/appSettings";

// Mock electron Notification
const mockShow = vi.fn();
const mockOn = vi.fn();
const MockNotification = vi.fn().mockImplementation(() => ({
  show: mockShow,
  on: mockOn,
}));
vi.mock("electron", () => ({
  Notification: MockNotification,
}));

// Mock child_process
const mockExecFile = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

function makeSettings(overrides?: Partial<NotificationSettings>): NotificationSettings {
  return { ...defaultNotificationSettings, ...overrides };
}

describe("notificationService", () => {
  let getSettings: ReturnType<typeof vi.fn>;
  let getMainWindow: ReturnType<typeof vi.fn>;
  let service: ReturnType<typeof createNotificationService>;

  beforeEach(() => {
    vi.clearAllMocks();
    getSettings = vi.fn(() => makeSettings());
    getMainWindow = vi.fn(() => null);
    service = createNotificationService({
      getNotificationSettings: getSettings,
      getMainWindow,
    });
  });

  it("sends notification on running → completed", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
      title: "Fix bug",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
    expect(MockNotification.mock.calls[0][0]).toMatchObject({
      title: expect.stringContaining("Cursor"),
      body: "Fix bug",
    });
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it("sends notification on running → waiting", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "claude",
      prevStatus: "running",
      nextStatus: "waiting",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it("sends notification on running → error", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "codex",
      prevStatus: "running",
      nextStatus: "error",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it("sends notification on idle → running (resumed)", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "codebuddy",
      prevStatus: "idle",
      nextStatus: "running",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it("does NOT notify on offline → running (not a resume)", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "offline",
      nextStatus: "running",
    });
    expect(MockNotification).not.toHaveBeenCalled();
  });

  it("does NOT notify when prevStatus is undefined (new session)", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: undefined,
      nextStatus: "running",
    });
    expect(MockNotification).not.toHaveBeenCalled();
  });

  it("suppresses duplicate notification within 30s debounce", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it("allows notification after debounce expires", () => {
    vi.useFakeTimers();
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    vi.advanceTimersByTime(31_000);
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(MockNotification).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("respects master switch off", () => {
    getSettings.mockReturnValue(makeSettings({ enabled: false }));
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(MockNotification).not.toHaveBeenCalled();
  });

  it("respects per-state switch off", () => {
    getSettings.mockReturnValue(makeSettings({ completed: false }));
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(MockNotification).not.toHaveBeenCalled();
  });

  it("plays sound when soundEnabled is true", () => {
    getSettings.mockReturnValue(makeSettings({ soundEnabled: true }));
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExecFile.mock.calls[0][0]).toBe("afplay");
    expect(mockExecFile.mock.calls[0][1][0]).toContain("Glass.aiff");
  });

  it("does NOT play sound when soundEnabled is false", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/notification/notificationService.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement notificationService.ts**

Create `src/main/notification/notificationService.ts`:

```typescript
import { Notification } from "electron";
import { execFile } from "node:child_process";
import type { NotificationSettings } from "../../shared/appSettings";
import type { SessionStatus } from "../../shared/sessionTypes";
import type { BrowserWindow } from "electron";

const DEBOUNCE_MS = 30_000;

const KNOWN_TOOL_LABELS: Record<string, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  codebuddy: "CodeBuddy",
  goland: "GoLand",
  pycharm: "PyCharm",
  jetbrains: "JetBrains",
};

type NotifiableTransition = {
  settingsKey: keyof Pick<NotificationSettings, "completed" | "waiting" | "error" | "resumed">;
  titleZh: string;
  titleEn: string;
  sound: string;
};

function classifyTransition(
  prevStatus: SessionStatus | undefined,
  nextStatus: SessionStatus,
): NotifiableTransition | null {
  if (prevStatus === undefined) return null;
  if (prevStatus === nextStatus) return null;

  if (nextStatus === "completed" && (prevStatus === "running" || prevStatus === "waiting")) {
    return {
      settingsKey: "completed",
      titleZh: "任务完成",
      titleEn: "task completed",
      sound: "Glass",
    };
  }
  if (nextStatus === "waiting" && (prevStatus === "running" || prevStatus === "completed")) {
    return {
      settingsKey: "waiting",
      titleZh: "等待决策",
      titleEn: "waiting for decision",
      sound: "Ping",
    };
  }
  if (nextStatus === "error" && (prevStatus === "running" || prevStatus === "waiting")) {
    return {
      settingsKey: "error",
      titleZh: "任务出错",
      titleEn: "task errored",
      sound: "Basso",
    };
  }
  if (nextStatus === "running" && prevStatus === "idle") {
    return {
      settingsKey: "resumed",
      titleZh: "恢复活动",
      titleEn: "resumed",
      sound: "Tink",
    };
  }
  return null;
}

function toolLabel(tool: string): string {
  return KNOWN_TOOL_LABELS[tool] ?? tool.charAt(0).toUpperCase() + tool.slice(1);
}

export interface NotificationService {
  onSessionStateChange(params: {
    sessionId: string;
    tool: string;
    prevStatus: SessionStatus | undefined;
    nextStatus: SessionStatus;
    title?: string;
  }): void;
}

export function createNotificationService(deps: {
  getNotificationSettings: () => NotificationSettings;
  getMainWindow: () => BrowserWindow | null;
}): NotificationService {
  const lastNotified = new Map<string, number>();

  return {
    onSessionStateChange({ sessionId, tool, prevStatus, nextStatus, title }) {
      const settings = deps.getNotificationSettings();
      if (!settings.enabled) return;

      const transition = classifyTransition(prevStatus, nextStatus);
      if (!transition) return;
      if (!settings[transition.settingsKey]) return;

      const debounceKey = `${sessionId}:${transition.settingsKey}`;
      const now = Date.now();
      const last = lastNotified.get(debounceKey);
      if (last !== undefined && now - last < DEBOUNCE_MS) return;
      lastNotified.set(debounceKey, now);

      const label = toolLabel(tool);
      const notification = new Notification({
        title: `${label} ${transition.titleZh}`,
        body: title ?? "",
        silent: true,
      });

      notification.on("click", () => {
        const win = deps.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          win.webContents.send("codepal:focus-session", sessionId);
        }
      });

      notification.show();

      if (settings.soundEnabled) {
        const soundPath = `/System/Library/Sounds/${transition.sound}.aiff`;
        execFile("afplay", [soundPath], (err) => {
          if (err) {
            console.warn("[CodePal Notification] sound playback failed:", err.message);
          }
        });
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/notification/notificationService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/notification/notificationService.ts src/main/notification/notificationService.test.ts
git commit -m "feat: add notificationService with debounce and state matching"
```

---

### Task 3: Wire notificationService into main.ts

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Step 1: Import and create the notification service**

At the top of `src/main/main.ts`, add the import after the existing imports:

```typescript
import { createNotificationService } from "./notification/notificationService";
```

After the existing `const usageStore = createUsageStore();` line (around line 39), add:

```typescript
const notificationService = createNotificationService({
  getNotificationSettings: () => settingsService.getSettings().notifications,
  getMainWindow: () => mainWindow,
});
```

Note: `settingsService` is created later in the file inside `app.whenReady()`. The notification service creation must be moved inside `app.whenReady()` after `settingsService` is created, or the `getNotificationSettings` callback must use a late-binding reference. Check where `settingsService` is created and place the notification service creation right after it.

- [ ] **Step 2: Capture prevStatus before applyEvent and call notification service**

In the `wireIpcHub` function, modify the event handling block (around line 321-336). Before the `sessionStore.applyEvent(event)` call, capture the previous status:

```typescript
const event = lineToSessionEvent(line);
if (event) {
  const prevSession = sessionStore.getSession(event.sessionId);
  const prevStatus = prevSession?.status;
  sessionStore.applyEvent(event);
  integrationService.recordEvent(event.tool, event.status, event.timestamp);
  sessionBroadcastScheduler.request();
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
  const session = nextSession ?? undefined;
  if (!historyWriter) {
    return;
  }
  queueAcceptedSessionEventWrite({
    historyWriter,
    event,
    session,
    persistenceEnabled: settingsService.getSettings().history.persistenceEnabled,
  });
}
```

- [ ] **Step 3: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: wire notificationService into main event loop"
```

---

### Task 4: Add focus-session IPC channel to preload bridge

**Files:**
- Modify: `src/main/preload/index.ts`
- Modify: `src/main/preload/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/main/preload/index.test.ts`:

```typescript
it("exposes onFocusSession listener", () => {
  require("./index");
  const exposed = (contextBridge.exposeInMainWorld as ReturnType<typeof vi.fn>).mock.calls[0][1];
  const handler = vi.fn();
  exposed.onFocusSession(handler);
  expect(ipcRenderer.on).toHaveBeenCalledWith("codepal:focus-session", expect.any(Function));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/preload/index.test.ts`
Expected: FAIL — `exposed.onFocusSession is not a function`

- [ ] **Step 3: Add onFocusSession to preload bridge**

Add to the `contextBridge.exposeInMainWorld("codepal", { ... })` block in `src/main/preload/index.ts`, after the `onOpenSettings` method:

```typescript
onFocusSession(handler: (sessionId: string) => void) {
  const channel = "codepal:focus-session";
  const listener = (
    _event: Electron.IpcRendererEvent,
    sessionId: string,
  ) => {
    handler(sessionId);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/preload/index.test.ts`
Expected: PASS

- [ ] **Step 5: Update the global type declaration for `window.codepal`**

Find the file that declares the `window.codepal` type (likely in `src/renderer/` or `src/shared/`). Add the new method:

```typescript
onFocusSession(handler: (sessionId: string) => void): () => void;
```

- [ ] **Step 6: Commit**

```bash
git add src/main/preload/index.ts src/main/preload/index.test.ts
git commit -m "feat: add focus-session IPC channel to preload bridge"
```

---

### Task 5: Add focus-session handler in renderer SessionList

**Files:**
- Modify: `src/renderer/components/SessionList.tsx`

- [ ] **Step 1: Add useEffect to listen for focus-session IPC**

In `SessionList.tsx`, add a `useEffect` that listens for the `codepal:focus-session` channel and expands + scrolls to the target session:

```typescript
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Inside the SessionList component, after the existing useLayoutEffect:

useEffect(() => {
  const cleanup = window.codepal.onFocusSession((sessionId: string) => {
    setExpandedSessionId(sessionId);
  });
  return cleanup;
}, []);
```

The existing `useLayoutEffect` already handles scrolling to the expanded session, so setting `expandedSessionId` is sufficient.

- [ ] **Step 2: Run build to verify types**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SessionList.tsx
git commit -m "feat: handle focus-session IPC to expand and scroll to session"
```

---

### Task 6: Add i18n strings for notification settings

**Files:**
- Modify: `src/renderer/i18n.tsx`

- [ ] **Step 1: Add zh-CN notification strings**

Add to the `ZH_CN_MESSAGES` dictionary in `src/renderer/i18n.tsx`:

```typescript
"notifications.section": "通知",
"notifications.title": "通知",
"notifications.subtitle": "管理 session 状态变化时的系统通知和声音提示。",
"notifications.enabled": "启用通知",
"notifications.soundEnabled": "播放声音",
"notifications.completed": "任务完成",
"notifications.waiting": "等待决策",
"notifications.error": "任务出错",
"notifications.resumed": "恢复活动",
"settings.nav.notifications.eyebrow": "通知",
"settings.nav.notifications.description": "管理状态变化的系统通知和声音。",
"settings.summary.notifications": "通知与声音偏好。",
```

- [ ] **Step 2: Add en notification strings**

Add to the `EN_MESSAGES` dictionary:

```typescript
"notifications.section": "Notifications",
"notifications.title": "Notifications",
"notifications.subtitle": "Manage system notifications and sounds for session state changes.",
"notifications.enabled": "Enable notifications",
"notifications.soundEnabled": "Play sounds",
"notifications.completed": "Task completed",
"notifications.waiting": "Waiting for decision",
"notifications.error": "Task errored",
"notifications.resumed": "Resumed activity",
"settings.nav.notifications.eyebrow": "Notifications",
"settings.nav.notifications.description": "Manage notifications and sounds for state changes.",
"settings.summary.notifications": "Notification and sound preferences.",
```

- [ ] **Step 3: Run build to verify no missing keys**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n.tsx
git commit -m "feat: add i18n strings for notification settings"
```

---

### Task 7: Create NotificationPreferencesPanel component

**Files:**
- Create: `src/renderer/components/NotificationPreferencesPanel.tsx`
- Create: `src/renderer/components/NotificationPreferencesPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/NotificationPreferencesPanel.test.tsx`:

```typescript
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";
import { I18nProvider } from "../i18n";
import { defaultNotificationSettings } from "../../shared/appSettings";

describe("NotificationPreferencesPanel", () => {
  it("renders all notification toggles", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <NotificationPreferencesPanel
          settings={defaultNotificationSettings}
          onUpdate={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("通知");
    expect(html).toContain("启用通知");
    expect(html).toContain("播放声音");
    expect(html).toContain("任务完成");
    expect(html).toContain("等待决策");
    expect(html).toContain("任务出错");
    expect(html).toContain("恢复活动");
  });

  it("hides per-state toggles when master switch is off", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <NotificationPreferencesPanel
          settings={{ ...defaultNotificationSettings, enabled: false }}
          onUpdate={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("启用通知");
    expect(html).not.toContain("播放声音");
    expect(html).not.toContain("任务完成");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/NotificationPreferencesPanel.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement NotificationPreferencesPanel**

Create `src/renderer/components/NotificationPreferencesPanel.tsx`:

```tsx
import type { NotificationSettings } from "../../shared/appSettings";
import { useI18n } from "../i18n";

type NotificationPreferencesPanelProps = {
  settings: NotificationSettings;
  onUpdate: (patch: Partial<NotificationSettings>) => void;
  showHeader?: boolean;
};

const STATE_TOGGLES: Array<{
  key: keyof Pick<NotificationSettings, "completed" | "waiting" | "error" | "resumed">;
  i18nKey: string;
}> = [
  { key: "completed", i18nKey: "notifications.completed" },
  { key: "waiting", i18nKey: "notifications.waiting" },
  { key: "error", i18nKey: "notifications.error" },
  { key: "resumed", i18nKey: "notifications.resumed" },
];

export function NotificationPreferencesPanel({
  settings,
  onUpdate,
  showHeader = true,
}: NotificationPreferencesPanelProps) {
  const { t } = useI18n();

  return (
    <section className="display-panel" aria-label={t("notifications.section")}>
      {showHeader ? (
        <div className="display-panel__header">
          <div className="display-panel__title">{t("notifications.title")}</div>
          <div className="display-panel__subtitle">{t("notifications.subtitle")}</div>
        </div>
      ) : null}

      <div className="display-panel__grid">
        <div className="display-panel__card">
          <label className="display-panel__toggle">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => onUpdate({ enabled: e.target.checked })}
            />
            <span>{t("notifications.enabled")}</span>
          </label>
        </div>

        {settings.enabled ? (
          <>
            <div className="display-panel__card">
              <label className="display-panel__toggle">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => onUpdate({ soundEnabled: e.target.checked })}
                />
                <span>{t("notifications.soundEnabled")}</span>
              </label>
            </div>

            <div className="display-panel__card">
              <div className="display-panel__agents">
                {STATE_TOGGLES.map(({ key, i18nKey }) => (
                  <label key={key} className="display-panel__toggle">
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) => onUpdate({ [key]: e.target.checked })}
                    />
                    <span>{t(i18nKey)}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/NotificationPreferencesPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/NotificationPreferencesPanel.tsx src/renderer/components/NotificationPreferencesPanel.test.tsx
git commit -m "feat: add NotificationPreferencesPanel component"
```

---

### Task 8: Wire notification settings section into App.tsx settings panel

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add notifications section to settingsSections array**

Import the component at the top of `App.tsx`:

```typescript
import { NotificationPreferencesPanel } from "./components/NotificationPreferencesPanel";
```

Add a new entry to the `settingsSections` array, after the `display` entry:

```typescript
{
  id: "notifications",
  label: i18n.t("notifications.title"),
  eyebrow: i18n.t("settings.nav.notifications.eyebrow"),
  summary: i18n.t("settings.summary.notifications"),
},
```

- [ ] **Step 2: Add the conditional render block**

After the `{activeSettingsSection === "display" ? ( ... ) : null}` block, add:

```tsx
{activeSettingsSection === "notifications" ? (
  <NotificationPreferencesPanel
    showHeader={false}
    settings={appSettings.notifications}
    onUpdate={(patch) =>
      void updateAppSettings({
        notifications: {
          ...appSettings.notifications,
          ...patch,
        },
      })
    }
  />
) : null}
```

- [ ] **Step 3: Run build and lint**

Run: `npm run build && npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire notification preferences into settings panel"
```

---

### Task 9: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Start the app in dev mode (`npm run dev`) and verify:

1. Open Settings → Notifications section appears between Display and Usage
2. Master toggle is ON by default, sound toggle is OFF
3. All four state toggles are visible when master is ON
4. Turning master OFF hides sound and state toggles
5. Toggle persistence: change a setting, close and reopen settings, setting persists

- [ ] **Step 5: Commit any final fixes if needed**

```bash
git add -A
git commit -m "chore: final integration fixes for notification feature"
```
