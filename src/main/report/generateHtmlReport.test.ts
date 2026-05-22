import { describe, expect, it } from "vitest";
import { generateHtmlReport } from "./generateHtmlReport";

describe("generateHtmlReport", () => {
  it("generates valid HTML with title and date range", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [],
      pricing: [],
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("CodePal Usage Report");
    expect(html).toContain("2026-05-12 ~ 2026-05-18");
    expect(html).toContain("</html>");
  });

  it("localizes the deterministic report to Simplified Chinese", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      locale: "zh-CN",
      sessionStats: [{ agent: "codex", status: "completed", count: 2 }],
      daily: [
        {
          date: "2026-05-12",
          agent: "codex",
          inputTokens: 1_000,
          outputTokens: 200,
          cacheReadTokens: 300,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          totalTokens: 1_500,
          requestCount: 3,
        },
      ],
      byModel: [],
      workHealth: {
        signals: [
          {
            kind: "attention",
            label: "Attention",
            value: "2",
            detail: "2 active items need review",
            tone: "warning",
            sessionIds: ["s1", "s2"],
          },
        ],
      },
      pricing: [],
    });

    expect(html).toContain("<html lang=\"zh-CN\">");
    expect(html).toContain("CodePal 用量报告");
    expect(html).toContain("Token 用量");
    expect(html).toContain("每日趋势");
    expect(html).toContain("工作健康");
    expect(html).toContain("2 个活跃项需要关注");
    expect(html).not.toContain("CodePal Usage Report");
    expect(html).not.toContain(">Work Health<");
  });

  it("uses context session count instead of the percent value in localized report details", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      locale: "zh-CN",
      sessionStats: [],
      daily: [],
      byModel: [],
      workHealth: {
        signals: [
          {
            kind: "context_near_full",
            label: "Context near full",
            value: "88%",
            detail: "1 session above 85% context",
            tone: "warning",
            sessionIds: ["ctx-1"],
          },
        ],
      },
      pricing: [],
    });

    expect(html).toContain("88%");
    expect(html).toContain("1 个 session 超过上下文阈值");
    expect(html).not.toContain("88 个 session 超过上下文阈值");
  });

  it("uses a wide responsive report layout with scrollable tables", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [
        {
          model: "very-long-model-name-that-should-not-force-the-whole-table-to-wrap",
          agent: "codex",
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 20,
          cacheCreationTokens: 0,
          totalTokens: 170,
          requestCount: 1,
        },
      ],
      pricing: [],
    });

    expect(html).toContain("max-width: 1680px;");
    expect(html).toContain("class=\"table-wrap\"");
    expect(html).toContain("table-layout: auto;");
    expect(html).not.toContain("max-width: 960px;");
    expect(html).not.toContain("table-layout: fixed;");
  });

  it("includes session stats when present", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [
        { agent: "claude", status: "completed", count: 10 },
        { agent: "codex", status: "running", count: 3 },
      ],
      daily: [],
      byModel: [],
      pricing: [],
    });

    expect(html).toContain("Sessions");
    expect(html).toContain("Claude");
    expect(html).toContain("Codex");
    expect(html).toContain("10");
  });

  it("includes hero stats with token data", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [
        {
          date: "2026-05-12",
          agent: "claude",
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          cacheReadTokens: 2_000_000,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          totalTokens: 3_500_000,
          requestCount: 50,
        },
      ],
      byModel: [],
      pricing: [],
    });

    expect(html).toContain("1.0M"); // input
    expect(html).toContain("500.0K"); // output
    expect(html).toContain("2.0M"); // cache
    expect(html).toContain("50"); // requests
  });

  it("includes daily chart bars", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-14",
      sessionStats: [],
      daily: [
        {
          date: "2026-05-12", agent: "claude",
          inputTokens: 100, outputTokens: 50, cacheReadTokens: 0,
          cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 150, requestCount: 1,
        },
        {
          date: "2026-05-13", agent: "claude",
          inputTokens: 200, outputTokens: 100, cacheReadTokens: 0,
          cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 300, requestCount: 2,
        },
      ],
      byModel: [],
      pricing: [],
    });

    expect(html).toContain("Daily Trend");
    expect(html).toContain("05-12");
    expect(html).toContain("05-13");
    expect(html).toContain("report-trend__svg");
    expect(html).toContain("report-trend__line--total");
    expect(html).toContain("report-trend__hover-zone");
    expect(html).toContain("report-trend__tooltip");
    expect(html).not.toContain("bar-col");
  });

  it("includes work health and report trend tooltips when provided", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-14",
      sessionStats: [],
      daily: [
        {
          date: "2026-05-12", agent: "codex",
          inputTokens: 100, outputTokens: 25, cacheReadTokens: 50,
          cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 175, requestCount: 2,
        },
        {
          date: "2026-05-13", agent: "codex",
          inputTokens: 200, outputTokens: 50, cacheReadTokens: 100,
          cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 350, requestCount: 3,
        },
      ],
      byModel: [],
      pricing: [],
      workHealth: {
        signals: [
          {
            kind: "attention",
            label: "Attention",
            value: "2",
            detail: "2 active items need review",
            tone: "warning",
            sessionIds: ["s1", "s2"],
          },
        ],
      },
    } as Parameters<typeof generateHtmlReport>[0]);

    expect(html).toContain("Work Health");
    expect(html).toContain("2 active items need review");
    expect(html).toContain("report-health__signal--warning");
    expect(html).toContain("data-total=\"175\"");
    expect(html).toContain("data-input=\"100\"");
    expect(html).toContain("CodePalReportTrend");
  });

  it("matches the selected report metric for non-token trends", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-14",
      sessionStats: [],
      daily: [],
      byModel: [],
      pricing: [],
      metric: "requests",
      trend: {
        granularity: "hour",
        sourcePointCount: 1,
        points: [
          {
            bucketStart: Date.parse("2026-05-12T10:00:00.000Z"),
            agent: "codex",
            model: "gpt-5.5",
            inputTokens: 100,
            outputTokens: 25,
            cacheReadTokens: 50,
            cacheCreationTokens: 0,
            reasoningTokens: 0,
            totalTokens: 175,
            requestCount: 7,
          },
        ],
      },
    });

    expect(html).toContain("data-metric=\"requests\"");
    expect(html).toContain("data-value=\"7\"");
    expect(html).toContain(">Requests</span>");
    expect(html).not.toContain("<path class=\"report-trend__line report-trend__line--input\"");
    expect(html).not.toContain("<path class=\"report-trend__line report-trend__line--cache\"");
  });

  it("includes model table with cost", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [
        {
          model: "claude-sonnet-4-5-20250929", agent: "claude",
          inputTokens: 1_000_000, outputTokens: 1_000_000,
          cacheReadTokens: 0, cacheCreationTokens: 0,
          totalTokens: 2_000_000, requestCount: 10,
        },
      ],
      pricing: [{
        modelId: "claude-sonnet-4-5-20250929", displayName: "Claude Sonnet 4.5",
        inputPerMillion: "3", outputPerMillion: "15",
        cacheReadPerMillion: "0.30", cacheCreationPerMillion: "3.75",
      }],
    });

    expect(html).toContain("By Model");
    expect(html).toContain("claude-sonnet-4-5-20250929");
    expect(html).toContain("$18.00"); // 1M*3 + 1M*15 = $18
  });

  it("includes detailed analytics sections for agents, sessions, and backfill status", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [],
      byAgent: [
        {
          agent: "codex",
          inputTokens: 1_000,
          outputTokens: 500,
          cacheReadTokens: 250,
          cacheCreationTokens: 0,
          totalTokens: 1_750,
          requestCount: 4,
        },
      ],
      topSessions: [
        {
          sessionId: "12345678-1234-1234-1234-123456789abc",
          title: "继续推进 Codex 历史用量补齐",
          agent: "codex",
          model: "gpt-5.5",
          inputTokens: 1_000,
          outputTokens: 500,
          cacheReadTokens: 250,
          cacheCreationTokens: 0,
          totalTokens: 1_750,
          requestCount: 4,
          firstSeenAt: Date.parse("2026-05-12T10:00:00.000Z"),
          lastSeenAt: Date.parse("2026-05-12T10:30:00.000Z"),
        },
      ],
      importStatus: {
        completedAt: Date.parse("2026-05-18T10:00:00.000Z"),
        claudeRowsImported: 2,
        codexRowsImported: 3,
        lastError: null,
      },
      pricing: [],
    });

    expect(html).toContain("By Agent");
    expect(html).toContain("Top Sessions");
    expect(html).toContain("Backfill");
    expect(html).toContain("继续推进 Codex 历史用量补齐");
    expect(html).toContain("12345678…9abc");
    expect(html).not.toContain("12345678-1234-1234-1234-123456789abc</td>");
    expect(html).toContain("Claude rows: 2");
    expect(html).toContain("Codex rows: 3");
  });

  it("includes live context percentages in the top sessions table", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [],
      topSessions: [
        {
          sessionId: "ctx-session",
          title: "Refactor analytics footer",
          agent: "codex",
          model: "gpt-5.5",
          inputTokens: 1_000,
          outputTokens: 500,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 1_500,
          requestCount: 2,
          firstSeenAt: 1_773_456_000_000,
          lastSeenAt: 1_773_456_000_000,
        },
      ],
      sessionContexts: {
        "ctx-session": { percent: 88, used: 227_392, max: 258_400 },
      },
      pricing: [],
    });

    expect(html).toContain("<th class=\"num\">Context</th>");
    expect(html).toContain("report-context report-context--warning");
    expect(html).toContain("88%");
    expect(html).toContain("227.4K / 258.4K");
  });

  it("escapes HTML in model names", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [
        {
          model: "<script>alert(1)</script>", agent: "claude",
          inputTokens: 0, outputTokens: 0,
          cacheReadTokens: 0, cacheCreationTokens: 0,
          totalTokens: 0, requestCount: 1,
        },
      ],
      pricing: [],
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("redacts session titles when redactSessionTitles is true", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [],
      topSessions: [
        {
          sessionId: "12345678-1234-1234-1234-123456789abc",
          title: "Sensitive Task Title",
          agent: "claude",
          model: "claude-3",
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 150,
          requestCount: 1,
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
        },
      ],
      pricing: [],
      redaction: { redactSessionTitles: true },
    });

    expect(html).not.toContain("Sensitive Task Title");
    expect(html).toContain("Session 1");
    expect(html).toContain("Redacted");
  });

  it("redacts model names when redactModelNames is true", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [
        {
          model: "claude-sonnet-4-5-20250929", agent: "claude",
          inputTokens: 100, outputTokens: 50,
          cacheReadTokens: 0, cacheCreationTokens: 0,
          totalTokens: 150, requestCount: 1,
        },
      ],
      topSessions: [
        {
          sessionId: "abc",
          title: null,
          agent: "claude",
          model: "claude-sonnet-4-5-20250929",
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          totalTokens: 150,
          requestCount: 1,
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
        },
      ],
      pricing: [],
      redaction: { redactModelNames: true },
    });

    expect(html).not.toContain("claude-sonnet-4-5-20250929");
    expect(html).toContain("model");
  });

  it("shows no redaction notice when redaction is not enabled", () => {
    const html = generateHtmlReport({
      startDate: "2026-05-12",
      endDate: "2026-05-18",
      sessionStats: [],
      daily: [],
      byModel: [],
      pricing: [],
    });

    expect(html).not.toContain("Redacted");
  });
});
