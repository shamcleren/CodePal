import { describe, expect, it } from "vitest";
import type { AnalyticsMetric } from "../shared/analyticsTypes";
import {
  estimateTokenCost,
  formatMetricValue,
  formatUsageCost,
  formatUsageTokens,
  selectUsageCost,
} from "./usageFormat";

describe("usageFormat", () => {
  it("formats token counts consistently for compact UI surfaces", () => {
    expect(formatUsageTokens(4_000, "zh-CN")).toBe("4K");
    expect(formatUsageTokens(170_000, "zh-CN")).toBe("170K");
    expect(formatUsageTokens(1_600_000, "zh-CN")).toBe("1.6M");
    expect(formatUsageTokens(1_105_600_000, "zh-CN")).toBe("1,105.6M");
  });

  it("formats USD costs with the active locale", () => {
    expect(formatUsageCost(17.55, { currency: "USD", locale: "en" })).toBe("$17.55");
    expect(formatUsageCost(17.55, { currency: "USD", locale: "zh-CN" })).toBe("US$17.55");
    expect(formatUsageCost(0.004, { currency: "USD", locale: "en" })).toBe("<$0.01");
  });

  it("prefers reported costs over estimated costs", () => {
    expect(selectUsageCost({ reported: 1.2, estimated: 0.8, currency: "USD" })).toEqual({
      amount: 1.2,
      currency: "USD",
      kind: "reported",
    });
    expect(selectUsageCost({ estimated: 0.8, currency: "USD" })).toEqual({
      amount: 0.8,
      currency: "USD",
      kind: "estimated",
    });
  });

  it("estimates token cost from model pricing", () => {
    expect(
      estimateTokenCost(
        {
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          cacheReadTokens: 100_000,
          cacheCreationTokens: 10_000,
          model: "gpt-5.5",
        },
        [
          {
            modelId: "gpt-5.5",
            displayName: "GPT 5.5",
            inputPerMillion: "5",
            outputPerMillion: "25",
            cacheReadPerMillion: "0.50",
            cacheCreationPerMillion: "6.25",
          },
        ],
      ),
    ).toBeCloseTo(17.6125);
  });

  it("prefers exact and more specific model pricing over shorter prefix matches", () => {
    const pricing = [
      {
        modelId: "gpt-5",
        displayName: "GPT-5",
        inputPerMillion: "1.25",
        outputPerMillion: "10",
        cacheReadPerMillion: "0.125",
        cacheCreationPerMillion: "0",
      },
      {
        modelId: "gpt-5.5",
        displayName: "GPT-5.5",
        inputPerMillion: "5",
        outputPerMillion: "30",
        cacheReadPerMillion: "0.50",
        cacheCreationPerMillion: "0",
      },
    ];

    expect(
      estimateTokenCost(
        {
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          cacheReadTokens: 100_000,
          cacheCreationTokens: 0,
          model: "gpt-5.5",
        },
        pricing,
        { allowModelFallback: false },
      ),
    ).toBeCloseTo(20.05);

    expect(
      estimateTokenCost(
        {
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          cacheReadTokens: 100_000,
          cacheCreationTokens: 0,
          model: "gpt-5.5-2026-06",
        },
        pricing,
        { allowModelFallback: false },
      ),
    ).toBeCloseTo(20.05);
  });

  it("uses the same metric formatter for analytics chart values", () => {
    expect(formatMetricValue(1_600_000, "tokens" satisfies AnalyticsMetric, "en")).toBe("1.6M");
    expect(formatMetricValue(17.55, "cost" satisfies AnalyticsMetric, "zh-CN")).toBe("US$18");
  });
});
