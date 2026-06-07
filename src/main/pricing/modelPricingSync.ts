import {
  DEFAULT_MODEL_PRICING_REMOTE_URL,
  type PricingSettings,
} from "../../shared/appSettings";
import type { ModelPricing } from "../../shared/usageTypes";

type PricingStore = {
  upsertModelPricing: (pricing: ModelPricing) => void;
};

type SyncModelPricingOptions = {
  remoteUrl: PricingSettings["remoteUrl"];
  historyStore: PricingStore;
  fetchImpl?: typeof fetch;
};

type SyncModelPricingResult =
  | { ok: true; imported: number; url: string }
  | { ok: false; imported: 0; url?: string; error: string };

export { DEFAULT_MODEL_PRICING_REMOTE_URL };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function rowsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = asRecord(payload);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.pricing)) {
    return record.pricing;
  }
  if (Array.isArray(record.models)) {
    return record.models;
  }
  return [];
}

function requiredString(record: Record<string, unknown>, key: keyof ModelPricing): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredFinitePrice(record: Record<string, unknown>, key: keyof ModelPricing): string | null {
  const value = requiredString(record, key);
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? value : null;
}

function normalizePricingRow(value: unknown): ModelPricing | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
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
  };
}

function normalizeRemoteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export async function syncModelPricingFromRemote(
  options: SyncModelPricingOptions,
): Promise<SyncModelPricingResult> {
  const remoteUrl = normalizeRemoteUrl(options.remoteUrl);
  if (!remoteUrl) {
    return { ok: false, imported: 0, error: "Remote model pricing URL is not configured" };
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(remoteUrl);
    if (!response.ok) {
      return {
        ok: false,
        imported: 0,
        url: remoteUrl,
        error: `Remote model pricing returned HTTP ${response.status}`,
      };
    }
    const payload = await response.json();
    const rows = rowsFromPayload(payload);
    const pricing = rows.map(normalizePricingRow);
    if (pricing.length === 0 || pricing.some((row) => row === null)) {
      return {
        ok: false,
        imported: 0,
        url: remoteUrl,
        error: "Remote model pricing payload is invalid",
      };
    }
    for (const row of pricing) {
      options.historyStore.upsertModelPricing(row);
    }
    return { ok: true, imported: pricing.length, url: remoteUrl };
  } catch (error) {
    return {
      ok: false,
      imported: 0,
      url: remoteUrl,
      error: (error as Error).message,
    };
  }
}
