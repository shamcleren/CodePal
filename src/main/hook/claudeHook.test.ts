import { describe, expect, it } from "vitest";
import { buildClaudeEventLine } from "./claudeHook";

describe("claudeHook", () => {
  it("normalizes UserPromptSubmit into a running user-message event", () => {
    const line = buildClaudeEventLine(
      JSON.stringify({
        session_id: "claude-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "hello from claude",
        cwd: "/repo",
      }),
      { CLAUDE_PROJECT_DIR: "/fallback" },
    );

    expect(JSON.parse(line)).toMatchObject({
      type: "status_change",
      sessionId: "claude-1",
      tool: "claude",
      status: "running",
      task: "hello from claude",
      meta: {
        hook_event_name: "UserPromptSubmit",
        cwd: "/repo",
      },
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "user",
          title: "User",
          body: "hello from claude",
        }),
      ],
    });
  });

  it("normalizes Stop into a completed lifecycle event", () => {
    const line = buildClaudeEventLine(
      JSON.stringify({
        session_id: "claude-1",
        hook_event_name: "Stop",
        stop_reason: "end_turn",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      type: "status_change",
      sessionId: "claude-1",
      tool: "claude",
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
          body: "Claude request finished",
        }),
      ],
    });
  });

  it("maps permission notification into external approval metadata", () => {
    const line = buildClaudeEventLine(
      JSON.stringify({
        session_id: "claude-approval-1",
        hook_event_name: "Notification",
        message: "Claude needs your approval to use Bash",
        cwd: "/repo",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      sessionId: "claude-approval-1",
      status: "waiting",
      externalApproval: {
        kind: "approval_required",
        title: "Approval required in Claude Code",
        message: "Claude needs your approval to use Bash",
        sourceTool: "claude",
        jumpTarget: {
          agent: "claude",
          appName: "Terminal",
          workspacePath: "/repo",
          sessionId: "claude-approval-1",
          fallbackBehavior: "activate_app",
        },
      },
    });
  });

  it("maps localized permission notification into external approval metadata", () => {
    const line = buildClaudeEventLine(
      JSON.stringify({
        session_id: "claude-approval-zh",
        hook_event_name: "Notification",
        message: "需要授权后才能继续",
        cwd: "/repo",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      sessionId: "claude-approval-zh",
      status: "waiting",
      externalApproval: {
        kind: "approval_required",
        message: "需要授权后才能继续",
        sourceTool: "claude",
      },
    });
  });
});
