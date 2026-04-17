# Send Message to Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to type a message in CodePal and send it to a running code agent through a keep-alive IPC connection.

**Architecture:** Modify the IPC Hub to track per-session keep-alive connections and allow bidirectional communication. Add a new `SessionMessageInput` component that renders conditionally (running/waiting status). Hook CLI gets a new `keep-alive` subcommand that maintains a persistent connection and forwards received messages to stdout.

**Tech Stack:** Electron IPC, Node.js `net.Socket`, React, TypeScript, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/shared/messageTypes.ts` | **Create** — `SendMessagePayload`, `SendMessageResult`, `UserMessageLine` types |
| `src/shared/sessionTypes.ts` | **Modify** — Add `hasInputChannel` to `SessionRecord` |
| `src/main/ipc/ipcHub.ts` | **Modify** — Connection registry, `sendMessageToSession`, keep-alive support |
| `src/main/ipc/ipcHub.test.ts` | **Create** — Tests for connection registry and message sending |
| `src/main/session/sessionStore.ts` | **Modify** — `hasInputChannel` in `InternalSessionRecord` + `toSessionRecord` |
| `src/main/main.ts` | **Modify** — Wire `codepal:send-message` IPC handler, connect registry to store |
| `src/main/preload/index.ts` | **Modify** — Expose `sendMessage` + `onSendMessageResult` |
| `src/renderer/codepal.d.ts` | **Modify** — Add type declarations |
| `src/renderer/components/SessionMessageInput.tsx` | **Create** — Input component |
| `src/renderer/components/SessionMessageInput.test.tsx` | **Create** — Tests |
| `src/renderer/components/SessionHistoryTimeline.tsx` | **Modify** — Integrate input + local echo |
| `src/renderer/i18n.tsx` | **Modify** — Add i18n keys |
| `src/renderer/styles.css` | **Modify** — Input styles + waiting animation |
| `src/main/hook/runHookCli.ts` | **Modify** — Add `keep-alive` subcommand |
| `src/main/hook/keepAliveHook.ts` | **Create** — Keep-alive connection logic |
| `src/main/hook/keepAliveHook.test.ts` | **Create** — Tests |

---

### Task 1: Shared Types

**Files:**
- Create: `src/shared/messageTypes.ts`
- Modify: `src/shared/sessionTypes.ts`

- [ ] **Step 1: Create message types file**

```typescript
// src/shared/messageTypes.ts

export type SendMessagePayload = {
  sessionId: string;
  text: string;
};

export type SendMessageResult = {
  sessionId: string;
  result: "success" | "error";
  error?: string;
};

/**
 * JSON line format sent from CodePal to agent via keep-alive connection.
 */
export type UserMessageLine = {
  type: "user_message";
  sessionId: string;
  text: string;
  timestamp: number;
};
```

- [ ] **Step 2: Add `hasInputChannel` to SessionRecord**

In `src/shared/sessionTypes.ts`, add `hasInputChannel?: boolean` to the `SessionRecord` interface, after the `externalApproval` field:

```typescript
// Add to SessionRecord interface, after externalApproval
hasInputChannel?: boolean;
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add src/shared/messageTypes.ts src/shared/sessionTypes.ts
git commit -m "feat: add shared types for send-message-to-agent"
```

---

### Task 2: IPC Hub Connection Registry

**Files:**
- Modify: `src/main/ipc/ipcHub.ts`
- Create: `src/main/ipc/ipcHub.test.ts`

**Context:** The current `ipcHub.ts` is 24 lines. `createIpcHub` takes a single `onMessage` callback and returns `{ server }`. We need to add a connection registry that maps sessionId → socket, and a `sendMessageToSession` function.

- [ ] **Step 1: Write failing tests for connection registry**

```typescript
// src/main/ipc/ipcHub.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import net from "node:net";
import { createIpcHub } from "./ipcHub";

