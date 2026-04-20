import { describe, expect, it } from "vitest";
import {
  buildClaudeEventLine,
  formatClaudePreToolUseResponse,
  isClaudePreToolUsePayload,
} from "./claudeHook";

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

  describe("isClaudePreToolUsePayload", () => {
    it("returns true for PreToolUse payloads", () => {
      expect(
        isClaudePreToolUsePayload(
          JSON.stringify({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Bash" }),
        ),
      ).toBe(true);
    });

    it("returns false for other hook events", () => {
      expect(
        isClaudePreToolUsePayload(
          JSON.stringify({ session_id: "s", hook_event_name: "UserPromptSubmit" }),
        ),
      ).toBe(false);
    });

    it("returns false for non-JSON input", () => {
      expect(isClaudePreToolUsePayload("not json")).toBe(false);
    });
  });

  describe("formatClaudePreToolUseResponse", () => {
    it("maps allow decisions to Claude Code permissionDecision: allow", () => {
      const line = JSON.stringify({
        type: "action_response",
        sessionId: "s",
        actionId: "a",
        response: { kind: "approval", decision: "allow" },
      });
      expect(JSON.parse(formatClaudePreToolUseResponse(line))).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: "User approved in CodePal",
        },
      });
    });

    it("maps deny decisions to Claude Code permissionDecision: deny", () => {
      const line = JSON.stringify({
        type: "action_response",
        sessionId: "s",
        actionId: "a",
        response: { kind: "approval", decision: "deny" },
      });
      expect(JSON.parse(formatClaudePreToolUseResponse(line))).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
        },
      });
    });

    it("defaults to deny when the response line is malformed", () => {
      expect(JSON.parse(formatClaudePreToolUseResponse("not json"))).toMatchObject({
        hookSpecificOutput: { permissionDecision: "deny" },
      });
    });
  });
});
