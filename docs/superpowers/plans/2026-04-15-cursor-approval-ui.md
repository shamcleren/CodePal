# Cursor 审批 UI 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可以在 CodePal 中直接审批 Cursor 发出的待操作请求，包含 loading/success/error/retry 状态反馈、批量审批、以及新审批到来时的 macOS 系统通知。

**Architecture:** 在现有 IPC 路径（`codepal:action-response`）基础上新增反向结果通道（`codepal:action-response-result`），`dispatchActionResponse` 通过可选 callback 推送成功/失败结果；`sessionStore` 新增 `onPendingActionCreated` 回调供 `notificationService` 感知并触发系统通知；`SessionList` 检测会话 pendingCount 变化自动展开对应会话行；`SessionHistoryTimeline` 移除实验性门控并实现完整卡片状态机。

**Tech Stack:** TypeScript, React (useState/useEffect/useRef), Electron IPC, Vitest

---

## 文件改动清单

| 文件 | 操作 |
|------|------|
| `src/main/actionResponse/dispatchActionResponse.ts` | 修改：新增 `ActionResponseResult` 类型，添加可选 `emitResult` 回调参数 |
| `src/main/actionResponse/dispatchActionResponse.test.ts` | 修改：新增 emitResult 相关测试 |
| `src/main/session/sessionStore.ts` | 修改：`SessionStoreOptions` 新增 `onPendingActionCreated` 回调，applyEvent 后触发 |
| `src/main/session/sessionStore.test.ts` | 修改：新增 onPendingActionCreated 触发测试 |
| `src/main/notification/notificationService.ts` | 修改：`NotificationService` 接口新增 `onPendingActionCreated` 方法及实现 |
| `src/main/notification/notificationService.test.ts` | 修改：新增 pending action 通知测试 |
| `src/main/main.ts` | 修改：传 `emitResult` 回调给 dispatchActionResponse，wire `onPendingActionCreated` |
| `src/main/preload/index.ts` | 修改：暴露 `onActionResponseResult(cb)` |
| `src/renderer/components/SessionList.tsx` | 修改：自动展开 pendingCount 0→N 的会话，移除 `showExperimentalControls` prop 传递 |
| `src/renderer/components/SessionRow.tsx` | 修改：移除 `showExperimentalControls` prop |
| `src/renderer/components/SessionHistoryTimeline.tsx` | 修改：移除门控，实现 cardStates 状态机，添加 Allow All/Deny All |
| `src/renderer/components/SessionRow.test.tsx` | 修改：移除 showExperimentalControls 相关断言 |
| `src/renderer/components/SessionHistoryTimeline.test.ts` | 修改：新增 sending/success/error/retry 状态机测试 |
| `src/renderer/styles.css` | 修改：审批卡片状态样式 |

---

## Task 1: dispatchActionResponse — 新增 emitResult 回调

**Files:**
- Modify: `src/main/actionResponse/dispatchActionResponse.ts`
- Modify: `src/main/actionResponse/dispatchActionResponse.test.ts`

- [ ] **Step 1.1: 在 dispatchActionResponse.ts 顶部新增 ActionResponseResult 类型**

在文件顶部 import 区块后添加：

```typescript
export type ActionResponseResult = {
  sessionId: string;
  actionId: string;
  result: "success" | "error";
  option: string;
  error?: string;
};
```

- [ ] **Step 1.2: 给 dispatchActionResponse 添加可选 emitResult 参数**

修改函数签名，在 `option: string` 后新增一个参数：

```typescript
export async function dispatchActionResponse(
  sessionStore: ActionResponseSessionStore,
  fallbackTransport: ActionResponseTransport,
  broadcastSessions: () => void,
  sessionId: string,
  actionId: string,
  option: string,
  emitResult?: (result: ActionResponseResult) => void,
): Promise<boolean> {
```

- [ ] **Step 1.3: 在 try/catch 里调用 emitResult**

将现有的 `try { ... } finally { ... }` 改为：

