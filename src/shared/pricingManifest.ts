import type { ModelPricing } from "./usageTypes";

export type PricingChangeKind = "initial" | "new_model" | "price_change";

export type ModelPricingHistoryEntry = ModelPricing & {
  effectiveFrom: number;
  changeKind?: PricingChangeKind;
  note?: string;
};

export type PricingManifest = {
  currency?: string;
  unit?: string;
  updatedAt?: string;
  pricing: ModelPricing[];
  pricingHistory?: Array<Record<string, unknown>>;
};

export function parseEffectiveFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? Math.trunc(value) : null;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  const parsed = Date.parse(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function requiredString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredFinitePrice(record: Record<string, unknown>, key: string): string | null {
  const value = requiredString(record, key);
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? value : null;
}

function normalizeChangeKind(value: unknown): PricingChangeKind | undefined {
  if (value === "initial" || value === "new_model" || value === "price_change") {
    return value;
  }
  return undefined;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function normalizePricingRow(value: unknown): ModelPricing | null {
  const record = asRecord(value);
  if (!record) return null;
  const modelId = requiredString(record, "modelId");
  const displayName = requiredString(record, "displayName");
  const inputPerMillion = requiredFinitePrice(record, "inputPerMillion");
  const outputPerMillion = requiredFinitePrice(record, "outputPerMillion");
  const cacheReadPerMillion = requiredFinitePrice(record, "cacheReadPerMillion");
  const cacheCreationPerMillion = requiredFinitePrice(record, "cacheCreationPerMillion");
  if (
    !modelId ||
    !displayName ||
    !inputPerMillion ||
    !outputPerMillion ||
    !cacheReadPerMillion ||
    !cacheCreationPerMillion
  ) {
    return null;
  }
  return {
    modelId,
    displayName,
    inputPerMillion,
    outputPerMillion,
    cacheReadPerMillion,
    cacheCreationPerMillion,
    ...(optionalBoolean(record, "isCurrent") !== undefined
      ? { isCurrent: optionalBoolean(record, "isCurrent") }
      : {}),
  };
}

export function normalizePricingHistoryRow(value: unknown): ModelPricingHistoryEntry | null {
  const pricing = normalizePricingRow(value);
  if (!pricing) return null;
  const record = asRecord(value);
  if (!record) return null;
  const effectiveFrom = parseEffectiveFrom(record.effectiveFrom);
  if (effectiveFrom === null) return null;
  const note = requiredString(record, "note") ?? undefined;
  const changeKind = normalizeChangeKind(record.changeKind);
  return {
    ...pricing,
    effectiveFrom,
    ...(changeKind ? { changeKind } : {}),
    ...(note ? { note } : {}),
  };
}

export function rowsFromManifestPayload(payload: unknown): ModelPricing[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizePricingRow).filter((row): row is ModelPricing => row !== null);
  }
  const record = asRecord(payload);
  if (!record) return [];
  const pricingRows = Array.isArray(record.pricing) ? record.pricing : Array.isArray(record.models) ? record.models : [];
  return pricingRows.map(normalizePricingRow).filter((row): row is ModelPricing => row !== null);
}

export function manifestUpdatedAtFromPayload(payload: unknown): string | undefined {
  const record = asRecord(payload);
  if (!record || typeof record.updatedAt !== "string") return undefined;
  const value = record.updatedAt.trim();
  return value ? value : undefined;
}

export function historyRowsFromManifestPayload(payload: unknown): ModelPricingHistoryEntry[] {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.pricingHistory)) {
    return [];
  }
  return record.pricingHistory
    .map(normalizePricingHistoryRow)
    .filter((row): row is ModelPricingHistoryEntry => row !== null);
}

export function deriveBaselineHistoryFromPricing(pricing: ModelPricing[]): ModelPricingHistoryEntry[] {
  return pricing.map((row) => ({
    ...row,
    effectiveFrom: 0,
    changeKind: "initial" as const,
  }));
}

export function mergeManifestHistory(
  pricing: ModelPricing[],
  explicitHistory: ModelPricingHistoryEntry[],
): ModelPricingHistoryEntry[] {
  const merged = new Map<string, ModelPricingHistoryEntry[]>();
  const explicitModelIds = new Set(explicitHistory.map((row) => row.modelId));
  const currentPricingById = new Map(pricing.map((row) => [row.modelId, row]));
  const addRow = (row: ModelPricingHistoryEntry) => {
    const bucket = merged.get(row.modelId) ?? [];
    const existing = bucket.find((entry) => entry.effectiveFrom === row.effectiveFrom);
    if (existing) {
      Object.assign(existing, row);
      return;
    }
    bucket.push(row);
    merged.set(row.modelId, bucket);
  };

  for (const row of explicitHistory) {
    const currentPricing = currentPricingById.get(row.modelId);
    addRow({
      ...row,
      ...(row.isCurrent === undefined && currentPricing ? { isCurrent: currentPricing.isCurrent !== false } : {}),
    });
  }
  for (const row of pricing) {
    if (!explicitModelIds.has(row.modelId)) {
      addRow({ ...row, effectiveFrom: 0, changeKind: "initial", isCurrent: row.isCurrent !== false });
    }
  }

  return Array.from(merged.values())
    .flatMap((rows) => rows.sort((a, b) => a.effectiveFrom - b.effectiveFrom))
    .sort((a, b) => {
      if (a.modelId !== b.modelId) return a.modelId.localeCompare(b.modelId);
      return a.effectiveFrom - b.effectiveFrom;
    });
}

export function pricingHistoryKey(row: Pick<ModelPricingHistoryEntry, "modelId" | "effectiveFrom">): string {
  return `${row.modelId}\u0000${row.effectiveFrom}`;
}

export function stableManifestHash(payload: unknown): string {
  const record = asRecord(payload);
  if (!record) return "";
  const pricing = rowsFromManifestPayload(payload);
  const history = mergeManifestHistory(pricing, historyRowsFromManifestPayload(payload));
  const canonical = JSON.stringify({
    currency: typeof record.currency === "string" ? record.currency : "USD",
    unit: typeof record.unit === "string" ? record.unit : "per_1m_tokens",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    pricing: pricing.map((row) => ({
      modelId: row.modelId,
      displayName: row.displayName,
      inputPerMillion: row.inputPerMillion,
      outputPerMillion: row.outputPerMillion,
      cacheReadPerMillion: row.cacheReadPerMillion,
      cacheCreationPerMillion: row.cacheCreationPerMillion,
      isCurrent: row.isCurrent ?? true,
    })),
    pricingHistory: history.map((row) => ({
      modelId: row.modelId,
      displayName: row.displayName,
      effectiveFrom: row.effectiveFrom,
      inputPerMillion: row.inputPerMillion,
      outputPerMillion: row.outputPerMillion,
      cacheReadPerMillion: row.cacheReadPerMillion,
      cacheCreationPerMillion: row.cacheCreationPerMillion,
      isCurrent: row.isCurrent ?? false,
      changeKind: row.changeKind ?? null,
      note: row.note ?? null,
    })),
  });
  return canonical;
}
