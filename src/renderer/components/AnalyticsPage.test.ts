import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BREAKDOWN_MODES,
  TREND_METRICS,
  buildAnalyticsBreakdownRows,
  buildAvailableAgents,
  buildAvailableModels,
  buildAvailableProjects,
} from "./AnalyticsPage";
import type { TokenStatsResult } from "../../shared/usageTypes";

const baseStats: TokenStatsResult = {
  daily: [],
  byProject: [
    {
      projectPath: "/Users/demo/code/CodePal",
      projectName: "CodePal",
      requestCount: 3,
      inputTokens: 1_500_000,
      outputTokens: 750_000,
      cacheReadTokens: 250_000,
      cacheCreationTokens: 100_000,
      totalTokens: 2_600_000,
      firstSeenAt: 1,
      lastSeenAt: 4,
    },
  ],
  byModel: [
    {
      agent: "codex",
      model: "gpt-5.5",
      requestCount: 2,
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 250_000,
      cacheCreationTokens: 100_000,
      totalTokens: 1_850_000,
      firstSeenAt: 1,
      lastSeenAt: 2,
    },
    {
      agent: "codex",
      model: "gpt-5.4",
      requestCount: 1,
      inputTokens: 500_000,
      outputTokens: 250_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 750_000,
      firstSeenAt: 3,
      lastSeenAt: 4,
    },
  ],
  byAgent: [
    {
      agent: "codex",
      requestCount: 3,
      inputTokens: 1_500_000,
      outputTokens: 750_000,
      cacheReadTokens: 250_000,
      cacheCreationTokens: 100_000,
      totalTokens: 2_600_000,
      firstSeenAt: 1,
      lastSeenAt: 4,
    },
  ],
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
      displayName: "GPT 5.5",
      inputPerMillion: "3",
      outputPerMillion: "15",
      cacheReadPerMillion: "0.3",
      cacheCreationPerMillion: "3.75",
    },
    {
      modelId: "gpt-5.4",
      displayName: "GPT 5.4",
      inputPerMillion: "2",
      outputPerMillion: "10",
      cacheReadPerMillion: "0.2",
      cacheCreationPerMillion: "2.5",
    },
  ],
};