```typescript
  try {
    const transport =
      prep.responseTarget !== undefined
        ? createActionResponseTransportFromResponseTarget(prep.responseTarget)
        : fallbackTransport;

    await transport.send(prep.line);
    sessionStore.closePendingAction(sessionId, actionId, "consumed_local");
    broadcastSessions();
    emitResult?.({ sessionId, actionId, result: "success", option });
    return true;
  } catch (err) {
    emitResult?.({
      sessionId,
      actionId,
      result: "error",
      option,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    inFlightPendingActionResponseKeys.delete(inFlightKey);
  }
```

- [ ] **Step 1.4: 写失败测试（先跑确认失败）**

在 `dispatchActionResponse.test.ts` 末尾添加：

```typescript
  it("when send succeeds: calls emitResult with success result", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
    });

    const transport = { send: vi.fn(async () => {}) };
    const broadcastSessions = vi.fn();
    const emitResult = vi.fn();

    await dispatchActionResponse(store, transport, broadcastSessions, "s1", "act-1", "Allow", emitResult);

    expect(emitResult).toHaveBeenCalledWith({
      sessionId: "s1",
      actionId: "act-1",
      result: "success",
      option: "Allow",
    });
  });

  it("when send fails: calls emitResult with error result then rethrows", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
    });

    const transport = { send: vi.fn(async () => { throw new Error("socket refused"); }) };
    const broadcastSessions = vi.fn();
    const emitResult = vi.fn();

    await expect(
      dispatchActionResponse(store, transport, broadcastSessions, "s1", "act-1", "Allow", emitResult),
    ).rejects.toThrow("socket refused");

    expect(emitResult).toHaveBeenCalledWith({
      sessionId: "s1",
      actionId: "act-1",
      result: "error",
      option: "Allow",
      error: "socket refused",
    });
  });

  it("when emitResult is omitted: does not throw", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
    });
    const transport = { send: vi.fn(async () => {}) };
    await expect(
      dispatchActionResponse(store, { send: transport.send }, vi.fn(), "s1", "act-1", "Allow"),
    ).resolves.toBe(true);
  });
```

- [ ] **Step 1.5: 跑测试确认通过**

```bash
npm test -- --run src/main/actionResponse/dispatchActionResponse.test.ts
```

Expected: all tests pass.

- [ ] **Step 1.6: 提交**

```bash
git add src/main/actionResponse/dispatchActionResponse.ts src/main/actionResponse/dispatchActionResponse.test.ts
git commit -m "feat: add emitResult callback to dispatchActionResponse for IPC feedback"
```

---

## Task 2: sessionStore — 新增 onPendingActionCreated 回调

**Files:**
- Modify: `src/main/session/sessionStore.ts`
- Modify: `src/main/session/sessionStore.test.ts`

- [ ] **Step 2.1: 新增 PendingActionCreated 类型并扩展 SessionStoreOptions**

在 `sessionStore.ts` 中找到 `SessionStatusChange` 和 `SessionStoreOptions` 类型（约第 661 行），在它们后面添加：

```typescript
export type PendingActionCreated = {
  sessionId: string;
  tool: string;
  pendingCount: number;
  title?: string;
  task?: string;
};
```

将 `SessionStoreOptions` 修改为：

```typescript
type SessionStoreOptions = {
  onStatusChange?: (change: SessionStatusChange) => void;
  onPendingActionCreated?: (params: PendingActionCreated) => void;
};
```

- [ ] **Step 2.2: 在 applyEvent 中触发 onPendingActionCreated**

在 `applyEvent` 函数中，找到 `onStatusChange` 调用块（约第 968 行）所在的区域，在 `onStatusChange` 块之后添加：

```typescript
      const prevPendingSize = prev?.pendingById.size ?? 0;
      if (
        options?.onPendingActionCreated &&
        prevPendingSize === 0 &&
        internal.pendingById.size > 0
      ) {
        options.onPendingActionCreated({
          sessionId: internal.id,
          tool: internal.tool,
          pendingCount: internal.pendingById.size,
          title: internal.title,
          task: internal.task,
        });
      }
```

- [ ] **Step 2.3: 写失败测试**

在 `sessionStore.test.ts` 中新增测试组（可追加在文件末尾的 `describe` 块里）：

