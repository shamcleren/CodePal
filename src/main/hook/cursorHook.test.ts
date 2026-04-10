import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEventLine = vi.hoisted(() => vi.fn<[], Promise<void>>());
const runBlockingHookFromRaw = vi.hoisted(() => vi.fn<[], Promise<string | undefined>>());

vi.mock("./sendEventBridge", () => ({
  sendEventLine,
}));

vi.mock("./blockingHookBridge", () => ({
  runBlockingHookFromRaw,
}));

import { runCursorHookPipeline } from "./cursorHook";

describe("runCursorHookPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEventLine.mockResolvedValue(undefined);
    runBlockingHookFromRaw.mockResolvedValue(undefined);
  });

  it("forwards non-blocking cursor payloads through sendEventLine", async () => {
    await runCursorHookPipeline(
      JSON.stringify({
        session_id: "cursor-1",
        hook_event_name: "SessionStart",
        status: "running",
      }),
      {},
    );

    expect(sendEventLine).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendEventLine.mock.calls[0][0] as string)).toMatchObject({
      tool: "cursor",
      source: "cursor",
      session_id: "cursor-1",
      hook_event_name: "SessionStart",
    });
    expect(runBlockingHookFromRaw).not.toHaveBeenCalled();
  });

  it("forwards blocking cursor payloads through runBlockingHookFromRaw", async () => {
    runBlockingHookFromRaw.mockResolvedValue('{"ok":true}');

    const line = await runCursorHookPipeline(
      JSON.stringify({
        session_id: "cursor-2",
        hook_event_name: "Notification",
        pendingAction: {
          id: "a1",
          type: "approval",
          title: "Continue?",
          options: ["Yes", "No"],
        },
      }),
      {},
    );

    expect(line).toBe('{"ok":true}');
    expect(runBlockingHookFromRaw).toHaveBeenCalledTimes(1);
    expect(JSON.parse(runBlockingHookFromRaw.mock.calls[0][0] as string)).toMatchObject({
      tool: "cursor",
      source: "cursor",
      session_id: "cursor-2",
    });
    expect(sendEventLine).not.toHaveBeenCalled();
  });

  it("fails on invalid json", async () => {
    await expect(runCursorHookPipeline("{", {})).rejects.toThrow(/invalid JSON/i);
  });
});