describe("AnalyticsPage helpers", () => {
  it("puts project breakdown first for analytics tabs", () => {
    expect(BREAKDOWN_MODES).toEqual(["project", "model", "agent"]);
  });

  it("keeps the daily trend metric choices focused on tokens and cost", () => {
    expect(TREND_METRICS).toEqual(["tokens", "cost"]);
  });

  it("builds project breakdown rows sorted by tokens with compact names", () => {
    const stats: TokenStatsResult = {
      ...baseStats,
      byProject: [
        {
          ...baseStats.byProject[0],
          projectPath: "/Users/demo/code/small",
          projectName: "small",
          totalTokens: 100,
          requestCount: 1,
        },
        {
          ...baseStats.byProject[0],
          projectPath: "/Users/demo/code/big",
          projectName: "big",
          totalTokens: 500,
          requestCount: 2,
        },
        {
          ...baseStats.byProject[0],
          projectPath: "unknown",
          projectName: "unknown",
          totalTokens: 5_000,
          requestCount: 9,
        },
      ],
    };

    expect(buildAnalyticsBreakdownRows("project", stats)).toEqual([
      expect.objectContaining({
        key: "/Users/demo/code/big",
        name: "big",
        fullName: "/Users/demo/code/big",
        totalTokens: 500,
      }),
      expect.objectContaining({
        key: "/Users/demo/code/small",
        name: "small",
        fullName: "/Users/demo/code/small",
        totalTokens: 100,
      }),
      expect.objectContaining({
        key: "unknown",
        name: "unknown",
        fullName: undefined,
        totalTokens: 5_000,
      }),
    ]);
  });

  it("adds estimated cost to agent breakdown rows from model pricing", () => {
    const rows = buildAnalyticsBreakdownRows("agent", baseStats);

    expect(rows).toEqual([
      expect.objectContaining({
        key: "codex",
        name: "codex",
      }),
    ]);
    expect(rows[0].cost).toBeCloseTo(14.45);
  });

  it("orders agent and model filters by common usage first", () => {
    const stats: TokenStatsResult = {
      ...baseStats,
      byAgent: [
        { ...baseStats.byAgent[0], agent: "claude", requestCount: 2, totalTokens: 20_000 },
        { ...baseStats.byAgent[0], agent: "codex", requestCount: 8, totalTokens: 10_000 },
        { ...baseStats.byAgent[0], agent: "cursor", requestCount: 8, totalTokens: 50_000 },
      ],
      byModel: [
        { ...baseStats.byModel[0], agent: "claude", model: "sonnet", requestCount: 1, totalTokens: 10_000 },
        { ...baseStats.byModel[0], agent: "codex", model: "gpt-5.5", requestCount: 5, totalTokens: 10_000 },
        { ...baseStats.byModel[0], agent: "codex", model: "mimo", requestCount: 5, totalTokens: 30_000 },
      ],
    };

    expect(buildAvailableAgents(stats, [])).toEqual(["cursor", "codex", "claude"]);
    expect(buildAvailableModels(stats, [])).toEqual(["mimo", "gpt-5.5", "sonnet"]);
  });

  it("orders project filters before agent/model filters and leaves unknown last", () => {
    const stats: TokenStatsResult = {
      ...baseStats,
      byProject: [
        {
          ...baseStats.byProject[0],
          projectPath: "unknown",
          projectName: "unknown",
          requestCount: 99,
          totalTokens: 99_000,
        },
        {
          ...baseStats.byProject[0],
          projectPath: "/repo/low",
          projectName: "low",
          requestCount: 1,
          totalTokens: 1_000,
        },
        {
          ...baseStats.byProject[0],
          projectPath: "/repo/high",
          projectName: "high",
          requestCount: 5,
          totalTokens: 5_000,
        },
      ],
    };

    expect(buildAvailableProjects(stats, [])).toEqual([
      { projectPath: "/repo/high", projectName: "high" },
      { projectPath: "/repo/low", projectName: "low" },
      { projectPath: "unknown", projectName: "unknown" },
    ]);
  });

  it("keeps project filter order from full stats when trend data is already filtered", () => {
    const stats: TokenStatsResult = {
      ...baseStats,
      byProject: [
        {
          ...baseStats.byProject[0],
          projectPath: "/repo/high",
          projectName: "high",
          requestCount: 5,
          totalTokens: 5_000,
        },
        {
          ...baseStats.byProject[0],
          projectPath: "/repo/low",
          projectName: "low",
          requestCount: 1,
          totalTokens: 1_000,
        },
      ],
    };

    expect(buildAvailableProjects(stats, [
      {
        bucketStart: 1,
        agent: "codex",
        model: "gpt-5.5",
        projectPath: "/repo/low",
        projectName: "low",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        totalTokens: 1_000_000,
        requestCount: 100,
      },
    ])).toEqual([
      { projectPath: "/repo/high", projectName: "high" },
      { projectPath: "/repo/low", projectName: "low" },
    ]);
  });

  it("does not wire small multiple trend cards into the analytics page", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "AnalyticsPage.tsx"),
      "utf8",
    );

    expect(source).not.toContain("AnalyticsSmallMultiples");
  });

  it("does not wire low-signal history or health summary sections into the analytics page", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "AnalyticsPage.tsx"),
      "utf8",
    );

    expect(source).not.toContain("analytics-page__import-strip");
    expect(source).not.toContain("tokenStats.sourceCoverage");
    expect(source).not.toContain("WorkHealthStrip");
  });

  it("does not expose unfinished LLM report controls in the analytics page", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "AnalyticsPage.tsx"),
      "utf8",
    );

    expect(source).not.toContain("generateLlmReport");
    expect(source).not.toContain("LLM Report");
  });
});
