import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEventLine = vi.hoisted(() => vi.fn<[], Promise<void>>());
const runBlockingHookFromRaw = vi.hoisted(() => vi.fn<[], Promise<string | undefined>>());

vi.mock("./sendEventBridge", () => ({
  sendEventLine,
}));

vi.mock("./blockingHookBridge", () => ({
  runBlockingHookFromRaw,
}));

import { runCodexInternalHookPipeline } from "./codexInternalHook";

describe("runCodexInternalHookPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sendEventLine.mockResolvedValue(undefined);
    runBlockingHookFromRaw.mockResolvedValue(undefined);
  });

  it("forwards non-blocking codex-internal payloads through sendEventLine", async () => {
    await runCodexInternalHookPipeline(
      JSON.stringify({
        type: "status_change",
        sessionId: "codex-internal-1",
        status: "running",
        timestamp: 1,
      }),
      {},
    );

    expect(sendEventLine).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendEventLine.mock.calls[0][0] as string)).toMatchObject({
      tool: "codex-internal",
      source: "codex-internal",
      type: "status_change",
      sessionId: "codex-internal-1",
    });
    expect(runBlockingHookFromRaw).not.toHaveBeenCalled();
  });

  it("ignores notify payloads that do not carry a stable session identity", async () => {
    const line = await runCodexInternalHookPipeline(
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
      "[CodePal Codex-Internal] unsupported notify payload ignored:",
      "missing_session_id",
      "agent-turn-complete",
    );
  });

  it("forwards blocking codex-internal payloads through runBlockingHookFromRaw", async () => {
    runBlockingHookFromRaw.mockResolvedValue('{"ok":true}');

    const line = await runCodexInternalHookPipeline(
      JSON.stringify({
        type: "status_change",
        sessionId: "codex-internal-2",
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
      tool: "codex-internal",
      source: "codex-internal",
      sessionId: "codex-internal-2",
    });
    expect(sendEventLine).not.toHaveBeenCalled();
  });

  it("fails on invalid json", async () => {
    await expect(runCodexInternalHookPipeline("{", {})).rejects.toThrow(/invalid JSON/i);
  });
});
