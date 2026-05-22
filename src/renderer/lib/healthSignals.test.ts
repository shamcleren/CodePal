import { describe, expect, it } from "vitest";
import { deriveHealthSignals } from "./healthSignals";
import type { WorkItemList, WorkItem } from "../../shared/workItems";
import type { DailyTokenStats } from "../../shared/usageTypes";

function makeItem(overrides: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    sessionId: "s1",
    agent: "claude",
    state: "waiting",
    priority: "high",
    title: "Test",
    nextAction: null,
    project: null,
    since: Date.now() - 60_000,
    lastActivity: Date.now(),
    durationMs: 60_000,
    recentActions: [],
    hasPendingActions: false,
    ...overrides,
  };
}

function makeList(items: WorkItem[]): WorkItemList {
  const byState = {
    waiting: items.filter((i) => i.state === "waiting"),
    needs_follow_up: items.filter((i) => i.state === "needs_follow_up"),
    failed: items.filter((i) => i.state === "failed"),
    completed: items.filter((i) => i.state === "completed"),
    deferred: items.filter((i) => i.state === "deferred"),
  };
  return {
    items,
    byState,
    counts: {
      waiting: byState.waiting.length,
      needs_follow_up: byState.needs_follow_up.length,
      failed: byState.failed.length,
      completed: byState.completed.length,
      deferred: byState.deferred.length,
    },
    generatedAt: Date.now(),
  };
}

function makeDaily(date: string, totalTokens: number): DailyTokenStats {
  return {
    date,
    agent: "claude",
    inputTokens: totalTokens / 2,
    outputTokens: totalTokens / 2,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    totalTokens,
    requestCount: 1,
  };
}

describe("deriveHealthSignals", () => {
  it("returns zero signals for empty work items", () => {
    const signals = deriveHealthSignals(makeList([]), [], {
      startMs: Date.now() - 86_400_000,
      endMs: Date.now(),
    });
    expect(signals.attentionCount).toBe(0);
    expect(signals.longestWaitMin).toBe(0);
    expect(signals.failedCount).toBe(0);
  });

  it("counts attention items with critical/high priority", () => {
    const list = makeList([
      makeItem({ id: "a", state: "failed", priority: "critical" }),
      makeItem({ id: "b", state: "waiting", priority: "high" }),
      makeItem({ id: "c", state: "waiting", priority: "low" }),
    ]);
    const signals = deriveHealthSignals(list, [], {
      startMs: 0,
      endMs: 1,
    });
    expect(signals.attentionCount).toBe(2);
  });

  it("computes longest wait in minutes", () => {
    const list = makeList([
      makeItem({ id: "a", state: "waiting", durationMs: 120_000 }),
      makeItem({ id: "b", state: "needs_follow_up", durationMs: 300_000 }),
    ]);
    const signals = deriveHealthSignals(list, [], { startMs: 0, endMs: 1 });
    expect(signals.longestWaitMin).toBe(5);
  });

  it("counts failed items", () => {
    const list = makeList([
      makeItem({ id: "a", state: "failed", priority: "critical" }),
      makeItem({ id: "b", state: "failed", priority: "critical" }),
      makeItem({ id: "c", state: "waiting", priority: "high" }),
    ]);
    const signals = deriveHealthSignals(list, [], { startMs: 0, endMs: 1 });
    expect(signals.failedCount).toBe(2);
  });

  it("computes token delta with increase", () => {
    const daily = [
      makeDaily("2026-05-18", 100_000),
      makeDaily("2026-05-19", 200_000),
    ];
    const signals = deriveHealthSignals(makeList([]), daily, {
      startMs: new Date("2026-05-19").getTime(),
      endMs: new Date("2026-05-20").getTime(),
    });
    expect(signals.tokenDelta).not.toBeNull();
    expect(signals.tokenDelta!.current).toBe(200_000);
    expect(signals.tokenDelta!.previous).toBe(100_000);
    expect(signals.tokenDelta!.pctChange).toBe(100);
  });

  it("returns null token delta when no data in either range", () => {
    const signals = deriveHealthSignals(makeList([]), [], {
      startMs: new Date("2026-05-19").getTime(),
      endMs: new Date("2026-05-20").getTime(),
    });
    expect(signals.tokenDelta).toBeNull();
  });
});
