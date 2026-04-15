import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEventLine = vi.hoisted(() => vi.fn<[], Promise<void>>());
const runBlockingHookFromRaw = vi.hoisted(() => vi.fn<[], Promise<string | undefined>>());

vi.mock("./sendEventBridge", () => ({
  sendEventLine,
}));

vi.mock("./blockingHookBridge", () => ({
  runBlockingHookFromRaw,
}));

import { runCodexHookPipeline } from "./codexHook";

describe("runCodexHookPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sendEventLine.mockResolvedValue(undefined);
    runBlockingHookFromRaw.mockResolvedValue(undefined);
  });

  it("forwards non-blocking codex payloads through sendEventLine", async () => {
    await runCodexHookPipeline(
      JSON.stringify({
        type: "status_change",
        sessionId: "codex-1",
        status: "running",
        timestamp: 1,
      }),
      {},
    );

    expect(sendEventLine).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendEventLine.mock.calls[0][0] as string)).toMatchObject({
      tool: "codex",
      source: "codex",
      type: "status_change",
      sessionId: "codex-1",
    });
    expect(runBlockingHookFromRaw).not.toHaveBeenCalled();
  });

  it("ignores notify payloads that do not carry a stable session identity", async () => {
    const line = await runCodexHookPipeline(
      JSON.stringify({
        type: "agent-turn-complete",
        "turn-id": "turn-1",
        "last-assistant-message": "Done",
      }),
      {},
    );

    expect(line).toBeUndefined();
    expect(sendEventLine).not.toHaveBeenCalled();
    expect(runBlockingHookFromRaw).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[CodePal Codex] unsupported notify payload ignored:",
      "missing_session_id",
      "agent-turn-complete",
    );
  });

  it("forwards blocking codex payloads through runBlockingHookFromRaw", async () => {
    runBlockingHookFromRaw.mockResolvedValue('{"ok":true}');

    const line = await runCodexHookPipeline(
      JSON.stringify({
        type: "status_change",
        sessionId: "codex-2",
        status: "waiting",
        timestamp: 2,
        pendingAction: {
          id: "a1",
          type: "approval",
          title: "Continue?",
          options: ["Allow", "Deny"],
        },
      }),
      {},
    );

    expect(line).toBe('{"ok":true}');
    expect(runBlockingHookFromRaw).toHaveBeenCalledTimes(1);
    expect(JSON.parse(runBlockingHookFromRaw.mock.calls[0][0] as string)).toMatchObject({
      tool: "codex",
      source: "codex",
      sessionId: "codex-2",
    });
    expect(sendEventLine).not.toHaveBeenCalled();
  });

  it("downgrades permission notify without pendingAction into external approval event", async () => {
    await runCodexHookPipeline(
      JSON.stringify({
        type: "notification",
        sessionId: "codex-approval-1",
        message: "Codex needs approval to continue",
        cwd: "/repo",
      }),
      {},
    );

    expect(runBlockingHookFromRaw).not.toHaveBeenCalled();
    expect(JSON.parse(sendEventLine.mock.calls[0][0] as string)).toMatchObject({
      type: "status_change",
      sessionId: "codex-approval-1",
      tool: "codex",
      status: "waiting",
      externalApproval: {
        kind: "approval_required",
        title: "Approval required in Codex",
        message: "Codex needs approval to continue",
        sourceTool: "codex",
        jumpTarget: {
          agent: "codex",
          appName: "Terminal",
          workspacePath: "/repo",
          sessionId: "codex-approval-1",
          fallbackBehavior: "activate_app",
        },
      },
    });
  });

  it("recognizes localized permission notify messages", async () => {
    await runCodexHookPipeline(
      JSON.stringify({
        type: "notification",
        sessionId: "codex-approval-zh",
        message: "是否允许执行这个命令？",
        cwd: "/repo",
      }),
      {},
    );

    expect(JSON.parse(sendEventLine.mock.calls[0][0] as string)).toMatchObject({
      sessionId: "codex-approval-zh",
      status: "waiting",
      externalApproval: {
        kind: "approval_required",
        message: "是否允许执行这个命令？",
        sourceTool: "codex",
      },
    });
  });

  it("fails on invalid json", async () => {
    await expect(runCodexHookPipeline("{", {})).rejects.toThrow(/invalid JSON/i);
  });
});
