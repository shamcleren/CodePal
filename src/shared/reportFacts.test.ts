import { describe, expect, it } from "vitest";
import { buildReportFacts } from "./reportFacts";
import type { ModelPricing } from "./usageTypes";

const PRICING: ModelPricing[] = [
  {
    modelId: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5",
    inputPerMillion: "3",
    outputPerMillion: "15",
    cacheReadPerMillion: "0.30",
    cacheCreationPerMillion: "3.75",
  },
];

describe("buildReportFacts", () => {
  it("builds empty facts for an empty input", () => {
    const facts = buildReportFacts({
      granularity: "daily",
      startDate: "2026-05-12",
      endDate: "2026-05-12",
      daily: [],
      byModel: [],
      byAgent: [],
      sessionStats: [],
      topSessions: [],
      pricing: [],
    });

    expect(facts.granularity).toBe("daily");
    expect(facts.startDate).toBe("2026-05-12");
    expect(facts.endDate).toBe("2026-05-12");
    expect(facts.aggregate.totalTokens).toBe(0);
    expect(facts.aggregate.requestCount).toBe(0);
    expect(facts.daily).toEqual([]);
    expect(facts.byAgent).toEqual([]);
    expect(facts.byModel).toEqual([]);
    expect(facts.sessionStatus.total).toBe(0);
    expect(facts.topSessions).toEqual([]);
    expect(facts.operations).toEqual([]);
    expect(facts.followUps).toEqual([]);
    expect(facts.coverage.complete).toBe(true);
  });

  it("aggregates daily tokens correctly", () => {
    const facts = buildReportFacts({
      granularity: "daily",
      startDate: "2026-05-12",
      endDate: "2026-05-14",
      daily: [
        {
          date: "2026-05-12", agent: "claude",
          inputTokens: 100_000, outputTokens: 50_000,
          cacheReadTokens: 200_000, cacheCreationTokens: 0,
          reasoningTokens: 0, totalTokens: 350_000, requestCount: 5,
        },
        {
          date: "2026-05-13", agent: "claude",
          inputTokens: 200_000, outputTokens: 100_000,
          cacheReadTokens: 0, cacheCreationTokens: 0,
          reasoningTokens: 0, totalTokens: 300_000, requestCount: 3,
        },
      ],
      byModel: [],
      byAgent: [],
      sessionStats: [],
      topSessions: [],
      pricing: [],
    });

    expect(facts.aggregate.inputTokens).toBe(300_000);
    expect(facts.aggregate.outputTokens).toBe(150_000);
    expect(facts.aggregate.cacheReadTokens).toBe(200_000);
    expect(facts.aggregate.totalTokens).toBe(650_000);
    expect(facts.aggregate.requestCount).toBe(8);
    expect(facts.daily).toHaveLength(2);
    expect(facts.daily[0].date).toBe("2026-05-12");
  });

  it("estimates cost when pricing is available", () => {
    const facts = buildReportFacts({
      granularity: "weekly",
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      daily: [],
      byModel: [
        {
          model: "claude-sonnet-4-5-20250929", agent: "claude",
          inputTokens: 1_000_000, outputTokens: 1_000_000,
          cacheReadTokens: 0, cacheCreationTokens: 0,
          totalTokens: 2_000_000, requestCount: 10,
        },
      ],
      byAgent: [],
      sessionStats: [],
      topSessions: [],
      pricing: PRICING,
    });

    // 1M * $3 + 1M * $15 = $18
    expect(facts.byModel[0].cost.estimatedUsd).toBe(18);
    expect(facts.byModel[0].cost.pricingSource).toBe("model-pricing");
  });

  it("builds session status distribution", () => {
    const facts = buildReportFacts({
      granularity: "daily",
      startDate: "2026-05-12",
      endDate: "2026-05-12",
      daily: [],
      byModel: [],
      byAgent: [],
      sessionStats: [
        { agent: "claude", status: "running", count: 3 },
        { agent: "claude", status: "completed", count: 10 },
        { agent: "codex", status: "error", count: 2 },
      ],
      topSessions: [],
      pricing: [],
    });

    expect(facts.sessionStatus.running).toBe(3);
    expect(facts.sessionStatus.completed).toBe(10);
    expect(facts.sessionStatus.error).toBe(2);
    expect(facts.sessionStatus.total).toBe(15);
  });

  it("includes operations and follow-ups", () => {
    const facts = buildReportFacts({
      granularity: "daily",
      startDate: "2026-05-12",
      endDate: "2026-05-12",
      daily: [],
      byModel: [],
      byAgent: [],
      sessionStats: [],
      topSessions: [],
      pricing: [],
      operations: [
        { sessionId: "abc", action: "jump", ok: true, timestamp: 1000 },
        { sessionId: "def", action: "sendMessage", ok: false, timestamp: 2000, error: "no terminal" },
      ],
      followUps: [
        { sessionId: "abc", reason: "waiting", since: 3000 },
      ],
    });

    expect(facts.operations).toHaveLength(2);
    expect(facts.operations[1].error).toBe("no terminal");
    expect(facts.followUps).toHaveLength(1);
    expect(facts.followUps[0].reason).toBe("waiting");
  });

  it("computes duration for top sessions", () => {
    const facts = buildReportFacts({
      granularity: "daily",
      startDate: "2026-05-12",
      endDate: "2026-05-12",
      daily: [],
      byModel: [],
      byAgent: [],
      sessionStats: [],
      topSessions: [
        {
          sessionId: "abc",
          title: "Test session",
          agent: "claude",
          model: "claude-sonnet-4-5-20250929",
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 150,
          requestCount: 1,
          firstSeenAt: 1000,
          lastSeenAt: 4000,
        },
      ],
      pricing: PRICING,
    });

    expect(facts.topSessions).toHaveLength(1);
    expect(facts.topSessions[0].duration).toBe(3000);
    expect(facts.topSessions[0].title).toBe("Test session");
  });

  it("sets source based on import status", () => {
    const facts = buildReportFacts({
      granularity: "daily",
      startDate: "2026-05-12",
      endDate: "2026-05-12",
      daily: [
        {
          date: "2026-05-12", agent: "claude",
          inputTokens: 100, outputTokens: 50, cacheReadTokens: 0,
          cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 150, requestCount: 1,
        },
      ],
      byModel: [],
      byAgent: [],
      sessionStats: [],
      topSessions: [],
      pricing: [],
      importStatus: {
        completedAt: Date.now(),
        claudeRowsImported: 1,
        codexRowsImported: 0,
      },
    });

    expect(facts.daily[0].source).toBe("backfill");
    expect(facts.coverage.backfillSessionCount).toBe(0);
  });

  it("reports live source when no import status", () => {
    const facts = buildReportFacts({
      granularity: "daily",
      startDate: "2026-05-12",
      endDate: "2026-05-12",
      daily: [
        {
          date: "2026-05-12", agent: "claude",
          inputTokens: 100, outputTokens: 50, cacheReadTokens: 0,
          cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 150, requestCount: 1,
        },
      ],
      byModel: [],
      byAgent: [],
      sessionStats: [],
      topSessions: [],
      pricing: [],
    });

    expect(facts.daily[0].source).toBe("live");
  });
});
