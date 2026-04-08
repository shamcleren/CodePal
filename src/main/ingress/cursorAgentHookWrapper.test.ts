import { describe, expect, it } from "vitest";
import { buildCursorLifecycleEventLine } from "../hook/cursorLifecycleHook";

describe("buildCursorLifecycleEventLine (cursor agent hook parity)", () => {
  it("maps sessionStart into a running StatusChange payload", () => {
    const line = buildCursorLifecycleEventLine(
      "sessionStart",
      {
        session_id: "cursor-session-1",
        composer_mode: "agent",
      },
      { CURSOR_PROJECT_DIR: "/workspace/demo" },
    );

    expect(JSON.parse(line)).toMatchObject({
      hook_event_name: "StatusChange",
      session_id: "cursor-session-1",
      status: "running",
      task: "agent",
      cwd: "/workspace/demo",
    });
  });

  it("maps stop into a terminal StatusChange payload", () => {
    const line = buildCursorLifecycleEventLine(
      "stop",
      {
        session_id: "cursor-session-2",
        status: "completed",
      },
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      hook_event_name: "StatusChange",
      session_id: "cursor-session-2",
      status: "completed",
      task: "completed",
    });
  });

  it("maps stop error into an error StatusChange payload", () => {
    const line = buildCursorLifecycleEventLine(
      "stop",
      {
        session_id: "cursor-session-3",
        status: "error",
      },
      {},
    );

    expect(JSON.parse(line)).toMatchObject({
      hook_event_name: "StatusChange",
      session_id: "cursor-session-3",
      status: "error",
      task: "error",
    });
  });

  it("fails fast when session_id is missing", () => {
    expect(() =>
      buildCursorLifecycleEventLine("sessionStart", { composer_mode: "agent" }, {}),
    ).toThrow(/session_id is required/);
  });
});
