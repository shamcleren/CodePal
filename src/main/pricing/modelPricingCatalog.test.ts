import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultProviderGatewaySettings } from "../../shared/appSettings";

type PricingManifest = {
  pricing?: Array<Record<string, unknown>>;
};

const repoRoot = path.resolve(__dirname, "../../..");
const manifestPath = path.join(repoRoot, "docs", "model-pricing.json");

const REQUIRED_MODEL_IDS = [
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-20250514",
  "claude-opus-4-5-20251101",
  "claude-opus-4-6-20260206",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-4-8-fast",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6",
  "claude-sonnet-4-6-20260217",
  "codex-default",
  "codex-mini-latest",
  "gpt-4.1",
  "gpt-5",
  "gpt-5-codex",
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.5",
  "Hy3 preview",
] as const;

function loadManifest(): PricingManifest {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PricingManifest;
}

function defaultGatewayUpstreamModels(): string[] {
  const models = new Set<string>();
  for (const provider of Object.values(defaultProviderGatewaySettings.providers)) {
    for (const upstreamModel of Object.values(provider.modelMappings)) {
      if (upstreamModel.trim()) {
        models.add(upstreamModel.trim());
      }
    }
  }
  return [...models].sort();
}

function pricingModelIds(manifest: PricingManifest): string[] {
  return (manifest.pricing ?? [])
    .map((entry) => (typeof entry.modelId === "string" ? entry.modelId.trim() : ""))
    .filter(Boolean);
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
    const ids = new Set(pricingModelIds(loadManifest()));
    const required = [...REQUIRED_MODEL_IDS, ...defaultGatewayUpstreamModels()];
    const missing = required.filter((modelId) => !ids.has(modelId));
    expect(missing).toEqual([]);
  });
});
