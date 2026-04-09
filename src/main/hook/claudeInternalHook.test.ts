import { describe, expect, it } from "vitest";
import { buildClaudeInternalEventLine } from "./claudeInternalHook";

describe("claudeInternalHook", () => {
  it("normalizes UserPromptSubmit into a running user-message event", () => {
    const line = buildClaudeInternalEventLine(
      JSON.stringify({
        session_id: "claude-internal-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "hello from claude-internal",
        cwd: "/repo",
      }),
      { CLAUDE_PROJECT_DIR: "/fallback" },
    );

    expect(JSON.parse(line)).toMatchObject({
      type: "status_change",
      sessionId: "claude-internal-1",
      tool: "claude-internal",
      status: "running",
      task: "hello from claude-internal",
      meta: {
        hook_event_name: "UserPromptSubmit",
        cwd: "/repo",
      },
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "user",
          title: "User",
          body: "hello from claude-internal",
        }),
      ],
    });
  });

  it("normalizes Stop into a completed lifecycle event", () => {
    const line = buildClaudeInternalEventLine(
      JSON.stringify({
        session_id: "claude-internal-1",
        hook_event_name: "Stop",
        stop_reason: "end_turn",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      type: "status_change",
      sessionId: "claude-internal-1",
      tool: "claude-internal",
      status: "completed",
      task: "completed",
      meta: {
        hook_event_name: "Stop",
        stop_reason: "end_turn",
      },
      activityItems: [
        expect.objectContaining({
          kind: "system",
          source: "system",
          title: "Session ended",
          body: "Claude Internal request finished",
        }),
      ],
    });
  });

  it("normalizes SessionStart into a running session event", () => {
    const line = buildClaudeInternalEventLine(
      JSON.stringify({
        session_id: "claude-internal-2",
        hook_event_name: "SessionStart",
        cwd: "/project",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      type: "status_change",
      sessionId: "claude-internal-2",
      tool: "claude-internal",
      status: "running",
      task: "Claude Internal session started",
      meta: {
        hook_event_name: "SessionStart",
        cwd: "/project",
      },
    });
  });

  it("normalizes SessionEnd into an idle lifecycle event", () => {
    const line = buildClaudeInternalEventLine(
      JSON.stringify({
        session_id: "claude-internal-1",
        hook_event_name: "SessionEnd",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      type: "status_change",
      sessionId: "claude-internal-1",
      tool: "claude-internal",
      status: "idle",
      task: "session ended",
      meta: {
        hook_event_name: "SessionEnd",
      },
    });
  });

  it("normalizes Notification into a waiting event", () => {
    const line = buildClaudeInternalEventLine(
      JSON.stringify({
        session_id: "claude-internal-1",
        hook_event_name: "Notification",
        message: "Permission needed",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      type: "status_change",
      sessionId: "claude-internal-1",
      tool: "claude-internal",
      status: "waiting",
      task: "Permission needed",
      meta: {
        hook_event_name: "Notification",
        notification_type: "claude_internal_notification",
      },
    });
  });

  it("falls back to CLAUDE_PROJECT_DIR env for cwd", () => {
    const line = buildClaudeInternalEventLine(
      JSON.stringify({
        session_id: "claude-internal-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "test",
      }),
      { CLAUDE_PROJECT_DIR: "/env-fallback" },
    );

    expect(JSON.parse(line)).toMatchObject({
      meta: {
        cwd: "/env-fallback",
      },
    });
  });

  it("throws on missing session_id", () => {
    expect(() =>
      buildClaudeInternalEventLine(
        JSON.stringify({ hook_event_name: "Stop" }),
        {},
      ),
    ).toThrow(/missing session_id/);
  });

  it("throws on empty payload", () => {
    expect(() => buildClaudeInternalEventLine("", {})).toThrow(/empty payload/);
  });

  it("handles unknown hook events as running", () => {
    const line = buildClaudeInternalEventLine(
      JSON.stringify({
        session_id: "claude-internal-1",
        hook_event_name: "CustomEvent",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      tool: "claude-internal",
      status: "running",
      task: "CustomEvent",
    });
  });
});
