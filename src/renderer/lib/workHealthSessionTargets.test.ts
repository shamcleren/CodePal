import { describe, expect, it } from "vitest";
import { buildWorkHealthSessionTargets } from "./workHealthSessionTargets";
import type { WorkItem, WorkItemList } from "../../shared/workItems";
import type { UsageOverview } from "../../shared/usageTypes";

function item(overrides: Partial<WorkItem> & { id: string; sessionId: string }): WorkItem {
  return {
    id: overrides.id,
    sessionId: overrides.sessionId,
    agent: "codex",
    state: "waiting",
    priority: "high",
    title: "Waiting work item",
    nextAction: null,
    project: null,
    since: 1,
    lastActivity: 1,
    durationMs: 1,
    recentActions: [],
    hasPendingActions: false,
    ...overrides,
  };
}

function list(items: WorkItem[]): WorkItemList {
  return {
    items,
    byState: {
      waiting: items.filter((entry) => entry.state === "waiting"),
      needs_follow_up: items.filter((entry) => entry.state === "needs_follow_up"),
      failed: items.filter((entry) => entry.state === "failed"),
      completed: items.filter((entry) => entry.state === "completed"),
      deferred: items.filter((entry) => entry.state === "deferred"),
    },
    counts: {
      waiting: items.filter((entry) => entry.state === "waiting").length,
      needs_follow_up: items.filter((entry) => entry.state === "needs_follow_up").length,
      failed: items.filter((entry) => entry.state === "failed").length,
      completed: items.filter((entry) => entry.state === "completed").length,
      deferred: items.filter((entry) => entry.state === "deferred").length,
    },
    generatedAt: 1,
  };
}

const usageOverview: UsageOverview = {
  summary: { rateLimits: [], contextMode: "multi-session" },
  sessions: [
    {
      agent: "codex",
      sessionId: "ctx-a",
      title: "Refactor analytics cards",
      updatedAt: 1,
      sources: ["session-derived"],
      completeness: "partial",
      context: { percent: 88 },
    },
    {
      agent: "claude",
      sessionId: "ctx-b-1234567890",
      updatedAt: 1,
      sources: ["session-derived"],
      completeness: "partial",
      context: { percent: 91 },
    },
  ],
};

describe("buildWorkHealthSessionTargets", () => {
  it("builds usage-backed session targets when the health signal has no work items", () => {
    const targets = buildWorkHealthSessionTargets(
      ["ctx-a", "ctx-b-1234567890"],
      list([]),
      usageOverview,
    );

    expect(targets).toEqual([
      { sessionId: "ctx-a", title: "Refactor analytics cards" },
      { sessionId: "ctx-b-1234567890", title: "claude session ctx-b-12...7890" },
    ]);
  });

  it("prefers work item titles when both work item and usage data exist", () => {
    const targets = buildWorkHealthSessionTargets(
      ["ctx-a"],
      list([item({ id: "wi-ctx-a", sessionId: "ctx-a", title: "Needs approval" })]),
      usageOverview,
    );

    expect(targets).toEqual([{ sessionId: "ctx-a", title: "Needs approval" }]);
  });
});
