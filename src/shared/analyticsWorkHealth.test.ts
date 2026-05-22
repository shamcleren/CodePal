import { describe, expect, it } from "vitest";
import { deriveAnalyticsWorkHealth } from "./analyticsWorkHealth";
import type { TokenStatsResult } from "./usageTypes";
import type { WorkItem, WorkItemList } from "./workItems";
import type { UsageOverview } from "./usageTypes";

function item(overrides: Partial<WorkItem> & { id: string; sessionId: string }): WorkItem {
  return {
    agent: "codex",
    state: "waiting",
    priority: "high",
    title: "Needs input",
    nextAction: "Reply",
    project: null,
    since: 1,
    lastActivity: 1,
    durationMs: 12 * 60_000,
    recentActions: [],
    hasPendingActions: true,
    ...overrides,
  };
}

function list(items: WorkItem[]): WorkItemList {
  const byState = {
    waiting: items.filter((workItem) => workItem.state === "waiting"),
    needs_follow_up: items.filter((workItem) => workItem.state === "needs_follow_up"),
    failed: items.filter((workItem) => workItem.state === "failed"),
    completed: items.filter((workItem) => workItem.state === "completed"),
    deferred: items.filter((workItem) => workItem.state === "deferred"),
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
    generatedAt: 2,
  };
}

function stats(totalCostSource: number): TokenStatsResult {
  return {
    daily: [],
    byAgent: [],
    topSessions: [],
    importStatus: {
      completedAt: null,
      claudeRowsImported: 0,
      codexRowsImported: 0,
      lastError: null,
    },
    pricing: [
      {
        modelId: "gpt-5.5",
        displayName: "gpt-5.5",
        inputPerMillion: "10",
        outputPerMillion: "20",
        cacheReadPerMillion: "1",
        cacheCreationPerMillion: "2",
      },
    ],
    byModel: [
      {
        agent: "codex",
        model: "gpt-5.5",
        inputTokens: totalCostSource,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: totalCostSource,
        requestCount: 1,
      },
    ],
  };
}

const usageOverview: UsageOverview = {
  summary: {
    rateLimits: [],
    contextMode: "multi-session",
  },
  sessions: [
    {
      agent: "codex",
      sessionId: "ctx-1",
      updatedAt: 10,
      sources: ["session-derived"],
      completeness: "partial",
      context: { percent: 91 },
    },
  ],
};

describe("deriveAnalyticsWorkHealth", () => {
  it("returns actionable attention, wait, failure, context, and cost signals", () => {
    const summary = deriveAnalyticsWorkHealth({
      workItemList: list([
        item({ id: "wait-1", sessionId: "wait-1", durationMs: 27 * 60_000 }),
        item({ id: "failed-1", sessionId: "failed-1", state: "failed", priority: "critical" }),
      ]),
      usageOverview,
      currentStats: stats(200_000_000),
      previousStats: stats(100_000_000),
      selectedRange: { startMs: 100, endMs: 200 },
    });

    expect(summary.signals.map((signal) => signal.kind)).toEqual([
      "attention",
      "longest_wait",
      "unrecovered_failure",
      "context_near_full",
      "cost_anomaly",
    ]);
    expect(summary.signals[0]).toMatchObject({
      value: "2",
      sessionIds: ["failed-1", "wait-1"],
    });
    expect(summary.signals[1]).toMatchObject({
      value: "27m",
      sessionIds: ["wait-1"],
    });
    expect(summary.signals[3]).toMatchObject({
      value: "91%",
      sessionIds: ["ctx-1"],
    });
    expect(summary.signals[4].value).toBe("+100%");
    expect(summary.signals[4].detail).toContain("previous equal-length");
  });

  it("labels cost activity without a previous baseline as new", () => {
    const summary = deriveAnalyticsWorkHealth({
      workItemList: list([]),
      usageOverview: { summary: { rateLimits: [], contextMode: "none" }, sessions: [] },
      currentStats: stats(100_000_000),
      previousStats: stats(0),
      selectedRange: { startMs: 100, endMs: 200 },
    });

    expect(summary.signals.at(-1)).toMatchObject({
      kind: "cost_anomaly",
      value: "New",
    });
  });
});