function connectAndWrite(port: number, lines: string[]): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
      for (const line of lines) {
        socket.write(line + "\n");
      }
      resolve(socket);
    });
    socket.on("error", reject);
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createIpcHub", () => {
  let hub: ReturnType<typeof createIpcHub>;
  let port: number;

  afterEach(async () => {
    hub?.server.close();
    await waitMs(50);
  });

  it("registers a connection when a line with sessionId arrives", async () => {
    const onMessage = vi.fn();
    const onConnectionRegistered = vi.fn();
    hub = createIpcHub({ onMessage, onConnectionRegistered });
    await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
    port = (hub.server.address() as net.AddressInfo).port;

    const line = JSON.stringify({ type: "status_change", sessionId: "sess-1", status: "running", tool: "codebuddy" });
    const socket = await connectAndWrite(port, [line]);
    await waitMs(50);

    expect(onMessage).toHaveBeenCalledWith(line);
    expect(onConnectionRegistered).toHaveBeenCalledWith("sess-1");
    expect(hub.getConnectedSessionIds()).toContain("sess-1");

    socket.destroy();
    await waitMs(50);
    expect(hub.getConnectedSessionIds()).not.toContain("sess-1");
  });

  it("sendMessageToSession writes a JSON line to the registered socket", async () => {
    const onMessage = vi.fn();
    hub = createIpcHub({ onMessage });
    await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
    port = (hub.server.address() as net.AddressInfo).port;

    const line = JSON.stringify({ type: "status_change", sessionId: "sess-2", status: "running", tool: "claude" });
    const socket = await connectAndWrite(port, [line]);
    await waitMs(50);

    const received: string[] = [];
    socket.on("data", (chunk) => received.push(chunk.toString("utf8")));

    const result = hub.sendMessageToSession("sess-2", "please continue");
    expect(result).toEqual({ ok: true });

    await waitMs(50);
    expect(received.length).toBe(1);
    const parsed = JSON.parse(received[0].trim());
    expect(parsed.type).toBe("user_message");
    expect(parsed.sessionId).toBe("sess-2");
    expect(parsed.text).toBe("please continue");
    expect(typeof parsed.timestamp).toBe("number");

    socket.destroy();
  });

  it("sendMessageToSession returns error when no connection exists", () => {
    hub = createIpcHub({ onMessage: vi.fn() });
    const result = hub.sendMessageToSession("nonexistent", "hello");
    expect(result).toEqual({ ok: false, error: "no_connection" });
  });

  it("removes connection on disconnect and fires onConnectionLost", async () => {
    const onConnectionLost = vi.fn();
    hub = createIpcHub({ onMessage: vi.fn(), onConnectionLost });
    await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
    port = (hub.server.address() as net.AddressInfo).port;

    const line = JSON.stringify({ type: "status_change", sessionId: "sess-3", status: "running", tool: "codex" });
    const socket = await connectAndWrite(port, [line]);
    await waitMs(50);
    expect(hub.getConnectedSessionIds()).toContain("sess-3");

    socket.destroy();
    await waitMs(50);
    expect(hub.getConnectedSessionIds()).not.toContain("sess-3");
    expect(onConnectionLost).toHaveBeenCalledWith("sess-3");
  });

  it("new connection for same sessionId replaces old one", async () => {
    hub = createIpcHub({ onMessage: vi.fn() });
    await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
    port = (hub.server.address() as net.AddressInfo).port;

    const line = JSON.stringify({ type: "status_change", sessionId: "sess-4", status: "running", tool: "cursor" });
    const socket1 = await connectAndWrite(port, [line]);
    await waitMs(50);

    const socket2 = await connectAndWrite(port, [line]);
    await waitMs(50);

    // Only one entry for sess-4
    expect(hub.getConnectedSessionIds().filter((id: string) => id === "sess-4").length).toBe(1);

    // Message goes to socket2, not socket1
    const received: string[] = [];
    socket2.on("data", (chunk) => received.push(chunk.toString("utf8")));

    hub.sendMessageToSession("sess-4", "test");
    await waitMs(50);
    expect(received.length).toBe(1);

    socket1.destroy();
    socket2.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/ipc/ipcHub.test.ts`
Expected: FAIL (createIpcHub does not accept options object)

- [ ] **Step 3: Implement connection registry in ipcHub.ts**

Replace the full content of `src/main/ipc/ipcHub.ts`:

```typescript
import net from "node:net";
import type { UserMessageLine } from "../../shared/messageTypes";

type IpcHubOptions = {
  onMessage: (line: string) => void;
  onConnectionRegistered?: (sessionId: string) => void;
  onConnectionLost?: (sessionId: string) => void;
};

function attachLineStream(socket: net.Socket, onLine: (line: string) => void) {
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length > 0) {
        onLine(line);
      }
    }
  });
}

