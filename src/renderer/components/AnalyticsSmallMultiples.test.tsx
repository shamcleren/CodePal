import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsSmallMultiples } from "./AnalyticsSmallMultiples";
import type { TokenTrendPoint } from "../../shared/analyticsTypes";

const points: TokenTrendPoint[] = [
  {
    bucketStart: new Date(2026, 4, 20, 10, 0, 0, 0).getTime(),
    agent: "codex",
    model: "gpt-5.5",
    inputTokens: 1_000,
    outputTokens: 100,
    cacheReadTokens: 500,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    totalTokens: 1_600,
    requestCount: 1,
  },
  {
    bucketStart: new Date(2026, 4, 20, 11, 0, 0, 0).getTime(),
    agent: "codex",
    model: "gpt-5.5",
    inputTokens: 2_000,
    outputTokens: 300,
    cacheReadTokens: 700,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    totalTokens: 3_000,
    requestCount: 1,
  },
];

describe("AnalyticsSmallMultiples", () => {
  it("renders hover zones and peak/latest context for mini time series", () => {
    const html = renderToStaticMarkup(
      <AnalyticsSmallMultiples points={points} formatValue={(value) => `${Math.round(value)}`} />,
    );

    expect(html).toContain("analytics-small-multiples__hover-zone");
    expect(html).toContain("Peak");
    expect(html).toContain("Latest");
  });
});
