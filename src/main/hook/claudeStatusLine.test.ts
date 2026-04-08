import { describe, expect, it, vi } from "vitest";
import { buildClaudeStatusLineUsageLine } from "./claudeStatusLine";

describe("buildClaudeStatusLineUsageLine", () => {
  it("maps Claude statusline rate limits into a canonical usage snapshot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T09:00:00.000Z"));

    const line = buildClaudeStatusLineUsageLine(
      JSON.stringify({
        session_id: "claude-session-1",
        model: {
          display_name: "Claude Opus 4.1",
        },
        rate_limits: {
          five_hour: {
            used_percentage: 37,
            resets_at: "2026-04-07T12:00:00Z",
          },
          seven_day: {
            used_percentage: 12,
            resets_at: "2026-04-10T00:00:00Z",
          },
        },
      }),
      {},
    );

    expect(line).not.toBeNull();
    expect(JSON.parse(line ?? "{}")).toMatchObject({
      agent: "claude",
      sessionId: "claude-session-1",
      source: "statusline-derived",
      updatedAt: Date.parse("2026-04-07T09:00:00.000Z"),
      title: "Claude Opus 4.1",
      rateLimit: {
        windows: [
          {
            key: "five_hour",
            label: "5h",
            usedPercent: 37,
            resetAt: Date.parse("2026-04-07T12:00:00Z") / 1000,
          },
          {
            key: "seven_day",
            label: "7d",
            usedPercent: 12,
            resetAt: Date.parse("2026-04-10T00:00:00Z") / 1000,
          },
        ],
      },
    });
  });

  it("returns null when session_id or rate limits are missing", () => {
    expect(
      buildClaudeStatusLineUsageLine(JSON.stringify({ rate_limits: { five_hour: {} } }), {}),
    ).toBeNull();
    expect(
      buildClaudeStatusLineUsageLine(JSON.stringify({ session_id: "claude-1" }), {}),
    ).toBeNull();
  });
});
