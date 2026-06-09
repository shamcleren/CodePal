import { describe, expect, it } from "vitest";
import { tokenUsageWriteFromUsageSnapshot } from "./usageSnapshotTokenUsage";

describe("tokenUsageWriteFromUsageSnapshot", () => {
  it("converts session-derived Cursor usage snapshots into token usage rows", () => {
    expect(
      tokenUsageWriteFromUsageSnapshot({
        agent: "cursor",
        sessionId: "cursor-usage-1",
        source: "session-derived",
        updatedAt: 123,
        tokens: {
          input: 40,
          output: 20,
          cachedInput: 80,
          reasoningOutput: 5,
        },
        meta: {
          model: "claude-opus-4-8",
        },
      }),
    ).toEqual({
      sessionId: "cursor-usage-1",
      agent: "cursor",
      model: "claude-opus-4-8",
      timestamp: 123,
      inputTokens: 40,
      outputTokens: 20,
      cacheReadTokens: 80,
      reasoningTokens: 5,
      sourceKind: "usage-snapshot:session-derived",
      sourceKey: "session-derived:cursor:cursor-usage-1:claude-opus-4-8:40:20:80:5",
    });
  });

  it("uses the same source key for repeated cumulative snapshots with unchanged counters", () => {
    const first = tokenUsageWriteFromUsageSnapshot({
      agent: "cursor",
      sessionId: "cursor-usage-1",
      source: "session-derived",
      updatedAt: 123,
      tokens: { input: 40, output: 20 },
    });
    const second = tokenUsageWriteFromUsageSnapshot({
      agent: "cursor",
      sessionId: "cursor-usage-1",
      source: "session-derived",
      updatedAt: 456,
      tokens: { input: 40, output: 20 },
    });

    expect(first?.sourceKey).toBe(second?.sourceKey);
  });

  it("ignores snapshots without token information", () => {
    expect(
      tokenUsageWriteFromUsageSnapshot({
        agent: "cursor",
        sessionId: "cursor-quota-only",
        source: "provider-derived",
        updatedAt: 123,
        rateLimit: {
          usedPercent: 50,
        },
      }),
    ).toBeNull();
  });
});
