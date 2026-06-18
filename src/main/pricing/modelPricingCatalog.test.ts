import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultProviderGatewaySettings,
  resolveConfiguredProviderModelIds,
} from "../../shared/appSettings";
import {
  historyRowsFromManifestPayload,
  mergeManifestHistory,
  normalizePricingHistoryRow,
  rowsFromManifestPayload,
} from "../../shared/pricingManifest";

type PricingManifest = {
  pricing?: Array<Record<string, unknown>>;
  pricingHistory?: Array<Record<string, unknown>>;
};

const repoRoot = path.resolve(__dirname, "../../..");
const manifestPath = path.join(repoRoot, "docs", "model-pricing.json");

const REQUIRED_MODEL_IDS = resolveConfiguredProviderModelIds(defaultProviderGatewaySettings);
const REQUIRED_OPENAI_GPT_5_4_MODEL_IDS = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"];

function loadManifest(): PricingManifest {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PricingManifest;
}

function pricingModelIds(manifest: PricingManifest): string[] {
  return (manifest.pricing ?? [])
    .map((entry) => (typeof entry.modelId === "string" ? entry.modelId.trim() : ""))
    .filter(Boolean);
}

function currentPricingRows(manifest: PricingManifest): Array<Record<string, unknown>> {
  return (manifest.pricing ?? []).filter((entry) => entry.isCurrent !== false);
}

describe("model pricing manifest", () => {
  it("has unique model ids and numeric price fields", () => {
    const manifest = loadManifest();
    const ids = pricingModelIds(manifest);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of manifest.pricing ?? []) {
      expect(typeof entry.modelId).toBe("string");
      expect(typeof entry.displayName).toBe("string");
      for (const field of [
        "inputPerMillion",
        "outputPerMillion",
        "cacheReadPerMillion",
        "cacheCreationPerMillion",
      ]) {
        const value = entry[field];
        expect(typeof value, `${String(entry.modelId)}.${field}`).toBe("string");
        expect(Number.isFinite(Number(value)), `${String(entry.modelId)}.${field}`).toBe(true);
      }
    }
  });

  it("covers default agent and Provider Gateway models", () => {
    const manifest = loadManifest();
    const ids = new Set([
      ...pricingModelIds(manifest),
      ...mergeManifestHistory(
        rowsFromManifestPayload(manifest),
        historyRowsFromManifestPayload(manifest),
      ).map((row) => row.modelId),
    ]);
    const required = [...REQUIRED_MODEL_IDS];
    const missing = required.filter((modelId) => !ids.has(modelId));
    expect(missing).toEqual([]);
  });

  it("covers current OpenAI GPT-5.4 models with standard short-context pricing", () => {
    const rows = currentPricingRows(loadManifest());
    const byModelId = new Map(rows.map((row) => [row.modelId, row]));

    expect(REQUIRED_OPENAI_GPT_5_4_MODEL_IDS.filter((modelId) => !byModelId.has(modelId))).toEqual([]);
    expect(byModelId.get("gpt-5.4")).toMatchObject({
      inputPerMillion: "2.50",
      outputPerMillion: "15",
      cacheReadPerMillion: "0.25",
      cacheCreationPerMillion: "0",
    });
    expect(byModelId.get("gpt-5.4-mini")).toMatchObject({
      inputPerMillion: "0.75",
      outputPerMillion: "4.50",
      cacheReadPerMillion: "0.075",
      cacheCreationPerMillion: "0",
    });
    expect(byModelId.get("gpt-5.4-nano")).toMatchObject({
      inputPerMillion: "0.20",
      outputPerMillion: "1.25",
      cacheReadPerMillion: "0.02",
      cacheCreationPerMillion: "0",
    });
  });

  it("has no duplicate current display names", () => {
    const rows = currentPricingRows(loadManifest());
    const displayNames = rows
      .map((entry) => (typeof entry.displayName === "string" ? entry.displayName.trim() : ""))
      .filter(Boolean);
    expect(new Set(displayNames).size).toBe(displayNames.length);
    expect(displayNames).not.toContain("Claude Opus 4");
  });

  it("has valid pricingHistory rows with unique model/effectiveFrom keys", () => {
    const manifest = loadManifest();
    const pricing = rowsFromManifestPayload(manifest);
    const explicitHistory = historyRowsFromManifestPayload(manifest);
    expect(pricing.length).toBeGreaterThan(0);
    for (const entry of manifest.pricingHistory ?? []) {
      expect(normalizePricingHistoryRow(entry)).not.toBeNull();
    }

    const merged = mergeManifestHistory(pricing, explicitHistory);
    const keys = merged.map((row) => `${row.modelId}\u0000${row.effectiveFrom}`);
    expect(new Set(keys).size).toBe(keys.length);
    const missing = REQUIRED_MODEL_IDS.filter((modelId) =>
      merged.every((row) => row.modelId !== modelId),
    );
    expect(missing).toEqual([]);
  });
});
