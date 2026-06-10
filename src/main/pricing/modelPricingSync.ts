import { createHash } from "node:crypto";
import {
  DEFAULT_MODEL_PRICING_REMOTE_URL,
  type PricingSettings,
} from "../../shared/appSettings";
import {
  manifestUpdatedAtFromPayload,
  historyRowsFromManifestPayload,
  parseEffectiveFrom,
  rowsFromManifestPayload,
  stableManifestHash,
  type ModelPricingHistoryEntry,
} from "../../shared/pricingManifest";
import type { ModelPricing } from "../../shared/usageTypes";

const PRICING_MANIFEST_HASH_KEY = "pricing.manifestHash";
const PRICING_MANIFEST_UPDATED_AT_KEY = "pricing.manifestUpdatedAt";

type PricingStore = {
  getPricingManifestHash?: () => string | null;
  getModelPricing?: () => ModelPricing[];
  setPricingManifestHash?: (hash: string) => void;
  setPricingManifestUpdatedAt?: (updatedAt: string) => void;
  upsertModelPricing: (pricing: ModelPricing) => void;
  upsertModelPricingHistory?: (pricing: ModelPricingHistoryEntry) => void;
};

type SyncModelPricingOptions = {
  remoteUrl: PricingSettings["remoteUrl"];
  historyStore: PricingStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export type SyncModelPricingResult =
  | { ok: true; imported: number; historyImported: number; url: string; unchanged?: boolean }
  | { ok: false; imported: 0; historyImported: 0; url?: string; error: string };

export { DEFAULT_MODEL_PRICING_REMOTE_URL, PRICING_MANIFEST_HASH_KEY, PRICING_MANIFEST_UPDATED_AT_KEY };

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

function manifestHash(payload: unknown): string {
  return createHash("sha256").update(stableManifestHash(payload)).digest("hex");
}

function pricingSnapshotEffectiveFrom(payload: unknown, now: () => number): number {
  const updatedAt = manifestUpdatedAtFromPayload(payload);
  const parsed = parseEffectiveFrom(updatedAt);
  return parsed ?? now();
}

function currentRemotePricing(pricing: ModelPricing[]): ModelPricing[] {
  return pricing.map((row) => ({ ...row, isCurrent: row.isCurrent !== false }));
}

function pricingAmountsEqual(left: ModelPricing | undefined, right: ModelPricing): boolean {
  return Boolean(left) &&
    left?.inputPerMillion === right.inputPerMillion &&
    left.outputPerMillion === right.outputPerMillion &&
    left.cacheReadPerMillion === right.cacheReadPerMillion &&
    left.cacheCreationPerMillion === right.cacheCreationPerMillion;
}

function localCurrentPricingMatchesRemote(
  localPricing: ModelPricing[],
  remotePricing: ModelPricing[],
): boolean {
  const remoteIds = new Set(remotePricing.map((row) => row.modelId));
  const localCurrent = localPricing.filter((row) => row.isCurrent !== false);
  if (localCurrent.length !== remoteIds.size) return false;
  const localById = new Map(localCurrent.map((row) => [row.modelId, row]));
  return remotePricing.every((row) => {
    const local = localById.get(row.modelId);
    return local?.isCurrent !== false && pricingAmountsEqual(local, row);
  });
}

export async function syncModelPricingFromRemote(
  options: SyncModelPricingOptions,
): Promise<SyncModelPricingResult> {
  const remoteUrl = normalizeRemoteUrl(options.remoteUrl);
  if (!remoteUrl) {
    return {
      ok: false,
      imported: 0,
      historyImported: 0,
      error: "Remote model pricing URL is not configured",
    };
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(remoteUrl);
    if (!response.ok) {
      return {
        ok: false,
        imported: 0,
        historyImported: 0,
        url: remoteUrl,
        error: `Remote model pricing returned HTTP ${response.status}`,
      };
    }
    const payload = await response.json();
    const pricing = rowsFromManifestPayload(payload);
    if (pricing.length === 0 || pricing.some((row) => row === null)) {
      return {
        ok: false,
        imported: 0,
        historyImported: 0,
        url: remoteUrl,
        error: "Remote model pricing payload is invalid",
      };
    }

    const remotePricing = currentRemotePricing(pricing);
    const localPricing = options.historyStore.getModelPricing?.() ?? [];
    const nextHash = manifestHash(payload);
    const previousHash = options.historyStore.getPricingManifestHash?.() ?? null;
    if (previousHash && previousHash === nextHash && localCurrentPricingMatchesRemote(localPricing, remotePricing)) {
      return {
        ok: true,
        imported: 0,
        historyImported: 0,
        url: remoteUrl,
        unchanged: true,
      };
    }

    const effectiveFrom = pricingSnapshotEffectiveFrom(payload, options.now ?? Date.now);
    const localById = new Map(localPricing.map((row) => [row.modelId, row]));
    const remoteIds = new Set(remotePricing.map((row) => row.modelId));
    let imported = 0;
    let historyImported = 0;

    for (const row of remotePricing) {
      const previous = localById.get(row.modelId);
      options.historyStore.upsertModelPricing(row);
      imported += 1;
      if (!previous || previous.isCurrent === false || !pricingAmountsEqual(previous, row)) {
        options.historyStore.upsertModelPricingHistory?.({
          ...row,
          effectiveFrom,
          changeKind: previous ? "price_change" : "new_model",
          isCurrent: true,
        });
        historyImported += 1;
      }
    }

    for (const local of localPricing) {
      if (local.isCurrent === false || remoteIds.has(local.modelId)) {
        continue;
      }
      options.historyStore.upsertModelPricing({ ...local, isCurrent: false });
      imported += 1;
    }

    for (const historyRow of historyRowsFromManifestPayload(payload)) {
      options.historyStore.upsertModelPricingHistory?.(historyRow);
      historyImported += 1;
    }

    options.historyStore.setPricingManifestHash?.(nextHash);
    const updatedAt = manifestUpdatedAtFromPayload(payload);
    if (updatedAt) {
      options.historyStore.setPricingManifestUpdatedAt?.(updatedAt);
    }

    return {
      ok: true,
      imported,
      historyImported,
      url: remoteUrl,
    };
  } catch (error) {
    return {
      ok: false,
      imported: 0,
      historyImported: 0,
      url: remoteUrl,
      error: (error as Error).message,
    };
  }
}
