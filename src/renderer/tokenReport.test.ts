import { describe, expect, it } from "vitest";
import { buildTokenReport } from "./tokenReport";

const DEFAULT_PRICING = [
  {
    modelId: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5",
    inputPerMillion: "3",
    outputPerMillion: "15",
    cacheReadPerMillion: "0.30",
    cacheCreationPerMillion: "3.75",
  },
  {
    modelId: "codex-default",
    displayName: "Codex (default)",
    inputPerMillion: "3",
    outputPerMillion: "15",
    cacheReadPerMillion: "0.30",
    cacheCreationPerMillion: "0",
  },
];

describe("buildTokenReport", () => {
  it("generates a report header with period info", () => {
    const report = buildTokenReport({
      rangeLabel: "7d",
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [],
      pricing: [],
    });

    expect(report).toContain("CodePal Usage Report");
    expect(report).toContain("2026-05-12 ~ 2026-05-18 (7d)");
  });

  it("includes session stats grouped by agent", () => {
    const report = buildTokenReport({
      rangeLabel: "7d",
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [
        { agent: "claude", status: "completed", count: 10 },
        { agent: "claude", status: "running", count: 2 },
        { agent: "codex", status: "completed", count: 5 },
      ],
      daily: [],
      byModel: [],
      pricing: [],
    });

    expect(report).toContain("Sessions");
    expect(report).toContain("Claude: 12 sessions");
    expect(report).toContain("10 completed");
    expect(report).toContain("2 running");
    expect(report).toContain("Codex: 5 sessions");
  });

  it("computes token usage totals and cache hit rate", () => {
    const report = buildTokenReport({
      rangeLabel: "today",
      startDate: "2026-05-18",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [
        {
          date: "2026-05-18",
          agent: "claude",
          inputTokens: 100_000,
          outputTokens: 50_000,
          cacheReadTokens: 200_000,
          cacheCreationTokens: 10_000,
          reasoningTokens: 0,
          totalTokens: 360_000,
          requestCount: 10,
        },
      ],
      byModel: [],
      pricing: [],
    });

    expect(report).toContain("Token Usage");
    expect(report).toContain("100.0K tokens"); // input
    expect(report).toContain("50.0K tokens"); // output
    expect(report).toContain("200.0K tokens"); // cache read
    expect(report).toContain("360.0K tokens"); // total
    expect(report).toContain("Requests:     10");
    // cache hit = 200000 / (200000 + 100000 + 10000) = 64.5% → 65%
    expect(report).toContain("Cache Hit:    65%");
  });

  it("estimates cost from model pricing", () => {
    const report = buildTokenReport({
      rangeLabel: "7d",
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [
        {
          date: "2026-05-12",
          agent: "claude",
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          totalTokens: 2_000_000,
          requestCount: 1,
        },
      ],
      byModel: [
        {
          model: "claude-sonnet-4-5-20250929",
          agent: "claude",
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 2_000_000,
          requestCount: 1,
        },
      ],
      pricing: DEFAULT_PRICING,
    });

    // 1M input * $3/M + 1M output * $15/M = $18.00
    expect(report).toContain("Est. Cost:    $18.00");
  });

  it("includes daily breakdown when data exists", () => {
    const report = buildTokenReport({
      rangeLabel: "7d",
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [
        {
          date: "2026-05-12",
          agent: "claude",
          inputTokens: 500_000,
          outputTokens: 300_000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          totalTokens: 800_000,
          requestCount: 5,
        },
        {
          date: "2026-05-13",
          agent: "codex",
          inputTokens: 200_000,
          outputTokens: 100_000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          totalTokens: 300_000,
          requestCount: 3,
        },
      ],
      byModel: [],
      pricing: [],
    });

    expect(report).toContain("Daily Breakdown");
    expect(report).toContain("2026-05-12");
    expect(report).toContain("Claude");
    expect(report).toContain("2026-05-13");
    expect(report).toContain("Codex");
  });

  it("includes top models table when data exists", () => {
    const report = buildTokenReport({
      rangeLabel: "7d",
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [
        {
          model: "claude-sonnet-4-5-20250929",
          agent: "claude",
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 1_500_000,
          requestCount: 20,
        },
      ],
      pricing: DEFAULT_PRICING,
    });

    expect(report).toContain("Top Models");
    expect(report).toContain("claude/claude-sonnet-4-5-20250929");
    expect(report).toContain("20 req");
    expect(report).toContain("1.5M tokens");
  });

  it("handles empty data gracefully", () => {
    const report = buildTokenReport({
      rangeLabel: "30d",
      startDate: "2026-04-18",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [],
      pricing: [],
    });

    expect(report).toContain("CodePal Usage Report");
    expect(report).toContain("Token Usage");
    expect(report).toContain("Requests:     0");
    expect(report).not.toContain("Sessions");
    expect(report).not.toContain("Daily Breakdown");
    expect(report).not.toContain("Top Models");
  });
});
