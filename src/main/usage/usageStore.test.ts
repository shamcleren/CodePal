import { describe, expect, it } from "vitest";
import { createUsageStore } from "./usageStore";

describe("createUsageStore", () => {
  it("merges partial usage snapshots into one session usage view", () => {
    const store = createUsageStore();

    store.applySnapshot({
      agent: "codex",
      sessionId: "sess-1",
      source: "session-derived",
      updatedAt: 100,
      tokens: { input: 120, output: 30, total: 150 },
    });
    store.applySnapshot({
      agent: "codex",
      sessionId: "sess-1",
      source: "statusline-derived",
      updatedAt: 110,
      rateLimit: { remaining: 42, limit: 50, resetAt: 200 },
    });

    expect(store.getOverview().sessions[0]).toMatchObject({
      agent: "codex",
      sessionId: "sess-1",
      tokens: { input: 120, output: 30, total: 150 },
      rateLimit: { remaining: 42, limit: 50, resetAt: 200 },
      completeness: "partial",
    });
  });

  it("keeps reported and estimated cost separate in the global summary", () => {
    const store = createUsageStore();

    store.applySnapshot({
      agent: "codex",
      sessionId: "sess-1",
      source: "session-derived",
      updatedAt: 100,
      cost: { reported: 1.25, currency: "USD" },
    });
    store.applySnapshot({
      agent: "cursor",
      sessionId: "sess-2",
      source: "session-derived",
      updatedAt: 110,
      cost: { estimated: 0.75, currency: "USD" },
    });

    expect(store.getOverview().summary.cost).toEqual({
      reported: 1.25,
      estimated: 0.75,
      currency: "USD",
    });
  });

  it("does not expose a fake aggregated context percentage across multiple sessions", () => {
    const store = createUsageStore();

    store.applySnapshot({
      agent: "codex",
      sessionId: "sess-1",
      source: "session-derived",
      updatedAt: 100,
      context: { used: 1200, max: 258400, percent: 0.5 },
    });
    store.applySnapshot({
      agent: "cursor",
      sessionId: "sess-2",
      source: "session-derived",
      updatedAt: 110,
      context: { used: 4000, max: 128000, percent: 3.1 },
    });

    expect(store.getOverview().summary.contextMode).toBe("multi-session");
    expect(store.getOverview().summary.context).toBeUndefined();
  });

  it("expands multi-window rate limits into the summary view", () => {
    const store = createUsageStore();

    store.applySnapshot({
      agent: "codex",
      sessionId: "sess-1",
      source: "session-derived",
      updatedAt: 100,
      rateLimit: {
        windows: [
          { key: "primary", label: "5 小时", usedPercent: 16, resetAt: 300 },
          { key: "secondary", label: "7 天", usedPercent: 8, resetAt: 400 },
        ],
      },
    });

    expect(store.getOverview().summary.rateLimits).toEqual([
      {
        agent: "codex",
        remaining: undefined,
        limit: undefined,
        usedPercent: 16,
        resetAt: 300,
        windowLabel: "5 小时",
        planType: undefined,
      },
      {
        agent: "codex",
        remaining: undefined,
        limit: undefined,
        usedPercent: 8,
        resetAt: 400,
        windowLabel: "7 天",
        planType: undefined,
      },
    ]);
  });

  it("keeps only the newest rate-limit row per agent window", () => {
    const store = createUsageStore();

    store.applySnapshot({
      agent: "codex",
      sessionId: "older",
      source: "session-derived",
      updatedAt: 100,
      rateLimit: {
        windows: [{ key: "primary", label: "5 小时", usedPercent: 30, resetAt: 300 }],
      },
    });
    store.applySnapshot({
      agent: "codex",
      sessionId: "newer",
      source: "session-derived",
      updatedAt: 200,
      rateLimit: {
        windows: [{ key: "primary", label: "5 小时", usedPercent: 69, resetAt: 400 }],
      },
    });

    expect(store.getOverview().summary.rateLimits).toEqual([
      {
        agent: "codex",
        remaining: undefined,
        limit: undefined,
        usedPercent: 69,
        resetAt: 400,
        windowLabel: "5 小时",
        planType: undefined,
      },
    ]);
  });

  it("removes a specific usage session without affecting others", () => {
    const store = createUsageStore();

    store.applySnapshot({
      agent: "cursor",
      sessionId: "cursor-dashboard:14634113",
      source: "provider-derived",
      updatedAt: 100,
      rateLimit: { remaining: 1, limit: 10, usedPercent: 90 },
    });
    store.applySnapshot({
      agent: "codex",
      sessionId: "sess-1",
      source: "session-derived",
      updatedAt: 110,
      tokens: { total: 42 },
    });

    store.removeSession("cursor", "cursor-dashboard:14634113");

    expect(store.getOverview().sessions).toEqual([
      expect.objectContaining({
        agent: "codex",
        sessionId: "sess-1",
      }),
    ]);
  });
});