```typescript
  describe("onPendingActionCreated", () => {
    it("fires when pendingCount goes from 0 to 1", () => {
      const onPendingActionCreated = vi.fn();
      const store = createSessionStore({ onPendingActionCreated });
      store.applyEvent({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "waiting",
        timestamp: 1,
        pendingAction: { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
      });
      expect(onPendingActionCreated).toHaveBeenCalledTimes(1);
      expect(onPendingActionCreated).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "s1", tool: "cursor", pendingCount: 1 }),
      );
    });

    it("does not fire when a second pending action is added to non-zero count", () => {
      const onPendingActionCreated = vi.fn();
      const store = createSessionStore({ onPendingActionCreated });
      store.applyEvent({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "waiting",
        timestamp: 1,
        pendingAction: { id: "act-1", type: "approval", title: "First", options: ["Allow", "Deny"] },
      });
      store.applyEvent({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "waiting",
        timestamp: 2,
        pendingAction: { id: "act-2", type: "approval", title: "Second", options: ["Allow", "Deny"] },
      });
      expect(onPendingActionCreated).toHaveBeenCalledTimes(1);
    });

    it("fires again when new pending action arrives after all previous were closed", () => {
      const onPendingActionCreated = vi.fn();
      const store = createSessionStore({ onPendingActionCreated });
      store.applyEvent({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "waiting",
        timestamp: 1,
        pendingAction: { id: "act-1", type: "approval", title: "First", options: ["Allow", "Deny"] },
      });
      store.applyEvent({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "waiting",
        timestamp: 2,
        pendingClosed: { actionId: "act-1", reason: "consumed_remote" },
      });
      store.applyEvent({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "waiting",
        timestamp: 3,
        pendingAction: { id: "act-2", type: "approval", title: "Second", options: ["Allow", "Deny"] },
      });
      expect(onPendingActionCreated).toHaveBeenCalledTimes(2);
    });

    it("does not fire when no pendingAction in event", () => {
      const onPendingActionCreated = vi.fn();
      const store = createSessionStore({ onPendingActionCreated });
      store.applyEvent({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "running",
        timestamp: 1,
      });
      expect(onPendingActionCreated).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2.4: 跑测试确认通过**

```bash
npm test -- --run src/main/session/sessionStore.test.ts
```

Expected: all tests pass.

- [ ] **Step 2.5: 提交**

```bash
git add src/main/session/sessionStore.ts src/main/session/sessionStore.test.ts
git commit -m "feat: add onPendingActionCreated callback to sessionStore"
```

---

## Task 3: notificationService — 新增 pending action 通知

**Files:**
- Modify: `src/main/notification/notificationService.ts`
- Modify: `src/main/notification/notificationService.test.ts`

- [ ] **Step 3.1: 在 notificationService.ts 中导入 PendingActionCreated 并扩展接口**

在文件顶部 import 区块，添加：

```typescript
import type { PendingActionCreated } from "../session/sessionStore";
```

将 `NotificationService` 接口扩展为：

```typescript
export interface NotificationService {
  onSessionStateChange(params: {
    sessionId: string;
    tool: string;
    prevStatus: SessionStatus | undefined;
    nextStatus: SessionStatus;
    title?: string;
    task?: string;
    lastUserMessage?: string;
  }): void;
  onPendingActionCreated(params: PendingActionCreated): void;
}
```

- [ ] **Step 3.2: 在 createNotificationService 中实现 onPendingActionCreated**

在 `createNotificationService` 的返回对象中，在 `onSessionStateChange` 方法之后添加：

```typescript
    onPendingActionCreated({ sessionId, tool, pendingCount, title, task }) {
      const settings = deps.getNotificationSettings();
      if (!settings.enabled) return;

      // 仅在通知功能整体开启时触发（复用 waiting 设置键作为审批通知开关）
      if (!settings.waiting) return;

      const debounceKey = `${sessionId}:pending_action`;
      const now = Date.now();
      const last = lastNotified.get(debounceKey);
      if (last !== undefined && now - last < DEBOUNCE_MS) return;
      lastNotified.set(debounceKey, now);

      const label = toolLabel(tool);
      const body =
        pendingCount === 1
          ? "需要你的审批"
          : `${pendingCount} 条操作需要你的审批`;
      const titleText = `${label} · ${title ?? task ?? "未知会话"}`;

      const notification = new Notification({
        title: titleText,
        body,
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
        const soundPath = `/System/Library/Sounds/Ping.aiff`;
        execFile("afplay", [soundPath], (err) => {
          if (err) {
            console.warn("[CodePal Notification] sound playback failed:", err.message);
          }
        });
      }
    },
```

- [ ] **Step 3.3: 写失败测试**

在 `notificationService.test.ts` 中追加测试：

```typescript
  describe("onPendingActionCreated", () => {
    it("fires notification when pending action created and waiting enabled", () => {
      service.onPendingActionCreated({
        sessionId: "s1",
        tool: "cursor",
        pendingCount: 1,
        title: "Fix bug",
      });
      expect(MockNotification).toHaveBeenCalledTimes(1);
      expect(MockNotification.mock.calls[0][0]).toMatchObject({
        title: expect.stringContaining("Cursor"),
        body: "需要你的审批",
      });
      expect(mockShow).toHaveBeenCalledTimes(1);
    });

    it("shows correct body for multiple pending actions", () => {
      service.onPendingActionCreated({
        sessionId: "s1",
        tool: "cursor",
        pendingCount: 3,
        title: "Fix bug",
      });
      expect(MockNotification.mock.calls[0][0]).toMatchObject({
        body: "3 条操作需要你的审批",
      });
    });

    it("does not fire when notifications disabled", () => {
      getSettings.mockReturnValue(makeSettings({ enabled: false }));
      service.onPendingActionCreated({
        sessionId: "s1",
        tool: "cursor",
        pendingCount: 1,
      });
      expect(MockNotification).not.toHaveBeenCalled();
    });

    it("does not fire when waiting setting is false", () => {
      getSettings.mockReturnValue(makeSettings({ waiting: false }));
      service.onPendingActionCreated({
        sessionId: "s1",
        tool: "cursor",
        pendingCount: 1,
      });
      expect(MockNotification).not.toHaveBeenCalled();
    });

    it("debounces: second call within DEBOUNCE_MS for same session does not fire", () => {
      service.onPendingActionCreated({ sessionId: "s1", tool: "cursor", pendingCount: 1 });
      service.onPendingActionCreated({ sessionId: "s1", tool: "cursor", pendingCount: 2 });
      expect(MockNotification).toHaveBeenCalledTimes(1);
    });

    it("clicking notification sends focus-session IPC to main window", () => {
      const mockWin = { show: vi.fn(), focus: vi.fn(), isDestroyed: vi.fn(() => false), webContents: { send: vi.fn() } };
      getMainWindow.mockReturnValue(mockWin);
      service.onPendingActionCreated({ sessionId: "s42", tool: "cursor", pendingCount: 1 });
      // Simulate click
      const clickCb = mockOn.mock.calls.find((c: [string, unknown]) => c[0] === "click")?.[1] as (() => void) | undefined;
      clickCb?.();
      expect(mockWin.webContents.send).toHaveBeenCalledWith("codepal:focus-session", "s42");
    });
  });
```

- [ ] **Step 3.4: 跑测试确认通过**

```bash
npm test -- --run src/main/notification/notificationService.test.ts
```

Expected: all tests pass.

- [ ] **Step 3.5: 提交**

```bash
git add src/main/notification/notificationService.ts src/main/notification/notificationService.test.ts
git commit -m "feat: notify on pending action created in notificationService"
```

---

## Task 4: main.ts + preload — 接线 IPC 结果通道

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload/index.ts`

- [ ] **Step 4.1: 在 main.ts 中给 dispatchActionResponse 传 emitResult 回调**

找到 `ipcMain.on("codepal:action-response", ...)` 处（约第 275 行），将其修改为：

```typescript
  ipcMain.on("codepal:action-response", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const p = payload as Record<string, unknown>;
    const sessionId = typeof p.sessionId === "string" ? p.sessionId : "";
    const actionId = typeof p.actionId === "string" ? p.actionId : "";
    const option = typeof p.option === "string" ? p.option : "";
    if (!sessionId || !actionId || !option) return;

    const emitResult = (result: ActionResponseResult) => {
      const win = mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send("codepal:action-response-result", result);
      }
    };

    void dispatchActionResponse(
      sessionStore,
      actionResponseTransport,
      broadcastSessions,
      sessionId,
      actionId,
      option,
      emitResult,
    ).catch((err) => {
      console.error("[CodePal] action_response transport error:", err);
    });
  });
```

确保 `ActionResponseResult` 已从 `dispatchActionResponse` 导入：

```typescript
import { dispatchActionResponse } from "./actionResponse/dispatchActionResponse";
import type { ActionResponseResult } from "./actionResponse/dispatchActionResponse";
```

- [ ] **Step 4.2: 在 main.ts 的 sessionStore 创建选项中传入 onPendingActionCreated**

找到 `createSessionStore` 的调用（约第 41 行），修改为：

```typescript
const sessionStore = createSessionStore({
  onStatusChange: (change) => {
    notificationServiceRef?.onSessionStateChange(change);
  },
  onPendingActionCreated: (params) => {
    notificationServiceRef?.onPendingActionCreated(params);
  },
});
```

- [ ] **Step 4.3: 在 preload/index.ts 中暴露 onActionResponseResult**

在 `respondToPendingAction` 方法之后，添加（在 `contextBridge.exposeInMainWorld` 的对象内）：

```typescript
  onActionResponseResult(handler: (result: {
    sessionId: string;
    actionId: string;
    result: "success" | "error";
    option: string;
    error?: string;
  }) => void) {
    const channel = "codepal:action-response-result";
    const listener = (
      _event: Electron.IpcRendererEvent,
      result: { sessionId: string; actionId: string; result: "success" | "error"; option: string; error?: string },
    ) => {
      handler(result);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
```

- [ ] **Step 4.4: 跑全量测试确认无回归**

```bash
npm test -- --run
```

Expected: all 71 test files pass.

- [ ] **Step 4.5: 提交**

```bash
git add src/main/main.ts src/main/preload/index.ts
git commit -m "feat: wire action-response-result IPC and pending action notification in main"
```

---

## Task 5: SessionList — 自动展开 + 移除 showExperimentalControls

**Files:**
- Modify: `src/renderer/components/SessionList.tsx`
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionHistoryTimeline.tsx` (仅移除 prop，状态机在 Task 6)
- Modify: `src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 5.1: 在 SessionList.tsx 中添加自动展开 effect**

在现有的 `useEffect(() => { return window.codepal.onFocusSession(...) }, [])` 之后，添加：

```typescript
  const prevPendingCounts = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const session of sessions) {
      const prev = prevPendingCounts.current[session.id] ?? 0;
      const next = session.pendingCount ?? 0;
      if (prev === 0 && next > 0) {
        setExpandedSessionId(session.id);
      }
      prevPendingCounts.current[session.id] = next;
    }
  }, [sessions]);
```

- [ ] **Step 5.2: 在 SessionList.tsx 中移除 showExperimentalControls prop**

将：
```typescript
          showExperimentalControls={false}
```
删除（整行移除，`SessionRow` 的默认值处理）。

- [ ] **Step 5.3: 在 SessionRow.tsx 中移除 showExperimentalControls**

1. 从 `SessionRowProps` 中移除 `showExperimentalControls?: boolean;`
2. 从解构参数中移除 `showExperimentalControls = true,`
3. 从 `SessionHistoryTimeline` 的调用处移除 `showExperimentalControls={showExperimentalControls}`

- [ ] **Step 5.4: 在 SessionHistoryTimeline.tsx 中移除 showExperimentalControls prop**

1. 从 `SessionHistoryTimelineProps` 中移除 `showExperimentalControls: boolean;`
2. 从函数参数解构中移除 `showExperimentalControls,`
3. 将 `{showExperimentalControls && (session.pendingActions?.length ?? 0) > 0 ? (` 改为 `{(session.pendingActions?.length ?? 0) > 0 ? (`（移除门控，保留内容渲染，状态机在 Task 6 完善）

- [ ] **Step 5.5: 修复 SessionRow.test.tsx 中的 showExperimentalControls 引用**

在测试文件中，搜索 `showExperimentalControls` 并移除所有相关 prop 传递（测试不再需要该 prop）。

- [ ] **Step 5.6: 跑测试确认无回归**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5.7: 提交**

```bash
git add src/renderer/components/SessionList.tsx src/renderer/components/SessionRow.tsx src/renderer/components/SessionHistoryTimeline.tsx src/renderer/components/SessionRow.test.tsx
git commit -m "feat: auto-expand session on pending action, remove showExperimentalControls gate"
```

---

## Task 6: SessionHistoryTimeline — 卡片状态机 + Allow All

**Files:**
- Modify: `src/renderer/components/SessionHistoryTimeline.tsx`
- Modify: `src/renderer/components/SessionHistoryTimeline.test.ts`

- [ ] **Step 6.1: 添加 ActionCardState 类型和状态**

在 `SessionHistoryTimeline` 函数体顶部（`session, historyVersion, expanded, onRespond` 解构之后），添加：

```typescript
  type ActionCardState = "pending" | "sending" | "success" | "error";

  const [cardStates, setCardStates] = useState<Record<string, ActionCardState>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  // 追踪每个 actionId 最后一次选择的 option，供重试使用
  const [cardLastOptions, setCardLastOptions] = useState<Record<string, string>>({});
```

- [ ] **Step 6.2: 添加 onActionResponseResult 监听 effect**

在组件内现有 `useEffect` 之后添加：

```typescript
  useEffect(() => {
    return window.codepal.onActionResponseResult((result) => {
      if (result.sessionId !== session.id) return;
      const { actionId } = result;
      if (result.result === "success") {
        setCardStates((prev) => ({ ...prev, [actionId]: "success" }));
        setCardErrors((prev) => {
          const next = { ...prev };
          delete next[actionId];
          return next;
        });
        setTimeout(() => {
          setCardStates((prev) => {
            const next = { ...prev };
            delete next[actionId];
            return next;
          });
        }, 1000);
      } else {
        setCardStates((prev) => ({ ...prev, [actionId]: "error" }));
        setCardErrors((prev) => ({ ...prev, [actionId]: result.error ?? "发送失败" }));
      }
    });
  }, [session.id]);
```

- [ ] **Step 6.3: 添加 handleRespond 函数（设置 sending 状态）**

在组件内添加：

```typescript
  function handleRespond(sessionId: string, actionId: string, option: string) {
    setCardStates((prev) => ({ ...prev, [actionId]: "sending" }));
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
    setCardLastOptions((prev) => ({ ...prev, [actionId]: option }));
    onRespond(sessionId, actionId, option);
  }
```

- [ ] **Step 6.4: 替换现有的审批卡片渲染逻辑**

找到（约第 943 行）`{(session.pendingActions?.length ?? 0) > 0 ? (` 这一段，将整个 block 替换为：

```typescript
      {(session.pendingActions?.length ?? 0) > 0 ? (
        <div className="session-row__interaction">
          {(session.pendingActions?.length ?? 0) > 1 ? (
            <div className="pending-action-bulk">
              <span className="pending-action-bulk__count">
                {session.pendingActions?.length} {i18n.t("session.pending", { count: session.pendingActions?.length ?? 0 })}
              </span>
              <button
                type="button"
                className="pending-action-bulk__btn pending-action-bulk__btn--allow"
                onClick={() => {
                  for (const action of session.pendingActions ?? []) {
                    const state = cardStates[action.id];
                    if (!state || state === "pending" || state === "error") {
                      handleRespond(session.id, action.id, actionDisplayOptions(action, i18n.t)[0]);
                    }
                  }
                }}
              >
                {i18n.t("pendingAction.allowAll")}
              </button>
              <button
                type="button"
                className="pending-action-bulk__btn pending-action-bulk__btn--deny"
                onClick={() => {
                  for (const action of session.pendingActions ?? []) {
                    const state = cardStates[action.id];
                    if (!state || state === "pending" || state === "error") {
                      const opts = actionDisplayOptions(action, i18n.t);
                      handleRespond(session.id, action.id, opts[opts.length - 1]);
                    }
                  }
                }}
              >
                {i18n.t("pendingAction.denyAll")}
              </button>
            </div>
          ) : null}
          {(session.pendingActions ?? []).map((action) => {
            const cardState = cardStates[action.id] ?? "pending";
            const cardError = cardErrors[action.id];
            const isSending = cardState === "sending";
            const isSuccess = cardState === "success";
            const isError = cardState === "error";

            return (
              <div
                key={action.id}
                className={`pending-action pending-action--${cardState}`}
                aria-label={action.title}
              >
                {isSuccess ? (
                  <div className="pending-action__success">
                    ✓ {i18n.t("pendingAction.sent")}
                  </div>
                ) : isError ? (
                  <>
                    <div className="pending-action__error-msg">⚠ {cardError}</div>
                    <div className="pending-action__actions">
                      <button
                        type="button"
                        className="pending-action__btn pending-action__btn--retry"
                        onClick={() => handleRespond(session.id, action.id, cardLastOptions[action.id] ?? actionDisplayOptions(action, i18n.t)[0])}
                      >
                        {i18n.t("pendingAction.retry")}
                      </button>
                      <button
                        type="button"
                        className="pending-action__btn pending-action__btn--abandon"
                        onClick={() => {
                          setCardStates((prev) => {
                            const next = { ...prev };
                            delete next[action.id];
                            return next;
                          });
                        }}
                      >
                        {i18n.t("pendingAction.abandon")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pending-action__eyebrow">
                      <span className="pending-action__kicker">
                        {pendingEyebrow(action.type, i18n.t)}
                      </span>
                    </div>
                    <div className="pending-action__title">{action.title}</div>
                    <div className="pending-action__actions">
                      {actionDisplayOptions(action, i18n.t).map((option) => (
                        <button
                          key={`${action.id}:${option}`}
                          type="button"
                          className="pending-action__btn"
                          disabled={isSending}
                          onClick={() => handleRespond(session.id, action.id, option)}
                        >
                          {isSending ? i18n.t("pendingAction.sending") : option}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
```

- [ ] **Step 6.5: 在 i18n 文件中添加新翻译键**

打开 `src/renderer/i18n.tsx`，在 zh-CN 翻译对象（含 `"session.pending"` 处，约第 256 行）和 en-US 翻译对象（约第 547 行）分别追加：

```typescript
// 在 zh-CN 的翻译对象中:
"pendingAction.sent": "已发送",
"pendingAction.sending": "发送中…",
"pendingAction.retry": "↺ 重试",
"pendingAction.abandon": "放弃",
"pendingAction.allowAll": "✓ 全部允许",
"pendingAction.denyAll": "✗ 全部拒绝",

// 在 en-US 的翻译对象中:
"pendingAction.sent": "Sent",
"pendingAction.sending": "Sending…",
"pendingAction.retry": "↺ Retry",
"pendingAction.abandon": "Dismiss",
"pendingAction.allowAll": "✓ Allow All",
"pendingAction.denyAll": "✗ Deny All",
```

- [ ] **Step 6.6: 写失败测试（状态机）**

在 `SessionHistoryTimeline.test.ts` 中追加：

```typescript
describe("pending action card state machine", () => {
  function makePendingSession(pendingActions: PendingAction[]): MonitorSessionRow {
    return {
      id: "s1",
      tool: "cursor",
      status: "waiting",
      pendingActions,
      pendingCount: pendingActions.length,
      titleLabel: "Fix bug",
      updatedLabel: "just now",
      durationLabel: "1s",
      shortId: "s1",
      collapsedSummary: "",
      activityItems: [],
    };
  }

  it("shows pending action buttons initially", () => {
    const session = makePendingSession([
      { id: "act-1", type: "approval", title: "Run npm build?", options: ["Allow", "Deny"] },
    ]);
    const { getByText } = render(
      <SessionHistoryTimeline session={session} expanded={true} onRespond={vi.fn()} />,
    );
    expect(getByText("Run npm build?")).toBeTruthy();
  });

  it("calls onRespond and disables buttons when option clicked", async () => {
    const onRespond = vi.fn();
    const session = makePendingSession([
      { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
    ]);
    const { getAllByRole } = render(
      <SessionHistoryTimeline session={session} expanded={true} onRespond={onRespond} />,
    );
    const [allowBtn] = getAllByRole("button").filter((b) => b.textContent?.includes("Allow") || b.textContent?.includes("允许"));
    fireEvent.click(allowBtn);
    expect(onRespond).toHaveBeenCalledWith("s1", "act-1", expect.any(String));
    await waitFor(() => {
      expect(allowBtn).toBeDisabled();
    });
  });

  it("shows Allow All / Deny All bar when more than one pending action", () => {
    const session = makePendingSession([
      { id: "act-1", type: "approval", title: "First?", options: ["Allow", "Deny"] },
      { id: "act-2", type: "approval", title: "Second?", options: ["Allow", "Deny"] },
    ]);
    const { container } = render(
      <SessionHistoryTimeline session={session} expanded={true} onRespond={vi.fn()} />,
    );
    expect(container.querySelector(".pending-action-bulk")).toBeTruthy();
  });

  it("does not show Allow All bar for single pending action", () => {
    const session = makePendingSession([
      { id: "act-1", type: "approval", title: "Only one?", options: ["Allow", "Deny"] },
    ]);
    const { container } = render(
      <SessionHistoryTimeline session={session} expanded={true} onRespond={vi.fn()} />,
    );
    expect(container.querySelector(".pending-action-bulk")).toBeNull();
  });
});
```

- [ ] **Step 6.7: 跑测试确认通过**

```bash
npm test -- --run src/renderer/components/SessionHistoryTimeline.test.ts
```

Expected: all tests pass.

- [ ] **Step 6.8: 提交**

```bash
git add src/renderer/components/SessionHistoryTimeline.tsx src/renderer/components/SessionHistoryTimeline.test.ts
git commit -m "feat: add approval card state machine (sending/success/error/retry) and Allow All"
```

---

## Task 7: 样式 — 审批卡片状态样式

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 7.1: 找到现有 pending-action 样式，追加状态样式**

在 `styles.css` 中找到 `.pending-action` 相关样式后，追加：

```css
/* 批量操作栏 */
.pending-action-bulk {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-subtle, #1e293b);
  margin-bottom: 4px;
}

.pending-action-bulk__count {
  flex: 1;
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
}

.pending-action-bulk__btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 10px;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.pending-action-bulk__btn--allow {
  background: #166534;
  color: #4ade80;
}

.pending-action-bulk__btn--deny {
  background: #450a0a;
  color: #f87171;
  border: 1px solid #7f1d1d;
}

/* 卡片状态 */
.pending-action--sending .pending-action__btn {
  opacity: 0.5;
  cursor: not-allowed;
}

.pending-action--success {
  border-color: #166534 !important;
  background: rgba(20, 83, 45, 0.1);
}

.pending-action__success {
  color: #4ade80;
  font-size: 12px;
  padding: 6px 0;
}

.pending-action--error {
  border-color: #ef4444 !important;
}

.pending-action__error-msg {
  color: #f87171;
  font-size: 11px;
  margin-bottom: 6px;
}

.pending-action__btn--retry {
  background: #1e40af;
  color: #bfdbfe;
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 10px;
  cursor: pointer;
  font-family: inherit;
}

.pending-action__btn--abandon {
  background: transparent;
  color: #64748b;
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 10px;
  cursor: pointer;
  font-family: inherit;
}
```

- [ ] **Step 7.2: 跑全量测试确认无回归**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 7.3: 提交**

```bash
git add src/renderer/styles.css
git commit -m "feat: add pending action card state styles (sending/success/error/bulk)"
```

---

## 验收标准回顾

完成以上 7 个 Task 后，逐条验证：

1. **通知**：Cursor 发出 `pendingAction` → CodePal 触发 macOS 通知，通知标题含 "Cursor"
2. **点击通知**：CodePal 窗口置前，对应会话展开，审批卡片可见
3. **新审批自动展开**：会话 pendingCount 从 0 变为 N 时，该行自动展开
4. **loading 状态**：点击「允许/拒绝」后按钮禁用，显示"发送中…"
5. **success 状态**：收到 success result 后卡片变绿，1 秒后消失
6. **error + retry**：收到 error result 后卡片变红，显示错误信息，点「重试」可重新发送
7. **Allow All**：2 条以上审批时顶部出现批量按钮，点击后逐条触发 handleRespond
8. **测试全绿**：`npm test -- --run` 无失败
