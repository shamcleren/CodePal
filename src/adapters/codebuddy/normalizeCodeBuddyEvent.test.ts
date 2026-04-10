import { afterEach, describe, expect, it, vi } from "vitest";
import { CODEBUDDY_FIXTURES } from "../../../tests/fixtures/codebuddy";
import { normalizeCodeBuddyEvent } from "./normalizeCodeBuddyEvent";

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizeCodeBuddyEvent", () => {
  it.each(CODEBUDDY_FIXTURES)(
    "normalizes fixture $id",
    ({ payload, expectation }) => {
      if (expectation.timestamp === "now") {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));
      }

      const event = normalizeCodeBuddyEvent(payload);

      expect(event).toMatchObject({
        type: "status_change",
        sessionId: expectation.sessionId,
        tool: "codebuddy",
        status: expectation.status,
        ...(expectation.task !== undefined ? { task: expectation.task } : {}),
        ...(expectation.activityItems !== undefined
          ? { activityItems: expectation.activityItems }
          : {}),
        timestamp:
          expectation.timestamp === "now"
            ? Date.parse("2026-03-31T12:00:00.000Z")
            : expectation.timestamp,
      });

      if (expectation.meta) {
        expect(event.meta).toEqual(expect.objectContaining(expectation.meta));
      }
    },
  );

  it("keeps meta compact for hook-derived events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-pre-tool-use-write",
    );
    expect(fixture).toBeDefined();

    const event = normalizeCodeBuddyEvent(fixture!.payload);

    expect(event.meta).toEqual(
      expect.objectContaining({
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        cwd: "/workspace/demo",
      }),
    );
    expect(event.meta).not.toHaveProperty("tool_input");
    expect(event.meta).not.toHaveProperty("transcript_path");
  });

  it("treats Notification without notification_type as waiting instead of offline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const event = normalizeCodeBuddyEvent({
      session_id: "cb-notification-fallback",
      hook_event_name: "Notification",
      message: "CodeBuddy requires attention",
    });

    expect(event).toMatchObject({
      sessionId: "cb-notification-fallback",
      status: "waiting",
      task: "CodeBuddy requires attention",
      activityItems: [
        expect.objectContaining({
          kind: "note",
          source: "system",
          title: "Notification",
          body: "CodeBuddy requires attention",
        }),
      ],
      timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
    });
  });

  it("maps PostToolUse with explicit output to a tool result activity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-post-tool-use-write-result",
    );
    expect(fixture).toBeDefined();

    const event = normalizeCodeBuddyEvent(fixture!.payload);

    expect(event).toMatchObject({
      sessionId: "cb-session-107",
      tool: "codebuddy",
      status: "running",
      task: "Write",
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          source: "tool",
          title: "Write",
          body: "/workspace/demo/src/index.ts",
          toolName: "Write",
          toolPhase: "result",
        }),
      ],
      timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
    });
  });

  it("maps PostToolUse with nested response.result.output to a readable tool result body", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const event = normalizeCodeBuddyEvent({
      session_id: "cb-session-108",
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      response: {
        result: {
          output: "Updated /workspace/demo/src/session.ts",
        },
      },
    });

    expect(event).toMatchObject({
      sessionId: "cb-session-108",
      tool: "codebuddy",
      status: "running",
      task: "Write",
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          source: "tool",
          title: "Write",
          body: "Updated /workspace/demo/src/session.ts",
          toolName: "Write",
          toolPhase: "result",
        }),
      ],
      timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
    });
  });

  it("returns null when session_id is absent or blank", () => {
    expect(
      normalizeCodeBuddyEvent({
        hook_event_name: "Notification",
        message: "CodeBuddy requires attention",
      }),
    ).toBeNull();

    expect(
      normalizeCodeBuddyEvent({
        hook_event_name: "Notification",
        session_id: "   ",
        message: "CodeBuddy requires attention",
      }),
    ).toBeNull();
  });
});
