import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsLineChart } from "./AnalyticsLineChart";
import type { TokenTrendPoint } from "../../shared/analyticsTypes";

const points: TokenTrendPoint[] = [
  {
    bucketStart: 1,
    agent: "codex",
    model: "gpt-5.5",
    inputTokens: 10,
    outputTokens: 2,
    cacheReadTokens: 3,
    cacheCreationTokens: 1,
    reasoningTokens: 0,
    totalTokens: 16,
    requestCount: 1,
  },
  {
    bucketStart: 2,
    agent: "codex",
    model: "gpt-5.5",
    inputTokens: 14,
    outputTokens: 3,
    cacheReadTokens: 4,
    cacheCreationTokens: 1,
    reasoningTokens: 0,
    totalTokens: 22,
    requestCount: 2,
  },
];

describe("AnalyticsLineChart", () => {
  it("renders token lines with total, input, output, and cache legend labels", () => {
    const html = renderToStaticMarkup(
      <AnalyticsLineChart points={points} metric="tokens" />,
    );

    expect(html).toContain("analytics-line-chart");
    expect(html).toContain("Total");
    expect(html).toContain("Input");
    expect(html).toContain("Output");
    expect(html).toContain("Cache");
    expect(html).not.toContain("analytics-page__chart-bar");
  });

  it("renders point markers so a single bucket is visible", () => {
    const html = renderToStaticMarkup(
      <AnalyticsLineChart points={[points[0]]} metric="tokens" />,
    );

    expect(html).toContain("analytics-line-chart__point");
  });

  it("renders hover zones for tooltip hit testing", () => {
    const html = renderToStaticMarkup(
      <AnalyticsLineChart points={points} metric="tokens" />,
    );

    const hoverZones = html.match(/analytics-line-chart__hover-zone/g) ?? [];
    expect(hoverZones).toHaveLength(2);
  });

  it("renders Grafana-style linear paths without cubic loops", () => {
    const html = renderToStaticMarkup(
      <AnalyticsLineChart
        points={[
          { ...points[0], bucketStart: 1, totalTokens: 1_000, inputTokens: 1_000 },
          { ...points[0], bucketStart: 2, totalTokens: 40_000_000, inputTokens: 40_000_000 },
          { ...points[0], bucketStart: 3, totalTokens: 2_000, inputTokens: 2_000 },
          { ...points[0], bucketStart: 4, totalTokens: 35_000_000, inputTokens: 35_000_000 },
        ]}
        metric="tokens"
      />,
    );

    expect(html).toContain("analytics-line-chart__line--total");
    expect(html).not.toContain(" C ");
  });

  it("renders time labels through the latest bucket", () => {
    const start = new Date(2026, 4, 20, 12, 0, 0, 0).getTime();
    const end = new Date(2026, 4, 22, 12, 0, 0, 0).getTime();
    const html = renderToStaticMarkup(
      <AnalyticsLineChart
        points={[
          { ...points[0], bucketStart: start },
          { ...points[1], bucketStart: end },
        ]}
        metric="tokens"
        granularity="hour"
      />,
    );

    expect(html).toContain("05-20");
    expect(html).toContain("05-22");
  });

  it("keeps the selected time domain visible when today only has partial data", () => {
    const domainStart = new Date(2026, 4, 22, 0, 0, 0, 0).getTime();
    const pointTime = new Date(2026, 4, 22, 10, 0, 0, 0).getTime();
    const domainEnd = new Date(2026, 4, 22, 12, 0, 0, 0).getTime();
    const html = renderToStaticMarkup(
      <AnalyticsLineChart
        points={[{ ...points[0], bucketStart: pointTime }]}
        metric="tokens"
        granularity="minute"
        domainStart={domainStart}
        domainEnd={domainEnd}
      />,
    );

    expect(html).toContain("00:00");
    expect(html).toContain("12:00");
  });

  it("fills missing token buckets with zero points across the selected domain", () => {
    const dayOne = new Date(2026, 4, 20, 0, 0, 0, 0).getTime();
    const dayThree = new Date(2026, 4, 22, 0, 0, 0, 0).getTime();
    const domainEnd = new Date(2026, 4, 23, 0, 0, 0, 0).getTime();
    const html = renderToStaticMarkup(
      <AnalyticsLineChart
        points={[
          { ...points[0], bucketStart: dayOne },
          { ...points[1], bucketStart: dayThree },
        ]}
        metric="tokens"
        granularity="day"
        domainStart={dayOne}
        domainEnd={domainEnd}
      />,
    );

    const hoverZones = html.match(/analytics-line-chart__hover-zone/g) ?? [];
    expect(hoverZones).toHaveLength(3);
  });

  it("aligns hour x-axis labels to whole aggregation buckets", () => {
    const domainStart = new Date(2026, 4, 22, 10, 15, 0, 0).getTime();
    const pointTime = new Date(2026, 4, 22, 11, 0, 0, 0).getTime();
    const domainEnd = new Date(2026, 4, 22, 13, 45, 0, 0).getTime();
    const html = renderToStaticMarkup(
      <AnalyticsLineChart
        points={[{ ...points[0], bucketStart: pointTime }]}
        metric="tokens"
        granularity="hour"
        domainStart={domainStart}
        domainEnd={domainEnd}
      />,
    );

    expect(html).toContain("11:00");
    expect(html).toContain("12:00");
    expect(html).toContain("13:00");
    expect(html).not.toContain("10:15");
  });

  it("formats million-scale axis labels without duplicate rounded values", () => {
    const html = renderToStaticMarkup(
      <AnalyticsLineChart
        points={[
          {
            ...points[0],
            bucketStart: 1,
            inputTokens: 3_000_000,
            totalTokens: 3_000_000,
          },
        ]}
        metric="tokens"
      />,
    );

    expect(html).toContain("2.3M");
    expect(html).toContain("3.0M");
  });

  it("summarizes dense pulse data before drawing trend lines", () => {
    const dense = Array.from({ length: 500 }, (_, index): TokenTrendPoint => ({
      ...points[0],
      bucketStart: index,
      inputTokens: index % 17 === 0 ? 2_000_000 : 20_000,
      outputTokens: index % 41 === 0 ? 300_000 : 1_000,
      cacheReadTokens: index % 19 === 0 ? 1_600_000 : 10_000,
      cacheCreationTokens: 0,
      totalTokens:
        (index % 17 === 0 ? 2_000_000 : 20_000) +
        (index % 41 === 0 ? 300_000 : 1_000) +
        (index % 19 === 0 ? 1_600_000 : 10_000),
    }));

    const html = renderToStaticMarkup(
      <AnalyticsLineChart points={dense} metric="tokens" />,
    );

    expect(html).toContain("Trend summarized");
    expect(html).not.toContain("LTTB auto-sampled");
  });
});
