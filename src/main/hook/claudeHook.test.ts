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

  it("maps PermissionRequest into external approval metadata", () => {
    const line = buildClaudeEventLine(
      JSON.stringify({
        session_id: "claude-permission-request",
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        cwd: "/repo",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      sessionId: "claude-permission-request",
      status: "waiting",
      task: "Claude needs your permission to use Bash",
      externalApproval: {
        kind: "approval_required",
        title: "Approval required in Claude Code",
        message: "Claude needs your permission to use Bash",
        sourceTool: "claude",
        jumpTarget: {
          agent: "claude",
          appName: "Terminal",
          workspacePath: "/repo",
          sessionId: "claude-permission-request",
          fallbackBehavior: "activate_app",
        },
      },
      activityItems: [
        expect.objectContaining({
          kind: "note",
          title: "Permission request",
          body: "Claude needs your permission to use Bash",
        }),
      ],
    });
  });

  it("maps PostToolUse into a running tool-result event that clears external approval", () => {
    const line = buildClaudeEventLine(
      JSON.stringify({
        session_id: "claude-post-tool",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_response: { stdout: "ok", stderr: "" },
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      sessionId: "claude-post-tool",
      status: "running",
      task: "Bash",
      externalApproval: null,
      meta: {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
      },
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          title: "Bash",
          body: "ok",
          toolName: "Bash",
          toolPhase: "result",
        }),
      ],
    });
  });

  it("maps PostToolUseFailure into a running tool-result event that clears external approval", () => {
    const line = buildClaudeEventLine(
      JSON.stringify({
        session_id: "claude-post-tool-failed",
        hook_event_name: "PostToolUseFailure",
        tool_name: "Bash",
        error: "Command failed",
      }),
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      sessionId: "claude-post-tool-failed",
      status: "running",
      task: "Bash failed",
      externalApproval: null,
      meta: {
        hook_event_name: "PostToolUseFailure",
        tool_name: "Bash",
      },
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          title: "Bash",
          body: "Command failed",
          toolName: "Bash",
          toolPhase: "result",
          tone: "error",
        }),
      ],
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
      const result = formatClaudePreToolUseResponse(line);
      expect(result).toBeDefined();
      expect(JSON.parse(result!)).toEqual({
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
      const result = formatClaudePreToolUseResponse(line);
      expect(result).toBeDefined();
      expect(JSON.parse(result!)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
        },
      });
    });

    it("returns undefined when the response line is malformed (falls back to native flow)", () => {
      expect(formatClaudePreToolUseResponse("not json")).toBeUndefined();
    });

    it("returns undefined when the response has no clear decision (falls back to native flow)", () => {
      const line = JSON.stringify({
        type: "action_response",
        sessionId: "s",
        actionId: "a",
        response: { kind: "option", value: "something" },
      });
      expect(formatClaudePreToolUseResponse(line)).toBeUndefined();
    });
  });
});
