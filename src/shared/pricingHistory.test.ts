import { describe, expect, it } from "vitest";
import {
  buildPricingHistoryIndex,
  estimateHistoricalTokenCost,
  listPricingChangeEvents,
} from "./pricingHistory";
import type { ModelPricingHistoryEntry } from "./pricingManifest";

const history: ModelPricingHistoryEntry[] = [
  {
    modelId: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    effectiveFrom: Date.parse("2026-05-28T00:00:00.000Z"),
    inputPerMillion: "5",
    outputPerMillion: "25",
    cacheReadPerMillion: "0.50",
    cacheCreationPerMillion: "6.25",
    changeKind: "new_model",
  },
  {
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    effectiveFrom: 0,
    inputPerMillion: "3",
    outputPerMillion: "15",
    cacheReadPerMillion: "0.30",
    cacheCreationPerMillion: "3.75",
    changeKind: "initial",
  },
  {
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    effectiveFrom: Date.parse("2026-04-01T00:00:00.000Z"),
    inputPerMillion: "4",
    outputPerMillion: "18",
    cacheReadPerMillion: "0.40",
    cacheCreationPerMillion: "4.00",
    changeKind: "price_change",
  },
];

describe("pricingHistory", () => {
  it("uses the latest effective price at or before the usage timestamp", () => {
    const index = buildPricingHistoryIndex(history);
    const beforeLaunch = estimateHistoricalTokenCost({
      modelId: "claude-opus-4-8",
      timestamp: Date.parse("2026-05-01T00:00:00.000Z"),
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      historyIndex: index,
    });
    const afterLaunch = estimateHistoricalTokenCost({
      modelId: "claude-opus-4-8",
      timestamp: Date.parse("2026-06-01T00:00:00.000Z"),
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      historyIndex: index,
    });
    expect(beforeLaunch).toBe(0);
    expect(afterLaunch).toBe(5);
  });

  it("lists pricing change events inside the selected range", () => {
    const events = listPricingChangeEvents(history, {
      startMs: Date.parse("2026-04-01T00:00:00.000Z"),
      endMs: Date.parse("2026-06-30T00:00:00.000Z"),
    });
    expect(events.map((event) => event.modelId)).toEqual([
      "claude-sonnet-4-6",
      "claude-opus-4-8",
    ]);
    expect(events[0]?.changeKind).toBe("price_change");
    expect(events[1]?.changeKind).toBe("new_model");
  });
});
