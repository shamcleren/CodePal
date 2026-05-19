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
    expect(html).toContain("bar-col");
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
});
