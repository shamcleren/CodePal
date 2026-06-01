import { describe, expect, it } from "vitest";
import type { MonitorSessionRow } from "./monitorSession";
import { buildDailyWorkReview } from "./dailyWorkReview";

function row(overrides: Partial<MonitorSessionRow>): MonitorSessionRow {
  return {
    id: "s",
    tool: "codex",
    status: "completed",
    updatedAt: Date.parse("2026-05-25T09:00:00+08:00"),
    titleLabel: "Fix managed CLI resume",
    shortId: "0001",
    updatedLabel: "05/25 09:00",
    durationLabel: "1h",
    pendingCount: 0,
    loading: false,
    collapsedSummary: "captured native session id",
    timelineItems: [],
    activityItems: [],
    hoverSummary: "",
    capabilities: null,
    ...overrides,
  };
}

describe("buildDailyWorkReview", () => {
  it("groups sessions by local day, summarizes useful work, and omits errored sessions", () => {
    const days = buildDailyWorkReview([
      row({
        id: "today-completed",
        titleLabel: "修复托管 CLI 续写入口",
        status: "completed",
        collapsedSummary: "Working",
        isManaged: true,
        managedTaskTitle: "托管 CLI 体验修复",
      }),
      row({
        id: "today-running",
        titleLabel: "整理每日工作回顾",
        status: "running",
        updatedAt: Date.parse("2026-05-25T11:00:00+08:00"),
      }),
      row({
        id: "today-error",
        titleLabel: "回放历史 session",
        status: "error",
        updatedAt: Date.parse("2026-05-25T12:00:00+08:00"),
      }),
      row({
        id: "yesterday",
        titleLabel: "校准 analytics 趋势",
        status: "idle",
        updatedAt: Date.parse("2026-05-24T20:00:00+08:00"),
        tool: "claude",
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
      usageOverview: {
        summary: { rateLimits: [], contextMode: "multi-session" },
        sessions: [
          {
            agent: "codex",
            sessionId: "today-completed",
            updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
            sources: ["session-derived"],
            completeness: "partial",
            tokens: { total: 1_500 },
            cost: { estimated: 0.03, currency: "USD" },
          },
          {
            agent: "codex",
            sessionId: "today-running",
            updatedAt: Date.parse("2026-05-25T11:00:00+08:00"),
            sources: ["session-derived"],
            completeness: "partial",
            tokens: { input: 1_000, output: 1_500 },
            cost: { estimated: 0.04, currency: "USD" },
          },
        ],
      },
    });

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      key: "2026-05-25",
      relativeLabel: "今天",
      sessionCount: 2,
      completedCount: 1,
      ongoingCount: 1,
      managedCount: 1,
      observedCount: 1,
      totalTokens: 4_000,
      estimatedCost: 0.07,
      costCurrency: "USD",
      summaryText: "2 个事项：完成 1、跟进 1；1 个 agent；消耗 4K token，估算费用 US$0.07。",
    });
    expect(days[0].completed[0]?.title).toBe("托管 CLI 体验修复");
    expect(days[0].completed[0]?.detail).toBe("");
    expect(days[0].ongoing[0]?.title).toBe("整理每日工作回顾");
    expect(days[0].entries.map((entry) => entry.title)).not.toContain("回放历史 session");
    expect(days[1]).toMatchObject({
      key: "2026-05-24",
      relativeLabel: "昨天",
      completedCount: 1,
    });
  });

  it("estimates summary cost from pricing when usage sessions do not carry explicit cost", () => {
    const days = buildDailyWorkReview([
      row({
        id: "priced-codex",
        titleLabel: "整理当天摘要统计",
        status: "completed",
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
      usageOverview: {
        summary: { rateLimits: [], contextMode: "multi-session" },
        sessions: [
          {
            agent: "codex",
            sessionId: "priced-codex",
            updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
            sources: ["session-derived"],
            completeness: "partial",
            tokens: { total: 1_600_000, input: 1_000_000, output: 500_000, cachedInput: 100_000 },
          },
        ],
        pricing: [
          {
            modelId: "codex-default",
            displayName: "Codex (default)",
            inputPerMillion: "1.50",
            outputPerMillion: "6",
            cacheReadPerMillion: "0.375",
            cacheCreationPerMillion: "0",
          },
        ],
      },
    });

    expect(days[0]).toMatchObject({
      totalTokens: 1_600_000,
      estimatedCost: 4.5375,
      costCurrency: "USD",
      summaryText: "1 个事项：完成 1；1 个 agent；消耗 1.6M token，估算费用 US$4.54。",
    });
  });

  it("uses historical daily token trend points when live session usage has already aged out", () => {
    const days = buildDailyWorkReview([
      row({
        id: "history-codex",
        titleLabel: "复盘历史日报",
        status: "completed",
        updatedAt: Date.parse("2026-05-20T18:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-20T17:50:00+08:00"),
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
      tokenTrendPoints: [
        {
          bucketStart: Date.parse("2026-05-20T00:00:00+08:00"),
          agent: "codex",
          model: "codex-default",
          inputTokens: 100_000,
          outputTokens: 50_000,
          cacheReadTokens: 20_000,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          totalTokens: 170_000,
          requestCount: 3,
        },
      ],
      pricing: [
        {
          modelId: "codex-default",
          displayName: "Codex (default)",
          inputPerMillion: "1.50",
          outputPerMillion: "6",
          cacheReadPerMillion: "0.375",
          cacheCreationPerMillion: "0",
        },
      ],
    });

    expect(days[0]).toMatchObject({
      key: "2026-05-20",
      totalTokens: 170_000,
      estimatedCost: 0.4575,
      costCurrency: "USD",
      summaryText: "1 个事项：完成 1；1 个 agent；消耗 170K token，估算费用 US$0.46。",
    });
  });

  it("prefers historical analytics totals over live usage so review matches analytics", () => {
    const days = buildDailyWorkReview([
      row({
        id: "today-live",
        titleLabel: "校准当天统计口径",
        status: "completed",
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
      usageOverview: {
        summary: { rateLimits: [], contextMode: "multi-session" },
        sessions: [
          {
            agent: "codex",
            sessionId: "today-live",
            updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
            sources: ["session-derived"],
            completeness: "partial",
            tokens: { total: 431_000, input: 300_000, output: 100_000, cachedInput: 31_000 },
            cost: { estimated: 3.5, currency: "USD" },
          },
        ],
      },
      tokenTrendPoints: [
        {
          bucketStart: Date.parse("2026-05-25T00:00:00+08:00"),
          agent: "codex",
          model: "codex-default",
          inputTokens: 500_000,
          outputTokens: 200_000,
          cacheReadTokens: 50_000,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          totalTokens: 750_000,
          requestCount: 6,
        },
      ],
      pricing: [
        {
          modelId: "codex-default",
          displayName: "Codex (default)",
          inputPerMillion: "1.50",
          outputPerMillion: "6",
          cacheReadPerMillion: "0.375",
          cacheCreationPerMillion: "0",
        },
      ],
    });

    expect(days[0]).toMatchObject({
      totalTokens: 750_000,
      estimatedCost: 1.96875,
      costCurrency: "USD",
      summaryText: "1 个事项：完成 1；1 个 agent；消耗 750K token，估算费用 US$1.97。",
    });
  });

  it("does not estimate historical trend cost from agent fallback when analytics has no model match", () => {
    const days = buildDailyWorkReview([
      row({
        id: "unknown-model-history",
        titleLabel: "检查未知模型历史统计",
        status: "completed",
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
      tokenTrendPoints: [
        {
          bucketStart: Date.parse("2026-05-25T00:00:00+08:00"),
          agent: "codex",
          model: "unknown",
          inputTokens: 500_000,
          outputTokens: 200_000,
          cacheReadTokens: 50_000,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          totalTokens: 750_000,
          requestCount: 6,
        },
      ],
      pricing: [
        {
          modelId: "codex-default",
          displayName: "Codex (default)",
          inputPerMillion: "1.50",
          outputPerMillion: "6",
          cacheReadPerMillion: "0.375",
          cacheCreationPerMillion: "0",
        },
      ],
    });

    expect(days[0]).toMatchObject({
      totalTokens: 750_000,
      summaryText: "1 个事项：完成 1；1 个 agent；消耗 750K token。",
    });
    expect(days[0]?.estimatedCost).toBeUndefined();
  });

  it("splits a session into work items from meaningful user prompts", () => {
    const days = buildDailyWorkReview([
      row({
        id: "multi-prompt",
        titleLabel: "旧 session 标题不应该主导工作回顾",
        status: "completed",
        activityItems: [
          {
            id: "u1",
            kind: "message",
            source: "user",
            title: "User",
            body: "把工作回顾按照 user prompt 拆成多个工作项",
            timestamp: Date.parse("2026-05-25T09:00:00+08:00"),
          },
          {
            id: "u2",
            kind: "message",
            source: "user",
            title: "User",
            body: "可以",
            timestamp: Date.parse("2026-05-25T09:10:00+08:00"),
          },
          {
            id: "u3",
            kind: "message",
            source: "user",
            title: "User",
            body: "再给历史 session 增加不可打开的状态标记",
            timestamp: Date.parse("2026-05-25T10:00:00+08:00"),
          },
        ],
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
    });

    expect(days[0]).toMatchObject({
      sessionCount: 2,
      completedCount: 2,
      summaryText: "2 个事项：完成 2；1 个 agent。",
    });
    expect(days[0].entries.map((entry) => entry.title)).toEqual([
      "再给历史 session 增加不可打开的状态标记",
      "把工作回顾按照 user prompt 拆成多个工作项",
    ]);
    expect(days[0].entries.map((entry) => entry.sessionId)).toEqual([
      "multi-prompt",
      "multi-prompt",
    ]);
    expect(days[0].entries.map((entry) => entry.id)).toEqual([
      "multi-prompt:prompt:u3",
      "multi-prompt:prompt:u1",
    ]);
  });

  it("uses persisted user prompt summaries for historical sessions", () => {
    const days = buildDailyWorkReview([
      {
        id: "history-prompts",
        tool: "codex",
        status: "completed",
        title: "历史 session 旧标题",
        updatedAt: Date.parse("2026-05-20T18:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-20T17:50:00+08:00"),
        userPrompts: [
          {
            id: "hp1",
            body: "整理历史会话的工作回顾标题",
            timestamp: Date.parse("2026-05-20T16:00:00+08:00"),
          },
          {
            id: "hp2",
            body: "嗯",
            timestamp: Date.parse("2026-05-20T16:05:00+08:00"),
          },
        ],
      },
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
    });

    expect(days[0].entries).toHaveLength(1);
    expect(days[0].entries[0]).toMatchObject({
      id: "history-prompts:prompt:hp1",
      sessionId: "history-prompts",
      title: "整理历史会话的工作回顾标题",
      availability: "history",
    });
  });

  it("filters low-value assessment rows and tool-result details from the review", () => {
    const days = buildDailyWorkReview([
      row({
        id: "assessment",
        titleLabel:
          "The following is the Codex agent history whose request action you are assessing.",
        collapsedSummary: "{\"outcome\":\"allow\"}",
      }),
      row({
        id: "useful",
        titleLabel: "实现每日工作回顾",
        collapsedSummary: "Wall time: 2.7 seconds\nOutput:",
      }),
      row({
        id: "managed-increment",
        titleLabel: "托管任务摘要",
        collapsedSummary:
          "The following is the Codex agent history added since your last approval assessment. Continue the same review conversation.",
      }),
      row({
        id: "local-command-caveat",
        titleLabel:
          "<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>",
      }),
      row({
        id: "files-mentioned",
        titleLabel: "# Files mentioned by the user:",
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
    });

    expect(days).toHaveLength(1);
    expect(days[0].entries).toHaveLength(2);
    expect(days[0].entries.map((entry) => entry.id).sort()).toEqual([
      "managed-increment",
      "useful",
    ]);
    expect(days[0].entries.find((entry) => entry.id === "managed-increment")).toMatchObject({
      id: "managed-increment",
      title: "托管任务摘要",
      detail: "",
    });
    expect(days[0].entries.find((entry) => entry.id === "useful")).toMatchObject({
      id: "useful",
      title: "实现每日工作回顾",
      detail: "",
    });
  });

  it("accepts history session summaries so older days are included in the review", () => {
    const days = buildDailyWorkReview([
      row({
        id: "today",
        titleLabel: "继续做每日工作回顾",
        updatedAt: Date.parse("2026-05-25T09:00:00+08:00"),
      }),
      {
        id: "previous-weekend",
        tool: "codex",
        status: "completed",
        title: "周末整理托管 CLI 设计",
        task: "周末整理托管 CLI 设计",
        updatedAt: Date.parse("2026-05-23T18:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-23T17:58:00+08:00"),
      },
      {
        id: "older-history",
        tool: "claude",
        status: "completed",
        title: "整理 v1.2.0 发布检查",
        task: "整理 v1.2.0 发布检查",
        updatedAt: Date.parse("2026-05-20T18:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-20T17:58:00+08:00"),
      },
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
      maxDays: 14,
    });

    expect(days.map((day) => day.key)).toEqual(["2026-05-25", "2026-05-23", "2026-05-20"]);
    expect(days[1]).toMatchObject({
      relativeLabel: "上周",
      completedCount: 1,
      summaryText: "1 个事项：完成 1；1 个 agent。",
    });
    expect(days[2]).toMatchObject({
      relativeLabel: "上周",
      completedCount: 1,
      summaryText: "1 个事项：完成 1；1 个 agent。",
    });
  });

  it("keeps yesterday as a special label even when yesterday is in the previous calendar week", () => {
    const days = buildDailyWorkReview([
      {
        id: "sunday",
        tool: "codex",
        status: "completed",
        title: "周日验证托管 CLI",
        task: "周日验证托管 CLI",
        updatedAt: Date.parse("2026-05-24T18:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-24T17:58:00+08:00"),
      },
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
    });

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      key: "2026-05-24",
      relativeLabel: "昨天",
      summaryText: "1 个事项：完成 1；1 个 agent。",
    });
  });

  it("labels days inside the same Monday-based week as this week", () => {
    const days = buildDailyWorkReview([
      {
        id: "monday",
        tool: "codex",
        status: "completed",
        title: "周一启动工作回顾",
        task: "周一启动工作回顾",
        updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-25T09:58:00+08:00"),
      },
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-28T14:00:00+08:00"),
    });

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      relativeLabel: "本周",
    });
  });

  it("deduplicates current sessions over persisted history summaries", () => {
    const days = buildDailyWorkReview([
      {
        id: "same-session",
        tool: "codex",
        status: "completed",
        title: "历史里的旧标题",
        updatedAt: Date.parse("2026-05-25T08:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-25T08:00:00+08:00"),
      },
      row({
        id: "same-session",
        titleLabel: "当前更准确的标题",
        updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
        collapsedSummary: "当前 session 里的有效摘要",
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
    });

    expect(days).toHaveLength(1);
    expect(days[0].entries).toHaveLength(1);
    expect(days[0].entries[0]).toMatchObject({
      title: "当前更准确的标题",
      detail: "当前 session 里的有效摘要",
    });
  });

  it("adds compact duration labels for the latest running turn and accumulated running time", () => {
    const days = buildDailyWorkReview([
      row({
        id: "timed-session",
        titleLabel: "实现工作回顾耗时展示",
        updatedAt: Date.parse("2026-05-25T11:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-25T09:00:00+08:00"),
        activityItems: [
          {
            id: "run-1",
            kind: "note",
            source: "system",
            title: "Running",
            body: "Running",
            tone: "running",
            timestamp: Date.parse("2026-05-25T09:00:00+08:00"),
          },
          {
            id: "done-1",
            kind: "note",
            source: "system",
            title: "Completed",
            body: "Completed",
            tone: "completed",
            timestamp: Date.parse("2026-05-25T09:15:00+08:00"),
          },
          {
            id: "run-2",
            kind: "note",
            source: "system",
            title: "Running",
            body: "Running",
            tone: "running",
            timestamp: Date.parse("2026-05-25T10:00:00+08:00"),
          },
          {
            id: "waiting-2",
            kind: "note",
            source: "system",
            title: "Waiting",
            body: "Waiting",
            tone: "waiting",
            timestamp: Date.parse("2026-05-25T10:20:00+08:00"),
          },
        ],
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T12:00:00+08:00"),
    });

    expect(days[0].entries[0]).toMatchObject({
      latestRunningDurationLabel: "20 分钟",
      sessionDurationLabel: "35 分钟",
    });
  });

  it("uses explicit running start metadata instead of mistaking the latest status tick for the run start", () => {
    const days = buildDailyWorkReview([
      row({
        id: "active-timed-session",
        status: "running",
        titleLabel: "继续修正工作回顾时长",
        updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-25T09:00:00+08:00"),
        startedAt: Date.parse("2026-05-25T09:00:00+08:00"),
        latestRunningStartedAt: Date.parse("2026-05-25T09:00:00+08:00"),
        activityItems: [
          {
            id: "latest-running-tick",
            kind: "note",
            source: "system",
            title: "Running",
            body: "Running",
            tone: "running",
            timestamp: Date.parse("2026-05-25T09:59:59+08:00"),
          },
        ],
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T10:00:00+08:00"),
    });

    expect(days[0].ongoing[0]).toMatchObject({
      latestRunningDurationLabel: "1 小时",
      sessionDurationLabel: "1 小时",
    });
  });

  it("lets running duration grow when the review clock advances", () => {
    const rows = [
      row({
        id: "active-timed-session",
        status: "running",
        titleLabel: "观察自动增长的时长",
        updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
        startedAt: Date.parse("2026-05-25T09:00:00+08:00"),
        latestRunningStartedAt: Date.parse("2026-05-25T09:00:00+08:00"),
      }),
    ];

    const first = buildDailyWorkReview(rows, {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T10:00:00+08:00"),
    });
    const later = buildDailyWorkReview(rows, {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T10:30:15+08:00"),
    });

    expect(first[0].ongoing[0]?.latestRunningDurationLabel).toBe("1 小时");
    expect(later[0].ongoing[0]?.latestRunningDurationLabel).toBe("1 小时 30 分钟 15 秒");
    expect(later[0].ongoing[0]?.sessionDurationLabel).toBe("1 小时 30 分钟 15 秒");
  });

  it("keeps in-progress sessions only for today", () => {
    const days = buildDailyWorkReview([
      row({
        id: "today-running",
        status: "running",
        titleLabel: "今天继续推进日报",
        updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
      }),
      {
        id: "old-running",
        tool: "codex",
        status: "running",
        title: "历史里残留的运行态",
        task: "历史里残留的运行态",
        updatedAt: Date.parse("2026-05-23T18:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-23T17:58:00+08:00"),
      },
      {
        id: "old-completed",
        tool: "codex",
        status: "completed",
        title: "历史已完成事项",
        task: "历史已完成事项",
        updatedAt: Date.parse("2026-05-23T19:00:00+08:00"),
        lastUserMessageAt: Date.parse("2026-05-23T18:58:00+08:00"),
      },
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
    });

    expect(days.map((day) => day.key)).toEqual(["2026-05-25", "2026-05-23"]);
    expect(days[0]).toMatchObject({
      key: "2026-05-25",
      isToday: true,
      ongoingCount: 1,
    });
    expect(days[1]).toMatchObject({
      key: "2026-05-23",
      isToday: false,
      completedCount: 1,
      ongoingCount: 0,
      sessionCount: 1,
      summaryText: "1 个事项：完成 1；1 个 agent。",
    });
    expect(days[1].entries.map((entry) => entry.id)).toEqual(["old-completed"]);
  });

  it("filters review days by calendar range before applying the display count", () => {
    const days = buildDailyWorkReview([
      row({
        id: "today",
        titleLabel: "今天的事项",
        updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
      }),
      row({
        id: "outside-range",
        titleLabel: "很早之前的事项",
        updatedAt: Date.parse("2026-05-01T10:00:00+08:00"),
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
      maxDays: 30,
      rangeDays: 7,
    });

    expect(days.map((day) => day.key)).toEqual(["2026-05-25"]);
  });

  it("keeps deterministic summaries compact when titles are long", () => {
    const days = buildDailyWorkReview([
      row({
        id: "long-title-a",
        titleLabel: "我发现托管 CLI 提交的 session 里面的内容好像不完整，正常应该第一句是我提交的内容",
      }),
      row({
        id: "long-title-b",
        titleLabel: "查一下正式环境的版本 resource_version_info 这个指标，然后对比即将要发的分支",
        updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
      }),
      row({
        id: "short-title",
        titleLabel: "整理日报体验",
        updatedAt: Date.parse("2026-05-25T11:00:00+08:00"),
      }),
    ], {
      locale: "zh-CN",
      now: Date.parse("2026-05-25T14:00:00+08:00"),
    });

    expect(days[0].summaryText).toBe("3 个事项：完成 3；1 个 agent。");
  });
});
