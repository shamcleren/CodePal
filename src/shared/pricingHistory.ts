import type { ModelPricingHistoryEntry, PricingChangeKind } from "./pricingManifest";
import type { ModelPricing } from "./usageTypes";

export type PricingChangeEvent = {
  modelId: string;
  displayName: string;
  effectiveFrom: number;
  changeKind: PricingChangeKind;
  note?: string;
  inputPerMillion: string;
  outputPerMillion: string;
  previousInputPerMillion?: string;
  previousOutputPerMillion?: string;
};

export type PricingHistoryIndex = Map<string, ModelPricingHistoryEntry[]>;

export function buildPricingHistoryIndex(history: ModelPricingHistoryEntry[]): PricingHistoryIndex {
  const index: PricingHistoryIndex = new Map();
  for (const row of history) {
    const bucket = index.get(row.modelId) ?? [];
    bucket.push(row);
    index.set(row.modelId, bucket);
  }
  for (const bucket of index.values()) {
    bucket.sort((a, b) => a.effectiveFrom - b.effectiveFrom);
  }
  return index;
}

export function resolvePricingAtTimestamp(
  modelId: string | undefined,
  timestamp: number,
  index: PricingHistoryIndex,
  currentPricing: ModelPricing[] = [],
): ModelPricing | undefined {
  const normalizedModelId = modelId?.trim() || "unknown";
  const historyRows = index.get(normalizedModelId);
  if (historyRows && historyRows.length > 0) {
    let match: ModelPricingHistoryEntry | undefined;
    for (const row of historyRows) {
      if (row.effectiveFrom <= timestamp) {
        match = row;
      } else {
        break;
      }
    }
    if (match) return match;
    return undefined;
  }
  return currentPricing.find((row) => row.modelId === normalizedModelId);
}

export function estimateHistoricalTokenCost(input: {
  modelId?: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  historyIndex: PricingHistoryIndex;
  currentPricing?: ModelPricing[];
}): number {
  const pricing = resolvePricingAtTimestamp(
    input.modelId,
    input.timestamp,
    input.historyIndex,
    input.currentPricing,
  );
  if (!pricing) return 0;
  const inputPerMillion = Number.parseFloat(pricing.inputPerMillion);
  const outputPerMillion = Number.parseFloat(pricing.outputPerMillion);
  const cacheReadPerMillion = Number.parseFloat(pricing.cacheReadPerMillion);
  const cacheCreationPerMillion = Number.parseFloat(pricing.cacheCreationPerMillion);
  if (
    !Number.isFinite(inputPerMillion) ||
    !Number.isFinite(outputPerMillion) ||
    !Number.isFinite(cacheReadPerMillion) ||
    !Number.isFinite(cacheCreationPerMillion)
  ) {
    return 0;
  }
  return (
    (input.inputTokens / 1_000_000) * inputPerMillion +
    (input.outputTokens / 1_000_000) * outputPerMillion +
    (input.cacheReadTokens / 1_000_000) * cacheReadPerMillion +
    (input.cacheCreationTokens / 1_000_000) * cacheCreationPerMillion
  );
}

export function listPricingChangeEvents(
  history: ModelPricingHistoryEntry[],
  range?: { startMs: number; endMs: number },
): PricingChangeEvent[] {
  const byModel = buildPricingHistoryIndex(history);
  const events: PricingChangeEvent[] = [];
  for (const [modelId, rows] of byModel) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const previous = index > 0 ? rows[index - 1] : undefined;
      const changeKind =
        row.changeKind ??
        (index === 0 ? "initial" : previous &&
            (previous.inputPerMillion !== row.inputPerMillion ||
              previous.outputPerMillion !== row.outputPerMillion)
          ? "price_change"
          : "initial");
      if (changeKind === "initial" && row.effectiveFrom === 0) {
        continue;
      }
      if (range && (row.effectiveFrom < range.startMs || row.effectiveFrom > range.endMs)) {
        continue;
      }
      events.push({
        modelId,
        displayName: row.displayName,
        effectiveFrom: row.effectiveFrom,
        changeKind,
        note: row.note,
        inputPerMillion: row.inputPerMillion,
        outputPerMillion: row.outputPerMillion,
        previousInputPerMillion: previous?.inputPerMillion,
        previousOutputPerMillion: previous?.outputPerMillion,
      });
    }
  }
  return events.sort((a, b) => a.effectiveFrom - b.effectiveFrom);
}

export function buildPricingTrendSeries(
  history: ModelPricingHistoryEntry[],
  modelId: string,
  priceField: keyof Pick<
    ModelPricing,
    "inputPerMillion" | "outputPerMillion" | "cacheReadPerMillion" | "cacheCreationPerMillion"
  >,
): Array<{ effectiveFrom: number; value: number; changeKind?: PricingChangeKind; note?: string }> {
  const rows = buildPricingHistoryIndex(history).get(modelId) ?? [];
  return rows
    .map((row) => ({
      effectiveFrom: row.effectiveFrom,
      value: Number.parseFloat(row[priceField]),
      changeKind: row.changeKind,
      note: row.note,
    }))
    .filter((row) => Number.isFinite(row.value));
}
