import { describe, expect, it, vi } from "vitest";
import { lineToSessionEvent } from "../ingress/hookIngress";
import type { SessionStatus } from "./sessionTypes";
import {
  ACTIVE_SESSION_STALENESS_MS,
  ACTIVE_SESSION_IDLE_TIMEOUT_MS,
  COMPLETED_SESSION_RETENTION_MS,
  ERROR_SESSION_RETENTION_MS,
  createSessionStore,
} from "./sessionStore";

describe("createSessionStore", () => {
  it("updates a session from incoming event envelopes", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      title: "Fix auth bug",
      task: "fix auth bug",
      timestamp: 1,
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "s1",
      tool: "cursor",
      status: "running",
      title: "Fix auth bug",
      task: "fix auth bug",
      activityItems: [
        {
          kind: "note",
          source: "system",
          title: "Running",
          body: "fix auth bug",
          tone: "running",
        },
      ],
    });
  });

  it("preserves session title from incoming event payloads", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "codex",
      status: "running",
      title: "Repo audit",
      task: "scan files",
      timestamp: 10,
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "s1",
      title: "Repo audit",
    });
  });

  it("returns sessions ordered by most recent user message time before updatedAt", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "fallback-newer",
      tool: "codex",
      status: "running",
      task: "fallback-newer",
      timestamp: 10,
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "fallback-newer",
      tool: "codex",
      status: "running",
      task: "fallback-newer update",
      timestamp: 30,
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "user-newest",
      tool: "codex",
      status: "running",
      task: "latest user turn",
      timestamp: 20,
      meta: {
        codex_event_type: "user_message",
      },
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "user-older",
      tool: "codex",
      status: "running",
      task: "older user turn",
      timestamp: 15,
      meta: {
        codex_event_type: "user_message",
      },
    });

    expect(store.getSessions().map((session) => session.id)).toEqual([
      "user-newest",
      "user-older",
      "fallback-newer",
    ]);
  });

  it("hides JetBrains noise sessions that only contain lifecycle placeholders", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "jb-noise",
      tool: "pycharm",
      status: "running",
      title: "bk-aidev",
      timestamp: 100,
      activityItems: [
        {
          id: "jb-noise:start",
          kind: "system",
          source: "system",
          title: "Request started",
          body: "CodeBuddy request started",
          timestamp: 100,
        },
      ],
    });

    store.applyEvent({
      sessionId: "jb-noise",
      tool: "pycharm",
      status: "running",
      title: "bk-aidev",
      timestamp: 101,
      activityItems: [
        {
          id: "jb-noise:placeholder",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "正在整理回复",
          timestamp: 101,
        },
      ],
    });

    expect(store.getSessions()).toEqual([]);
  });

  it("keeps JetBrains sessions visible once the user prompt arrives", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "jb-real",
      tool: "goland",
      status: "running",
      title: "bk-monitor",
      timestamp: 100,
      activityItems: [
        {
          id: "jb-real:start",
          kind: "system",
          source: "system",
          title: "Request started",
          body: "CodeBuddy request started",
          timestamp: 100,
        },
      ],
    });

    store.applyEvent({
      sessionId: "jb-real",
      tool: "goland",
      status: "running",
      title: "bk-monitor",
      timestamp: 101,
      activityItems: [
        {
          id: "jb-real:user",
          kind: "message",
          source: "user",
          title: "User",
          body: "直接回复我 hello，world",
          timestamp: 101,
        },
      ],
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "jb-real",
      lastUserMessageAt: 101,
    });
  });

  it("hides CodeBuddy hook shells once a richer app session with the same user prompt appears", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "cb-hook-shell",
      tool: "codebuddy",
      status: "running",
      task: "startup",
      timestamp: 100,
      activityItems: [
        {
          id: "cb-hook-shell:user",
          kind: "message",
          source: "user",
          title: "User",
          body: "给我一句话",
          timestamp: 100,
        },
        {
          id: "cb-hook-shell:placeholder",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "正在整理回复...",
          timestamp: 101,
        },
      ],
    });

    store.applyEvent({
      sessionId: "codebuddy-ui:1759217450870",
      tool: "codebuddy",
      status: "completed",
      task: "你好！",
      timestamp: 102,
      activityItems: [
        {
          id: "codebuddy-ui:1759217450870:user",
          kind: "message",
          source: "user",
          title: "User",
          body: "给我一句话",
          timestamp: 100,
        },
        {
          id: "codebuddy-ui:1759217450870:assistant",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "你好！",
          timestamp: 102,
        },
      ],
    });

    expect(store.getSessions()).toMatchObject([
      {
        id: "codebuddy-ui:1759217450870",
        task: "你好！",
      },
    ]);
  });

  it("hides CodeBuddy completed shells that have no meaningful activity", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "cb-empty-complete",
      tool: "codebuddy",
      status: "completed",
      timestamp: 100,
    });

    expect(store.getSessions()).toEqual([]);
  });

  it("keeps CodeBuddy history sessions visible once the restored user prompt exists", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "cb-history-real",
      tool: "codebuddy",
      status: "running",
      task: "欢迎使用 CodePal",
      timestamp: 100,
      activityItems: [
        {
          id: "cb-history-real:user",
          kind: "message",
          source: "user",
          title: "User",
          body: "欢迎使用 CodePal",
          timestamp: 100,
        },
      ],
    });

    store.applyEvent({
      sessionId: "cb-history-real",
      tool: "codebuddy",
      status: "completed",
      task: "谢谢！我是CodePal，很高兴为您服务。请问有什么可以帮您的？",
      timestamp: 101,
      activityItems: [
        {
          id: "cb-history-real:assistant",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "谢谢！我是CodePal，很高兴为您服务。请问有什么可以帮您的？",
          timestamp: 101,
        },
      ],
    });

    expect(store.getSessions()).toMatchObject([
      {
        id: "cb-history-real",
        lastUserMessageAt: 100,
        task: "谢谢！我是CodePal，很高兴为您服务。请问有什么可以帮您的？",
      },
    ]);
  });

  it("merges cursor generation-only events into an existing stable session from the same cwd", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "cursor-conv-1",
      tool: "cursor",
      status: "running",
      task: "ship it",
      timestamp: 100,
      meta: {
        cwd: "/tmp/demo",
        cursor_session_id_source: "conversation",
      },
      activityItems: [
        {
          id: "cursor-conv-1:user",
          kind: "message",
          source: "user",
          title: "User",
          body: "ship it",
          timestamp: 100,
        },
      ],
    });

    store.applyEvent({
      sessionId: "cursor-gen-1",
      tool: "cursor",
      status: "running",
      task: "done",
      timestamp: 101,
      meta: {
        cwd: "/tmp/demo",
        cursor_session_id_source: "generation",
      },
      activityItems: [
        {
          id: "cursor-gen-1:assistant",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "done",
          timestamp: 101,
        },
      ],
    });

    expect(store.getSessions()).toMatchObject([
      {
        id: "cursor-conv-1",
        task: "done",
        lastUserMessageAt: 100,
        activityItems: [
          expect.objectContaining({
            source: "assistant",
            body: "done",
          }),
          expect.objectContaining({
            source: "user",
            body: "ship it",
          }),
        ],
      },
    ]);
  });

  it("promotes a later stable cursor session id and absorbs the earlier generation-only shell", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "cursor-gen-1",
      tool: "cursor",
      status: "running",
      task: "done",
      timestamp: 100,
      meta: {
        cwd: "/tmp/demo",
        cursor_session_id_source: "generation",
      },
      activityItems: [
        {
          id: "cursor-gen-1:assistant",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "done",
          timestamp: 100,
        },
      ],
    });

    store.applyEvent({
      sessionId: "cursor-conv-1",
      tool: "cursor",
      status: "running",
      task: "ship it",
      timestamp: 101,
      meta: {
        cwd: "/tmp/demo",
        cursor_session_id_source: "conversation",
      },
      activityItems: [
        {
          id: "cursor-conv-1:user",
          kind: "message",
          source: "user",
          title: "User",
          body: "ship it",
          timestamp: 101,
        },
      ],
    });

    expect(store.getSessions()).toMatchObject([
      {
        id: "cursor-conv-1",
        lastUserMessageAt: 101,
        activityItems: [
          expect.objectContaining({
            source: "user",
            body: "ship it",
          }),
          expect.objectContaining({
            source: "assistant",
            body: "done",
          }),
        ],
      },
    ]);
  });

  it("preserves lastUserMessageAt across non-user follow-up events", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "codex-followup",
      tool: "codex",
      status: "running",
      task: "请继续",
      timestamp: 100,
      meta: {
        codex_event_type: "user_message",
      },
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "codex-followup",
      tool: "codex",
      status: "completed",
      task: "已经完成。",
      timestamp: 200,
      meta: {
        codex_event_type: "task_complete",
      },
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "codex-followup",
      updatedAt: 200,
      lastUserMessageAt: 100,
    });
  });

  it("updates a running Codex session to idle when an interrupted turn aborts", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "codex-1",
      tool: "codex",
      status: "running",
      task: "Working",
      timestamp: 10,
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "codex-1",
      tool: "codex",
      status: "idle",
      task: "Turn aborted",
      timestamp: 11,
      meta: {
        codex_event_type: "turn_aborted",
      },
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "codex-1",
      status: "idle",
      task: "Turn aborted",
    });
  });

  it("keeps recent activity lines in reverse chronological order", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      task: "scan repo",
      timestamp: 1,
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      task: "request approval",
      timestamp: 2,
      pendingAction: {
        id: "a1",
        type: "approval",
        title: "Continue?",
        options: ["Yes", "No"],
      },
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      task: "resumed work",
      timestamp: 3,
      pendingClosed: {
        actionId: "a1",
        reason: "consumed_local",
      },
    });

    expect(store.getSessions()[0].activityItems?.map((item) => item.body)).toEqual([
      "resumed work",
      "Closed action a1 (consumed_local)",
      "request approval",
      "Continue?",
      "scan repo",
    ]);
  });

  it("orders activity items by their own timestamps, not just arrival order", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "jb-ordered",
      tool: "pycharm",
      status: "running",
      timestamp: 300,
      activityItems: [
        {
          id: "late-arrival-old-item",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "older assistant text",
          timestamp: 100,
        },
      ],
      meta: {
        jetbrains_status_source: "activity",
      },
    });
    store.applyEvent({
      sessionId: "jb-ordered",
      tool: "pycharm",
      status: "completed",
      timestamp: 200,
      activityItems: [
        {
          id: "newer-finish",
          kind: "system",
          source: "system",
          title: "Request finished",
          body: "CodeBuddy request finished",
          timestamp: 200,
          tone: "completed",
        },
      ],
      meta: {
        jetbrains_status_source: "lifecycle",
      },
    });

    expect(store.getSessions()[0].activityItems?.map((item) => item.body)).toEqual([
      "CodeBuddy request finished",
      "older assistant text",
    ]);
  });

  it("does not let late activity-only events reopen a completed JetBrains session", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "jb-finished",
      tool: "pycharm",
      status: "completed",
      timestamp: 200,
      task: "PyCharm · demo",
      activityItems: [
        {
          id: "finished",
          kind: "system",
          source: "system",
          title: "Request finished",
          body: "CodeBuddy request finished",
          timestamp: 200,
          tone: "completed",
        },
      ],
      meta: {
        jetbrains_status_source: "lifecycle",
      },
    });
    store.applyEvent({
      sessionId: "jb-finished",
      tool: "pycharm",
      status: "running",
      timestamp: 300,
      task: "PyCharm · demo",
      activityItems: [
        {
          id: "assistant-late",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "hello, world",
          timestamp: 300,
        },
      ],
      meta: {
        jetbrains_status_source: "activity",
      },
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "jb-finished",
      status: "completed",
      updatedAt: 300,
      activityItems: [
        expect.objectContaining({
          body: "hello, world",
        }),
        expect.objectContaining({
          body: "CodeBuddy request finished",
        }),
      ],
    });
  });

  it("uses event meta to produce richer activity descriptions", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "cb-1",
      tool: "codebuddy",
      status: "waiting",
      task: "CodeBuddy needs your permission to use Bash",
      timestamp: 10,
      meta: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        tool_name: "Bash",
      },
    });

    store.applyEvent({
      type: "status_change",
      sessionId: "cb-1",
      tool: "codebuddy",
      status: "running",
      task: "Bash",
      timestamp: 11,
      meta: {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
      },
    });

    expect(store.getSessions()[0].activityItems).toEqual([
      expect.objectContaining({
        kind: "tool",
        title: "Bash",
        toolName: "Bash",
        toolPhase: "call",
      }),
      expect.objectContaining({
        kind: "note",
        title: "Notification",
        tone: "waiting",
      }),
    ]);
  });

  it("backfills codex tool result names from the earlier call when function_call_output only has call_id", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "codex-tools",
      tool: "codex",
      status: "running",
      task: "shell",
      timestamp: 10,
      activityItems: [
        {
          id: "call-item",
          kind: "tool",
          source: "tool",
          title: "shell",
          body: "{\"command\":\"npm test\"}",
          timestamp: 10,
          toolName: "shell",
          toolPhase: "call",
          meta: {
            callId: "call_123",
          },
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "function_call",
      },
    });

    store.applyEvent({
      type: "status_change",
      sessionId: "codex-tools",
      tool: "codex",
      status: "running",
      task: "PASS npm test",
      timestamp: 11,
      activityItems: [
        {
          id: "result-item",
          kind: "tool",
          source: "tool",
          title: "Tool",
          body: "PASS npm test",
          timestamp: 11,
          toolName: "Tool",
          toolPhase: "result",
          meta: {
            callId: "call_123",
          },
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "function_call_output",
      },
    });

    expect(store.getSessions()[0].activityItems).toEqual([
      expect.objectContaining({
        kind: "tool",
        title: "shell",
        toolName: "shell",
        toolPhase: "result",
        body: "PASS npm test",
      }),
      expect.objectContaining({
        kind: "tool",
        title: "shell",
        toolName: "shell",
        toolPhase: "call",
        body: "{\"command\":\"npm test\"}",
      }),
    ]);
  });

  it("keeps codex user and agent messages distinguishable in activity lines", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "codex-roles",
      tool: "codex",
      status: "running",
      task: "请继续优化 UI",
      timestamp: 1,
      meta: {
        codex_event_type: "user_message",
      },
    });

    store.applyEvent({
      type: "status_change",
      sessionId: "codex-roles",
      tool: "codex",
      status: "completed",
      task: "我先把消息和工具块拆开。",
      timestamp: 2,
      meta: {
        codex_event_type: "task_complete",
      },
    });

    expect(store.getSessions()[0].activityItems).toEqual([
      expect.objectContaining({
        kind: "message",
        source: "assistant",
        body: "我先把消息和工具块拆开。",
      }),
      expect.objectContaining({
        kind: "message",
        source: "user",
        body: "请继续优化 UI",
      }),
    ]);
  });

  it("surfaces unsupported cursor actions as visible degraded activities", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "cursor-unsupported",
      tool: "cursor",
      status: "waiting",
      task: "Unsupported Cursor action: text_input",
      timestamp: 20,
      meta: {
        hook_event_name: "Notification",
        unsupported_action_type: "text_input",
      },
      pendingAction: null,
    });

    expect(store.getSessions()[0].activityItems).toEqual([
      expect.objectContaining({
        kind: "system",
        body: "Unsupported Cursor action: text_input",
      }),
    ]);
  });

  it("does not persist sessions when status is not a known enum value", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "bogus" as SessionStatus,
      timestamp: 1,
    });

    expect(store.getSessions()).toHaveLength(0);
  });

  it("expires completed history sessions after the dashboard retention window", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "done-1",
      tool: "cursor",
      status: "completed",
      timestamp: 1,
    });
    store.applyEvent({
      sessionId: "live-1",
      tool: "cursor",
      status: "running",
      timestamp: 1 + COMPLETED_SESSION_RETENTION_MS,
    });

    expect(store.expireStaleSessions(1 + COMPLETED_SESSION_RETENTION_MS + 1)).toBe(true);
    expect(store.getSessions().map((session) => session.id)).toEqual(["live-1"]);
  });

  it("keeps error sessions longer than completed history before expiring them", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "error-1",
      tool: "cursor",
      status: "error",
      timestamp: 100,
    });

    expect(store.expireStaleSessions(100 + COMPLETED_SESSION_RETENTION_MS + 1)).toBe(false);
    expect(store.getSessions().map((session) => session.id)).toEqual(["error-1"]);

    expect(store.expireStaleSessions(100 + ERROR_SESSION_RETENTION_MS + 1)).toBe(true);
    expect(store.getSessions()).toEqual([]);
  });

  it("expires stale waiting sessions after the active-session freshness window", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "wait-1",
      tool: "cursor",
      status: "waiting",
      timestamp: 10,
    });

    expect(store.expireStaleSessions(10 + ACTIVE_SESSION_STALENESS_MS + 1)).toBe(true);
    expect(store.getSessions()).toEqual([]);
  });

  it("demotes stale running sessions to idle before retention cleanup", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "stale-running",
      tool: "claude",
      status: "running",
      timestamp: 10,
      task: "Working",
    });

    expect(store.demoteStaleActiveSessions(10 + ACTIVE_SESSION_IDLE_TIMEOUT_MS - 1)).toBe(false);
    expect(store.getSessions()[0]?.status).toBe("running");

    expect(store.demoteStaleActiveSessions(10 + ACTIVE_SESSION_IDLE_TIMEOUT_MS + 1)).toBe(true);
    expect(store.getSessions()[0]).toMatchObject({
      id: "stale-running",
      status: "idle",
      updatedAt: 10,
    });
  });

  it("trims history to the newest retained sessions without dropping current sessions", () => {
    const store = createSessionStore();

    for (let index = 0; index < 152; index += 1) {
      store.applyEvent({
        sessionId: `history-${index}`,
        tool: "codex",
        status: "completed",
        timestamp: 1_000 + index,
      });
    }

    store.applyEvent({
      sessionId: "live-1",
      tool: "cursor",
      status: "waiting",
      timestamp: 999_999,
    });

    expect(store.expireStaleSessions(999_999)).toBe(true);

    const ids = store.getSessions().map((session) => session.id);
    expect(ids).toContain("live-1");
    expect(ids).toContain("history-151");
    expect(ids).toContain("history-2");
    expect(ids).not.toContain("history-1");
    expect(ids).not.toContain("history-0");
    expect(ids).toHaveLength(151);
  });

  it("clears retained history sessions without removing running or waiting sessions", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "running-1",
      tool: "cursor",
      status: "running",
      timestamp: 100,
    });
    store.applyEvent({
      sessionId: "waiting-1",
      tool: "claude",
      status: "waiting",
      timestamp: 110,
    });
    store.applyEvent({
      sessionId: "completed-1",
      tool: "codex",
      status: "completed",
      timestamp: 120,
    });
    store.applyEvent({
      sessionId: "idle-1",
      tool: "codebuddy",
      status: "idle",
      timestamp: 130,
    });
    store.applyEvent({
      sessionId: "error-1",
      tool: "cursor",
      status: "error",
      timestamp: 140,
    });

    expect(store.clearHistorySessions()).toBe(true);
    expect(store.getSessions().map((session) => session.id)).toEqual(["waiting-1", "running-1"]);
  });

  it("stores pendingAction from status_change envelope as pendingActions", () => {
    const store = createSessionStore();
    const pendingAction = {
      id: "a1",
      type: "approval" as const,
      title: "Continue?",
      options: ["Yes", "No"],
    };

    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction,
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "s1",
      pendingActions: [pendingAction],
    });
    expect(store.getSessions()[0]).not.toHaveProperty("responseTarget");
  });

  it("stores externalApproval on session records", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "s-external",
      tool: "claude",
      status: "waiting",
      timestamp: 10,
      externalApproval: {
        kind: "approval_required",
        title: "Claude permission required",
        message: "Approve in Terminal",
        sourceTool: "claude",
        updatedAt: 10,
      },
    });

    expect(store.getSessions()[0].externalApproval).toEqual(
      expect.objectContaining({
        title: "Claude permission required",
        sourceTool: "claude",
      }),
    );
  });

  it("clears externalApproval when a later event sends null", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "s-external",
      tool: "claude",
      status: "waiting",
      timestamp: 10,
      externalApproval: {
        kind: "approval_required",
        title: "Claude permission required",
        message: "Approve in Terminal",
        sourceTool: "claude",
        updatedAt: 10,
      },
    });
    store.applyEvent({
      sessionId: "s-external",
      tool: "claude",
      status: "running",
      timestamp: 11,
      externalApproval: null,
    });

    expect(store.getSessions()[0]).not.toHaveProperty("externalApproval");
  });

  it("accumulates two different actionIds on the same session in pendingActions", () => {
    const store = createSessionStore();
    const a1 = {
      id: "a1",
      type: "approval" as const,
      title: "First",
      options: ["OK"],
    };
    const a2 = {
      id: "a2",
      type: "single_choice" as const,
      title: "Second",
      options: ["X", "Y"],
    };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: a1,
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: a2,
    });
    const rec = store.getSessions()[0];
    expect(rec.pendingActions).toHaveLength(2);
    expect(rec.pendingActions).toEqual(expect.arrayContaining([a1, a2]));
  });

  it("keeps pendingActions unchanged when a later event omits pendingAction", () => {
    const store = createSessionStore();
    const a1 = {
      id: "a1",
      type: "approval" as const,
      title: "First",
      options: ["OK"],
    };
    const a2 = {
      id: "a2",
      type: "single_choice" as const,
      title: "Second",
      options: ["X"],
    };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: a1,
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: a2,
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      task: "still going",
      timestamp: 3,
    });
    const rec = store.getSessions()[0];
    expect(rec.status).toBe("running");
    expect(rec.task).toBe("still going");
    expect(rec.updatedAt).toBe(3);
    expect(rec.pendingActions).toHaveLength(2);
    expect(rec.pendingActions).toEqual(expect.arrayContaining([a1, a2]));
  });

  it("upserts same actionId and replaces action fields; retains responseTarget when follow-up omits it", () => {
    const store = createSessionStore();
    const t1 = { mode: "socket" as const, socketPath: "/a.sock" };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "x", type: "approval", title: "Old", options: ["Allow", "Deny"] },
      responseTarget: t1,
    });
    const updated = {
      id: "x",
      type: "approval" as const,
      title: "NewTitle",
      options: ["Allow", "Deny"],
    };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: updated,
    });
    expect(store.getSessions()[0].pendingActions).toEqual([updated]);
    expect(store.preparePendingActionResponse("s1", "x", "Allow")).toMatchObject({
      responseTarget: t1,
    });
  });

  it("upserts same actionId and overwrites responseTarget when follow-up includes responseTarget", () => {
    const store = createSessionStore();
    const t1 = { mode: "socket" as const, socketPath: "/old.sock" };
    const t2 = { mode: "socket" as const, socketPath: "/new.sock" };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "x", type: "approval", title: "T", options: ["Allow", "Deny"] },
      responseTarget: t1,
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: { id: "x", type: "approval", title: "T", options: ["Allow", "Deny"] },
      responseTarget: t2,
    });
    expect(store.preparePendingActionResponse("s1", "x", "Allow")).toMatchObject({
      responseTarget: t2,
    });
  });

  it("preparePendingActionResponse returns line and responseTarget for matching action", () => {
    const store = createSessionStore();
    const target = { mode: "socket" as const, socketPath: "/tmp/x.sock", timeoutMs: 500 };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-x",
        type: "approval",
        title: "T",
        options: ["Allow", "Deny"],
      },
      responseTarget: target,
    });
    const prep = store.preparePendingActionResponse("s1", "act-x", "Allow");
    expect(prep).toEqual({
      line: JSON.stringify({
        type: "action_response",
        sessionId: "s1",
        actionId: "act-x",
        response: { kind: "approval", decision: "allow" },
      }),
      responseTarget: target,
    });
    expect(store.getSessions()[0].pendingActions).toHaveLength(1);
  });

  it("rejects approval responses outside the allowed decision set", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-x",
        type: "approval",
        title: "T",
        options: ["Allow", "Deny"],
      },
    });

    expect(() => store.preparePendingActionResponse("s1", "act-x", "Later")).toThrow(
      "invalid approval option",
    );
    expect(store.getSessions()[0].pendingActions).toHaveLength(1);
  });

  it("completePendingActionResponse removes only the given actionId", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "keep-me",
        type: "approval",
        title: "K",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: {
        id: "remove-me",
        type: "approval",
        title: "R",
        options: ["OK"],
      },
    });
    store.completePendingActionResponse("s1", "remove-me");
    const rec = store.getSessions()[0];
    expect(rec.pendingActions).toEqual([
      expect.objectContaining({ id: "keep-me" }),
    ]);
    expect(rec.activities?.[0]).toBe("Closed action remove-me (consumed_local)");
    expect(store.isPendingActionClosed("s1", "remove-me")).toBe(true);
    expect(store.preparePendingActionResponse("s1", "remove-me", "OK")).toBeNull();
  });

  it("clears all pending when envelope sends pendingAction null", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "a1",
        type: "approval",
        title: "T",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: {
        id: "a2",
        type: "approval",
        title: "T2",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      timestamp: 3,
      pendingAction: null,
    });
    expect(store.getSessions()[0].pendingActions).toBeUndefined();
    expect(store.isPendingActionClosed("s1", "a1")).toBe(true);
    expect(store.isPendingActionClosed("s1", "a2")).toBe(true);
  });

  it("respondToPendingAction clears pending and returns action_response JSON", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
    });

    const line = store.respondToPendingAction("s1", "act-1", "A");
    expect(line).toBe(
      JSON.stringify({
        type: "action_response",
        sessionId: "s1",
        actionId: "act-1",
        response: { kind: "option", value: "A" },
      }),
    );
    expect(store.getSessions()[0].pendingActions).toBeUndefined();
  });

  it("clears stale pending when raw hook sends invalid pendingAction (hookIngress + store)", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "c3",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "old",
        type: "approval",
        title: "Old",
        options: ["OK"],
      },
    });
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "StatusChange",
        session_id: "c3",
        status: "running",
        pendingAction: { id: "bad", type: "nope", title: "t", options: [] },
      }),
    );
    expect(ev?.pendingAction).toBeNull();
    expect(ev).not.toBeNull();
    store.applyEvent(ev!);
    expect(store.getSessions()[0].pendingActions).toBeUndefined();
    expect(store.getSessions()[0].status).toBe("running");
  });

  it("respondToPendingAction refreshes updatedAt on success", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      const store = createSessionStore();
      store.applyEvent({
        sessionId: "s1",
        tool: "cursor",
        status: "waiting",
        timestamp: 1000,
        pendingAction: {
          id: "act-1",
          type: "approval",
          title: "T",
          options: ["Allow", "Deny"],
        },
      });
      vi.setSystemTime(5000);
      store.respondToPendingAction("s1", "act-1", "Allow");
      expect(store.getSessions()[0].updatedAt).toBe(5000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closePendingAction removes only the matching action", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "a1",
        type: "approval",
        title: "First",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: {
        id: "a2",
        type: "approval",
        title: "Second",
        options: ["OK"],
      },
    });
    store.closePendingAction("s1", "a1", "cancelled");
    const rec = store.getSessions()[0];
    expect(rec.pendingActions).toEqual([expect.objectContaining({ id: "a2" })]);
    expect(rec.activities?.[0]).toBe("Closed action a1 (cancelled)");
    expect(store.isPendingActionClosed("s1", "a1")).toBe(true);
    expect(store.isPendingActionClosed("s1", "a2")).toBe(false);
  });

  it("pendingClosed on an event removes only that action when pendingAction is omitted", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "a1",
        type: "approval",
        title: "First",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: {
        id: "a2",
        type: "approval",
        title: "Second",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 3,
      pendingClosed: { actionId: "a1", reason: "consumed_remote" },
    });
    const rec = store.getSessions()[0];
    expect(rec.pendingActions).toHaveLength(1);
    expect(rec.pendingActions).toEqual([expect.objectContaining({ id: "a2" })]);
    expect(store.isPendingActionClosed("s1", "a1")).toBe(true);
  });

  it("records pendingClosed even when the action is not currently pending", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "a1",
        type: "approval",
        title: "First",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      timestamp: 2,
      pendingClosed: { actionId: "missing-action", reason: "consumed_remote" },
    });
    expect(store.isPendingActionClosed("s1", "missing-action")).toBe(true);
    expect(store.getSessions()[0].pendingActions).toEqual([
      expect.objectContaining({ id: "a1" }),
    ]);
  });

  it("expireStalePendingActions removes expired pendings and marks them closed", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1_000,
      pendingAction: {
        id: "stale",
        type: "approval",
        title: "Old",
        options: ["OK"],
      },
      responseTarget: { mode: "socket", socketPath: "/a.sock", timeoutMs: 100 },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1_000,
      pendingAction: {
        id: "fresh",
        type: "approval",
        title: "New",
        options: ["OK"],
      },
      responseTarget: { mode: "socket", socketPath: "/b.sock", timeoutMs: 10_000 },
    });
    expect(store.expireStalePendingActions(1_500)).toBe(true);
    const rec = store.getSessions()[0];
    expect(rec.pendingActions?.map((a) => a.id)).toEqual(["fresh"]);
    expect(rec.activities?.[0]).toBe("Closed action stale (expired)");
    expect(store.isPendingActionClosed("s1", "stale")).toBe(true);
    expect(store.isPendingActionClosed("s1", "fresh")).toBe(false);
    expect(store.preparePendingActionResponse("s1", "stale", "OK")).toBeNull();
  });

  it("expireStalePendingActions returns false when nothing expires", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1_000,
      pendingAction: {
        id: "fresh",
        type: "approval",
        title: "New",
        options: ["OK"],
      },
      responseTarget: { mode: "socket", socketPath: "/b.sock", timeoutMs: 10_000 },
    });

    expect(store.expireStalePendingActions(1_500)).toBe(false);
    expect(store.getSessions()[0].pendingActions?.map((a) => a.id)).toEqual(["fresh"]);
  });

  it("preparePendingActionResponse returns null after closePendingAction (duplicate prep)", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "x",
        type: "approval",
        title: "T",
        options: ["Allow", "Deny"],
      },
    });
    expect(store.preparePendingActionResponse("s1", "x", "Allow")).not.toBeNull();
    store.closePendingAction("s1", "x", "cancelled");
    expect(store.preparePendingActionResponse("s1", "x", "Allow")).toBeNull();
  });

  it("re-upsert after close clears closed ledger and allows prepare again", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "x",
        type: "approval",
        title: "T",
        options: ["Allow", "Deny"],
      },
    });
    store.closePendingAction("s1", "x", "cancelled");
    expect(store.isPendingActionClosed("s1", "x")).toBe(true);
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: {
        id: "x",
        type: "approval",
        title: "Again",
        options: ["Allow", "Deny"],
      },
    });
    expect(store.isPendingActionClosed("s1", "x")).toBe(false);
    expect(store.preparePendingActionResponse("s1", "x", "Allow")).not.toBeNull();
  });

  describe("onStatusChange callback", () => {
    it("fires when session status changes", () => {
      const onChange = vi.fn();
      const store = createSessionStore({ onStatusChange: onChange });

      store.applyEvent({
        sessionId: "s1",
        tool: "cursor",
        status: "running",
        title: "Fix bug",
        timestamp: 1,
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "s1",
          tool: "cursor",
          prevStatus: undefined,
          nextStatus: "running",
        }),
      );
    });

    it("does not fire when status stays the same", () => {
      const onChange = vi.fn();
      const store = createSessionStore({ onStatusChange: onChange });

      store.applyEvent({
        sessionId: "s1",
        tool: "cursor",
        status: "running",
        timestamp: 1,
      });
      onChange.mockClear();

      store.applyEvent({
        sessionId: "s1",
        tool: "cursor",
        status: "running",
        timestamp: 2,
      });

      expect(onChange).not.toHaveBeenCalled();
    });

    it("includes lastUserMessage from activity items", () => {
      const onChange = vi.fn();
      const store = createSessionStore({ onStatusChange: onChange });

      store.applyEvent({
        sessionId: "s1",
        tool: "cursor",
        status: "running",
        timestamp: 1,
        activityItems: [
          {
            id: "u1",
            kind: "message",
            source: "user",
            title: "User",
            body: "帮我修登录页面",
            timestamp: 1,
          },
        ],
      });
      onChange.mockClear();

      store.applyEvent({
        sessionId: "s1",
        tool: "cursor",
        status: "completed",
        timestamp: 2,
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          prevStatus: "running",
          nextStatus: "completed",
          lastUserMessage: "帮我修登录页面",
        }),
      );
    });
  });

  describe("seedFromHistory", () => {
    it("restores a completed session from history", () => {
      const store = createSessionStore();
      store.seedFromHistory({
        id: "s1",
        tool: "cursor",
        status: "completed",
        title: "Fix bug",
        latestTask: "debug task",
        updatedAt: Date.now() - 60_000,
        lastUserMessageAt: Date.now() - 120_000,
      });

      const session = store.getSession("s1");
      expect(session).not.toBeNull();
      expect(session!.status).toBe("completed");
      expect(session!.title).toBe("Fix bug");
      expect(session!.task).toBe("debug task");
    });

    it("normalizes running status to idle on restore", () => {
      const store = createSessionStore();
      store.seedFromHistory({
        id: "s1",
        tool: "claude",
        status: "running",
        title: "Active task",
        latestTask: null,
        updatedAt: Date.now(),
        lastUserMessageAt: null,
      });

      expect(store.getSession("s1")!.status).toBe("idle");
    });

    it("normalizes waiting status to idle on restore", () => {
      const store = createSessionStore();
      store.seedFromHistory({
        id: "s1",
        tool: "cursor",
        status: "waiting",
        title: null,
        latestTask: null,
        updatedAt: Date.now(),
        lastUserMessageAt: null,
      });

      expect(store.getSession("s1")!.status).toBe("idle");
    });

    it("does not overwrite an existing session from a live event", () => {
      const store = createSessionStore();
      store.applyEvent({
        sessionId: "s1",
        tool: "cursor",
        status: "running",
        title: "Live title",
        timestamp: Date.now(),
      });

      store.seedFromHistory({
        id: "s1",
        tool: "cursor",
        status: "completed",
        title: "Old title",
        latestTask: null,
        updatedAt: Date.now() - 60_000,
        lastUserMessageAt: null,
      });

      expect(store.getSession("s1")!.title).toBe("Live title");
      expect(store.getSession("s1")!.status).toBe("running");
    });
  });

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
      expect(store.getSession("nonexistent")).toBeNull();
    });
  });
});