function extractSessionId(line: string): string | null {
  try {
    const parsed = JSON.parse(line);
    if (typeof parsed === "object" && parsed !== null && typeof parsed.sessionId === "string") {
      return parsed.sessionId;
    }
  } catch {
    // not JSON — ignore
  }
  return null;
}

export function createIpcHub(optionsOrCallback: IpcHubOptions | ((line: string) => void)) {
  const options: IpcHubOptions =
    typeof optionsOrCallback === "function"
      ? { onMessage: optionsOrCallback }
      : optionsOrCallback;

  const connections = new Map<string, net.Socket>();

  const server = net.createServer((socket) => {
    let registeredSessionId: string | null = null;

    attachLineStream(socket, (line) => {
      // Try to register this socket for a sessionId
      if (!registeredSessionId) {
        const sessionId = extractSessionId(line);
        if (sessionId) {
          registeredSessionId = sessionId;
          connections.set(sessionId, socket);
          options.onConnectionRegistered?.(sessionId);
        }
      }
      options.onMessage(line);
    });

    socket.on("close", () => {
      if (registeredSessionId && connections.get(registeredSessionId) === socket) {
        connections.delete(registeredSessionId);
        options.onConnectionLost?.(registeredSessionId);
      }
    });

    socket.on("error", () => {
      // handled by close
    });
  });

  function sendMessageToSession(
    sessionId: string,
    text: string,
  ): { ok: true } | { ok: false; error: string } {
    const socket = connections.get(sessionId);
    if (!socket || socket.destroyed) {
      connections.delete(sessionId);
      return { ok: false, error: "no_connection" };
    }

    const payload: UserMessageLine = {
      type: "user_message",
      sessionId,
      text,
      timestamp: Date.now(),
    };
    socket.write(JSON.stringify(payload) + "\n");
    return { ok: true };
  }

  function getConnectedSessionIds(): string[] {
    return [...connections.keys()];
  }

  return { server, sendMessageToSession, getConnectedSessionIds };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/ipc/ipcHub.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Run full test suite to check backward compatibility**

Run: `npx vitest run`
Expected: All tests pass (the old call site `createIpcHub((line) => {...})` still works because of the function-or-options overload)

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/ipcHub.ts src/main/ipc/ipcHub.test.ts
git commit -m "feat: add connection registry and sendMessageToSession to IPC Hub"
```

---

### Task 3: SessionStore `hasInputChannel`

**Files:**
- Modify: `src/main/session/sessionStore.ts`

**Context:** `InternalSessionRecord` (line 53) is the private runtime type. `toSessionRecord` (line 375) converts it to the public `SessionRecord`. The store needs methods for external callers to set/unset the channel flag.

- [ ] **Step 1: Write failing tests**

Add to `src/main/session/sessionStore.test.ts`:

```typescript
describe("hasInputChannel", () => {
  it("defaults to false on new sessions", () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "ch-1",
      tool: "codebuddy",
      status: "running",
      timestamp: Date.now(),
    });
    const session = store.getSession("ch-1");
    expect(session?.hasInputChannel).toBe(false);
  });

  it("setInputChannel(true) makes hasInputChannel true", () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "ch-2",
      tool: "claude",
      status: "running",
      timestamp: Date.now(),
    });
    store.setInputChannel("ch-2", true);
    expect(store.getSession("ch-2")?.hasInputChannel).toBe(true);
  });

  it("setInputChannel(false) makes hasInputChannel false", () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "ch-3",
      tool: "codex",
      status: "running",
      timestamp: Date.now(),
    });
    store.setInputChannel("ch-3", true);
    store.setInputChannel("ch-3", false);
    expect(store.getSession("ch-3")?.hasInputChannel).toBe(false);
  });

  it("setInputChannel on nonexistent session is a no-op", () => {
    const store = createSessionStore();
    store.setInputChannel("nonexistent", true);
    expect(store.getSession("nonexistent")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/session/sessionStore.test.ts -- --testNamePattern "hasInputChannel"`
Expected: FAIL (setInputChannel does not exist)

- [ ] **Step 3: Implement**

In `src/main/session/sessionStore.ts`:

1. Add `hasInputChannel: boolean` to `InternalSessionRecord` (after `closedLedger`):

```typescript
hasInputChannel: boolean;
```

2. In the `applyEvent` method, where the `internal` object literal is constructed (the `sessions.set(sessionId, { ... })` call), add:

```typescript
hasInputChannel: prev?.hasInputChannel ?? false,
```

3. In `toSessionRecord`, add:

```typescript
hasInputChannel: internal.hasInputChannel,
```

4. In `seedFromHistory`, add `hasInputChannel: false` to the seeded record.

5. Add `setInputChannel` method to the returned store object:

```typescript
setInputChannel(sessionId: string, connected: boolean) {
  const internal = sessions.get(sessionId);
  if (!internal) return;
  sessions.set(sessionId, { ...internal, hasInputChannel: connected });
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/sessionStore.test.ts`
Expected: All tests pass (including existing tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/session/sessionStore.ts src/main/session/sessionStore.test.ts
git commit -m "feat: add hasInputChannel to session store"
```

---

### Task 4: Main Process Wiring

**Files:**
- Modify: `src/main/main.ts`

**Context:** `wireIpcHub` (line 334) creates the hub with `createIpcHub((line) => {...})`. `registerIpcHandlers` (line ~100) registers IPC handlers. We need to: (1) pass options object to `createIpcHub` with connection callbacks, (2) add `codepal:send-message` handler, (3) emit `codepal:send-message-result` back to renderer.

- [ ] **Step 1: Modify `wireIpcHub` to use options object and wire connection callbacks**

In `src/main/main.ts`, find the `createIpcHub((line) => {` call inside `wireIpcHub`. Change it to:

```typescript
const hub = createIpcHub({
  onMessage: (line) => {
    // ... existing line handling logic (unchanged) ...
  },
  onConnectionRegistered: (sessionId) => {
    sessionStore.setInputChannel(sessionId, true);
    sessionBroadcastScheduler.request();
  },
  onConnectionLost: (sessionId) => {
    sessionStore.setInputChannel(sessionId, false);
    sessionBroadcastScheduler.request();
  },
});
```

Keep the rest of `wireIpcHub` unchanged. Store `hub` in a module-level ref so the IPC handler can access `hub.sendMessageToSession`.

- [ ] **Step 2: Add `codepal:send-message` IPC handler**

In `registerIpcHandlers` (or near the existing `codepal:action-response` handler), add:

```typescript
ipcMain.on("codepal:send-message", (_event, payload: unknown) => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as Record<string, unknown>).sessionId !== "string" ||
    typeof (payload as Record<string, unknown>).text !== "string"
  ) {
    return;
  }
  const { sessionId, text } = payload as { sessionId: string; text: string };
  if (!sessionId || !text) return;

  const hubRef = ipcHubRef;
  if (!hubRef) {
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send("codepal:send-message-result", {
        sessionId,
        result: "error",
        error: "IPC hub not initialized",
      });
    }
    return;
  }

  const result = hubRef.sendMessageToSession(sessionId, text);
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send("codepal:send-message-result", {
      sessionId,
      result: result.ok ? "success" : "error",
      error: result.ok ? undefined : result.error,
    });
  }
});
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: wire send-message IPC handler and connection callbacks"
```

---

### Task 5: Preload + Type Declarations

**Files:**
- Modify: `src/main/preload/index.ts`
- Modify: `src/renderer/codepal.d.ts`

- [ ] **Step 1: Expose `sendMessage` and `onSendMessageResult` in preload**

In `src/main/preload/index.ts`, add to the `contextBridge.exposeInMainWorld("codepal", { ... })` object:

```typescript
sendMessage(sessionId: string, text: string) {
  ipcRenderer.send("codepal:send-message", { sessionId, text });
},
onSendMessageResult(handler: (result: { sessionId: string; result: "success" | "error"; error?: string }) => void) {
  const channel = "codepal:send-message-result";
  const listener = (_event: Electron.IpcRendererEvent, result: { sessionId: string; result: "success" | "error"; error?: string }) => {
    handler(result);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
},
```

- [ ] **Step 2: Update `codepal.d.ts`**

In `src/renderer/codepal.d.ts`, add to the `CodePalApi` type:

```typescript
sendMessage: (sessionId: string, text: string) => void;
onSendMessageResult: (handler: (result: { sessionId: string; result: "success" | "error"; error?: string }) => void) => () => void;
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/preload/index.ts src/renderer/codepal.d.ts
git commit -m "feat: expose sendMessage and onSendMessageResult in preload"
```

---

### Task 6: i18n Keys

**Files:**
- Modify: `src/renderer/i18n.tsx`

- [ ] **Step 1: Add i18n keys**

In `ZH_CN_MESSAGES` (around line 263, after the `pendingAction.*` block):

```typescript
"sendMessage.placeholder.running": "发消息给 {agent}...",
"sendMessage.placeholder.waiting": "Agent 正在等待你的输入...",
"sendMessage.placeholder.disconnected": "未连接到 {agent}",
"sendMessage.send": "发送",
"sendMessage.error.default": "发送失败",
```

In `EN_MESSAGES` (around line 563, after the `pendingAction.*` block):

```typescript
"sendMessage.placeholder.running": "Send a message to {agent}...",
"sendMessage.placeholder.waiting": "Agent is waiting for your input...",
"sendMessage.placeholder.disconnected": "Not connected to {agent}",
"sendMessage.send": "Send",
"sendMessage.error.default": "Failed to send",
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/i18n.tsx
git commit -m "feat: add i18n keys for send-message input"
```

---

### Task 7: CSS Styles

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Add input styles and waiting animation**

Append after the `.external-approval-card` block (around line 2375):

```css
/* ── Send Message Input ── */

.session-message-input {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-secondary, #0f172a);
  border-top: 1px solid var(--border, #334155);
}

.session-message-input__field {
  flex: 1;
  background: var(--bg-primary, #1e293b);
  border: 1px solid var(--border, #334155);
  border-radius: 5px;
  padding: 6px 10px;
  color: var(--text-primary, #e2e8f0);
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  outline: none;
  transition: border-color 0.2s ease;
}

.session-message-input__field:focus {
  border-color: var(--accent, #2563eb);
}

.session-message-input__field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.session-message-input--waiting .session-message-input__field {
  border-color: #2563eb;
  animation: input-waiting-pulse 2s ease-in-out infinite;
}

.session-message-input__btn {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 6px 12px;
  font-size: 10px;
  cursor: pointer;
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
}

.session-message-input__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.session-message-input__error {
  color: #f87171;
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  padding: 2px 10px 4px;
}

@keyframes input-waiting-pulse {
  0%, 100% { border-color: #2563eb; box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
  50% { border-color: #60a5fa; box-shadow: 0 0 6px 0 rgba(37, 99, 235, 0.25); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat: add CSS styles for session message input with waiting animation"
```

---

### Task 8: SessionMessageInput Component

**Files:**
- Create: `src/renderer/components/SessionMessageInput.tsx`
- Create: `src/renderer/components/SessionMessageInput.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/renderer/components/SessionMessageInput.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderSessionMessageInputProps, getPlaceholder } from "./SessionMessageInput";

describe("getPlaceholder", () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    const map: Record<string, string> = {
      "sendMessage.placeholder.running": `Send a message to ${params?.agent ?? ""}...`,
      "sendMessage.placeholder.waiting": "Agent is waiting for your input...",
      "sendMessage.placeholder.disconnected": `Not connected to ${params?.agent ?? ""}`,
    };
    return map[key] ?? key;
  };

  it("returns running placeholder when hasInputChannel and running", () => {
    expect(getPlaceholder("running", true, "Cursor", t)).toBe("Send a message to Cursor...");
  });

  it("returns waiting placeholder when hasInputChannel and waiting", () => {
    expect(getPlaceholder("waiting", true, "Claude", t)).toBe("Agent is waiting for your input...");
  });

  it("returns disconnected placeholder when no input channel", () => {
    expect(getPlaceholder("running", false, "Codex", t)).toBe("Not connected to Codex");
  });
});

describe("renderSessionMessageInputProps", () => {
  it("returns disabled when no input channel", () => {
    const props = renderSessionMessageInputProps({
      status: "running",
      hasInputChannel: false,
      tool: "cursor",
    });
    expect(props.disabled).toBe(true);
  });

  it("returns enabled when running with input channel", () => {
    const props = renderSessionMessageInputProps({
      status: "running",
      hasInputChannel: true,
      tool: "codebuddy",
    });
    expect(props.disabled).toBe(false);
    expect(props.isWaiting).toBe(false);
  });

  it("returns isWaiting when waiting with input channel", () => {
    const props = renderSessionMessageInputProps({
      status: "waiting",
      hasInputChannel: true,
      tool: "claude",
    });
    expect(props.disabled).toBe(false);
    expect(props.isWaiting).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/SessionMessageInput.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement SessionMessageInput component**

```typescript
// src/renderer/components/SessionMessageInput.tsx
import { useEffect, useRef, useState } from "react";
import type { SessionStatus } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";

type SessionMessageInputProps = {
  sessionId: string;
  status: SessionStatus;
  hasInputChannel: boolean;
  tool: string;
  onSend: (sessionId: string, text: string) => void;
};

export function getPlaceholder(
  status: SessionStatus,
  hasInputChannel: boolean,
  tool: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!hasInputChannel) {
    return t("sendMessage.placeholder.disconnected", { agent: tool });
  }
  if (status === "waiting") {
    return t("sendMessage.placeholder.waiting");
  }
  return t("sendMessage.placeholder.running", { agent: tool });
}

export function renderSessionMessageInputProps(options: {
  status: SessionStatus;
  hasInputChannel: boolean;
  tool: string;
}) {
  const disabled = !options.hasInputChannel;
  const isWaiting = options.status === "waiting" && options.hasInputChannel;
  return { disabled, isWaiting };
}

export function SessionMessageInput({
  sessionId,
  status,
  hasInputChannel,
  tool,
  onSend,
}: SessionMessageInputProps) {
  const i18n = useI18n();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const errorTimerRef = useRef(0);

  const { disabled, isWaiting } = renderSessionMessageInputProps({
    status,
    hasInputChannel,
    tool,
  });

  const placeholder = getPlaceholder(status, hasInputChannel, tool, i18n.t);

  useEffect(() => {
    return window.codepal.onSendMessageResult((result) => {
      if (result.sessionId !== sessionId) return;
      if (result.result === "error") {
        setError(result.error ?? i18n.t("sendMessage.error.default"));
        window.clearTimeout(errorTimerRef.current);
        errorTimerRef.current = window.setTimeout(() => setError(null), 3000);
      }
    });
  }, [sessionId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(sessionId, trimmed);
    setText("");
    setError(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  const className = [
    "session-message-input",
    isWaiting ? "session-message-input--waiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div className={className}>
        <input
          ref={inputRef}
          type="text"
          className="session-message-input__field"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          type="button"
          className="session-message-input__btn"
          onClick={handleSubmit}
          disabled={disabled || text.trim().length === 0}
        >
          {i18n.t("sendMessage.send")} ↵
        </button>
      </div>
      {error ? <div className="session-message-input__error">{error}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/SessionMessageInput.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SessionMessageInput.tsx src/renderer/components/SessionMessageInput.test.tsx
git commit -m "feat: add SessionMessageInput component with waiting animation"
```

---

### Task 9: Integrate Input + Local Echo into SessionHistoryTimeline

**Files:**
- Modify: `src/renderer/components/SessionHistoryTimeline.tsx`

**Context:** `SessionHistoryTimeline` renders the expanded session content. The `<SessionMessageInput>` should appear after the pending actions block and before the footer. Local echo inserts a temporary user message into the timeline on send.

- [ ] **Step 1: Add import and local echo state**

At the top of `SessionHistoryTimeline.tsx`, add:

```typescript
import { SessionMessageInput } from "./SessionMessageInput";
```

Inside the component function, after the existing state declarations (around line 498), add:

```typescript
const [localUserMessages, setLocalUserMessages] = useState<ActivityItem[]>([]);
```

- [ ] **Step 2: Merge local user messages into mergedItems**

Replace the existing `mergedItems` useMemo:

```typescript
const mergedItemsBase = useMemo(
  () => mergeSessionTimelineItems(session.timelineItems, persistedItems),
  [session.timelineItems, persistedItems],
);

const mergedItems = useMemo(() => {
  if (localUserMessages.length === 0) return mergedItemsBase;
  // Filter out local messages that now appear in the real timeline (dedup)
  const realIds = new Set(mergedItemsBase.map((item) => item.id));
  const realBodies = new Set(
    mergedItemsBase
      .filter((item) => item.source === "user")
      .map((item) => item.body.trim()),
  );
  const remaining = localUserMessages.filter(
    (msg) => !realIds.has(msg.id) && !realBodies.has(msg.body.trim()),
  );
  if (remaining.length === 0) return mergedItemsBase;
  // Local user messages go at the end (most recent)
  return [
    ...mergedItemsBase,
    ...remaining.map((item) => ({
      ...item,
      label: undefined,
    })),
  ];
}, [mergedItemsBase, localUserMessages]);
```

- [ ] **Step 3: Add handleSendMessage callback**

After the existing `handleRespond` function:

```typescript
function handleSendMessage(sessionId: string, text: string) {
  const localItem: ActivityItem = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "message",
    source: "user",
    body: text,
    timestamp: Date.now(),
  };
  setLocalUserMessages((prev) => [...prev, localItem]);
  shouldStickToBottomRef.current = true;
  window.codepal.sendMessage(sessionId, text);
}
```

- [ ] **Step 4: Render SessionMessageInput in the JSX**

In the return JSX, after the pending actions `</div>` (the `session-row__interaction` block) and before `{footer}`, add:

```typescript
{(session.status === "running" || session.status === "waiting") ? (
  <SessionMessageInput
    sessionId={session.id}
    status={session.status}
    hasInputChannel={session.hasInputChannel ?? false}
    tool={session.tool}
    onSend={handleSendMessage}
  />
) : null}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/renderer/components/SessionHistoryTimeline.test.ts`
Expected: All tests pass

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/SessionHistoryTimeline.tsx
git commit -m "feat: integrate SessionMessageInput with local echo into timeline"
```

---

### Task 10: Keep-Alive Hook Subcommand

**Files:**
- Create: `src/main/hook/keepAliveHook.ts`
- Create: `src/main/hook/keepAliveHook.test.ts`
- Modify: `src/main/hook/runHookCli.ts`

**Context:** The hook CLI dispatches via `parseArgv` (line 43 of `runHookCli.ts`). We add a new `kind: "keep-alive"` that connects to the IPC Hub, sends an initial registration event, then listens for incoming `user_message` lines and writes them to stdout.

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/hook/keepAliveHook.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import net from "node:net";
import { runKeepAliveHook } from "./keepAliveHook";

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runKeepAliveHook", () => {
  let server: net.Server;
  let port: number;
  let receivedLines: string[];
  let clientSocket: net.Socket | null;

  afterEach(() => {
    clientSocket?.destroy();
    server?.close();
  });

  async function startServer(): Promise<void> {
    receivedLines = [];
    clientSocket = null;
    server = net.createServer((socket) => {
      clientSocket = socket;
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (line.length > 0) receivedLines.push(line);
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as net.AddressInfo).port;
  }

  it("connects and sends registration event", async () => {
    await startServer();

    const stdout: string[] = [];
    const writeStdout = (s: string) => { stdout.push(s); };
    const abort = new AbortController();

    const promise = runKeepAliveHook({
      sessionId: "ka-1",
      tool: "codebuddy",
      host: "127.0.0.1",
      port,
      writeStdout,
      signal: abort.signal,
    });

    await waitMs(100);
    expect(receivedLines.length).toBe(1);
    const parsed = JSON.parse(receivedLines[0]);
    expect(parsed.type).toBe("status_change");
    expect(parsed.sessionId).toBe("ka-1");
    expect(parsed.tool).toBe("codebuddy");
    expect(parsed.keepAlive).toBe(true);

    abort.abort();
    await promise;
  });

  it("forwards user_message lines to stdout", async () => {
    await startServer();

    const stdout: string[] = [];
    const writeStdout = (s: string) => { stdout.push(s); };
    const abort = new AbortController();

    const promise = runKeepAliveHook({
      sessionId: "ka-2",
      tool: "claude",
      host: "127.0.0.1",
      port,
      writeStdout,
      signal: abort.signal,
    });

    await waitMs(100);

    // Server sends a user_message back
    const msg = JSON.stringify({ type: "user_message", sessionId: "ka-2", text: "hello", timestamp: Date.now() });
    clientSocket!.write(msg + "\n");
    await waitMs(100);

    expect(stdout.length).toBe(1);
    const parsed = JSON.parse(stdout[0]);
    expect(parsed.type).toBe("user_message");
    expect(parsed.text).toBe("hello");

    abort.abort();
    await promise;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/hook/keepAliveHook.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement keepAliveHook**

```typescript
// src/main/hook/keepAliveHook.ts
import net from "node:net";

type KeepAliveHookOptions = {
  sessionId: string;
  tool: string;
  host: string;
  port: number;
  writeStdout: (line: string) => void;
  signal: AbortSignal;
  socketPath?: string;
};

export async function runKeepAliveHook(options: KeepAliveHookOptions): Promise<void> {
  const { sessionId, tool, host, port, writeStdout, signal, socketPath } = options;

  return new Promise<void>((resolve) => {
    const connectOptions = socketPath
      ? { path: socketPath }
      : { host, port };

    const socket = net.createConnection(connectOptions, () => {
      // Send registration event
      const registration = JSON.stringify({
        type: "status_change",
        sessionId,
        tool,
        status: "running",
        timestamp: Date.now(),
        keepAlive: true,
      });
      socket.write(registration + "\n");
    });

    // Listen for incoming messages from CodePal
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        if (line.length > 0) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "user_message") {
              writeStdout(line);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      }
    });

    function cleanup() {
      socket.destroy();
      resolve();
    }

    signal.addEventListener("abort", cleanup, { once: true });
    socket.on("close", () => {
      signal.removeEventListener("abort", cleanup);
      resolve();
    });
    socket.on("error", () => {
      signal.removeEventListener("abort", cleanup);
      resolve();
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/hook/keepAliveHook.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Wire into runHookCli**

In `src/main/hook/runHookCli.ts`:

1. Add to `ParsedArgv` union:

```typescript
| { kind: "keep-alive"; sessionId: string; tool: string }
```

2. In `parseArgv`, add parsing for `--codepal-hook keep-alive --session-id <id> --tool <tool>`:

```typescript
if (subcommand === "keep-alive") {
  const sessionIdIdx = argv.indexOf("--session-id");
  const toolIdx = argv.indexOf("--tool");
  const sessionId = sessionIdIdx >= 0 ? argv[sessionIdIdx + 1] : undefined;
  const tool = toolIdx >= 0 ? argv[toolIdx + 1] : undefined;
  if (!sessionId || !tool) {
    return { kind: "invalid", message: "keep-alive requires --session-id and --tool" };
  }
  return { kind: "keep-alive", sessionId, tool };
}
```

3. In the dispatch chain of `runHookCli`, add:

```typescript
if (parsed.kind === "keep-alive") {
  const { sendEventLine: _unused, ...env_rest } = env as Record<string, unknown>;
  const host = (env.CODEPAL_IPC_HOST as string) ?? "127.0.0.1";
  const port = Number(env.CODEPAL_IPC_PORT) || 17371;
  const socketPath = env.CODEPAL_SOCKET_PATH as string | undefined;

  const abort = new AbortController();
  process.on("SIGTERM", () => abort.abort());
  process.on("SIGINT", () => abort.abort());

  await runKeepAliveHook({
    sessionId: parsed.sessionId,
    tool: parsed.tool,
    host,
    port,
    writeStdout: (line) => stdout.write(line + "\n"),
    signal: abort.signal,
    socketPath,
  });
  return 0;
}
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/main/hook/keepAliveHook.ts src/main/hook/keepAliveHook.test.ts src/main/hook/runHookCli.ts
git commit -m "feat: add keep-alive hook subcommand for bidirectional agent communication"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ IPC Hub keep-alive + connection registry (Task 2)
- ✅ `hasInputChannel` on SessionRecord (Task 1, 3)
- ✅ `sendMessageToSession` (Task 2)
- ✅ `codepal:send-message` + `codepal:send-message-result` IPC (Task 4, 5)
- ✅ SessionMessageInput component with conditional rendering (Task 8)
- ✅ Running vs waiting vs disconnected placeholder (Task 8)
- ✅ Waiting blue border + breathing animation (Task 7)
- ✅ Error display with 3s auto-dismiss (Task 8)
- ✅ Local echo in timeline (Task 9)
- ✅ i18n keys (Task 6)
- ✅ Keep-alive hook subcommand (Task 10)
- ✅ Agent priority: CodeBuddy first (Task 10 uses "codebuddy" in examples)

**Placeholder scan:** No TBD/TODO/placeholder patterns found.

**Type consistency:** `SendMessagePayload`, `SendMessageResult`, `UserMessageLine` used consistently. `hasInputChannel` field name consistent across all tasks. `sendMessageToSession` signature consistent between Task 2 (implementation) and Task 4 (usage).
