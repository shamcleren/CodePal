import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL_PRICING_REMOTE_URL,
  PRICING_MANIFEST_HASH_KEY,
  syncModelPricingFromRemote,
} from "./modelPricingSync";
import type { ModelPricing } from "../../shared/usageTypes";

function pricingRow(overrides: Partial<ModelPricing> & Pick<ModelPricing, "modelId">): ModelPricing {
  return {
    displayName: overrides.modelId,
    inputPerMillion: "1",
    outputPerMillion: "2",
    cacheReadPerMillion: "0.1",
    cacheCreationPerMillion: "0",
    ...overrides,
  };
}

describe("syncModelPricingFromRemote", () => {
  it("imports current remote pricing rows and records local history snapshots", async () => {
    const upsertModelPricing = vi.fn();
    const upsertModelPricingHistory = vi.fn();
    const setPricingManifestHash = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        updatedAt: "2026-06-10",
        pricing: [
          pricingRow({
            modelId: "claude-sonnet-4-6",
            displayName: "Claude Sonnet 4.6",
            inputPerMillion: "3",
            outputPerMillion: "15",
            cacheReadPerMillion: "0.30",
            cacheCreationPerMillion: "3.75",
          }),
        ],
      }),
    })) as unknown as typeof fetch;

    await expect(
      syncModelPricingFromRemote({
        remoteUrl: DEFAULT_MODEL_PRICING_REMOTE_URL,
        historyStore: {
          getModelPricing: () => [],
          upsertModelPricing,
          upsertModelPricingHistory,
          setPricingManifestHash,
        },
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      ok: true,
      imported: 1,
      historyImported: 1,
      url: "https://shamcleren.github.io/CodePal/model-pricing.json",
    });
    expect(fetchImpl).toHaveBeenCalledWith(DEFAULT_MODEL_PRICING_REMOTE_URL);
    expect(upsertModelPricing).toHaveBeenCalledWith({
      modelId: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      inputPerMillion: "3",
      outputPerMillion: "15",
      cacheReadPerMillion: "0.30",
      cacheCreationPerMillion: "3.75",
      isCurrent: true,
    });
    expect(upsertModelPricingHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "claude-sonnet-4-6",
        effectiveFrom: Date.parse("2026-06-10T00:00:00.000Z"),
        changeKind: "new_model",
        isCurrent: true,
      }),
    );
    expect(setPricingManifestHash).toHaveBeenCalledTimes(1);
    expect(PRICING_MANIFEST_HASH_KEY).toBe("pricing.manifestHash");
  });

  it("skips writes when the remote manifest hash is unchanged and local current rows are complete", async () => {
    const upsertModelPricing = vi.fn();
    const upsertModelPricingHistory = vi.fn();
    const payload = {
      pricing: [pricingRow({ modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6" })],
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    })) as unknown as typeof fetch;

    let storedHash = "";
    const first = await syncModelPricingFromRemote({
      remoteUrl: DEFAULT_MODEL_PRICING_REMOTE_URL,
      historyStore: {
        getModelPricing: () => [],
        upsertModelPricing,
        upsertModelPricingHistory,
        setPricingManifestHash: (hash) => {
          storedHash = hash;
        },
      },
      fetchImpl,
    });
    expect(first.ok).toBe(true);

    await expect(
      syncModelPricingFromRemote({
        remoteUrl: DEFAULT_MODEL_PRICING_REMOTE_URL,
        historyStore: {
          getPricingManifestHash: () => storedHash,
          getModelPricing: () => [{ ...payload.pricing[0], isCurrent: true }],
          upsertModelPricing,
          upsertModelPricingHistory,
        },
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      ok: true,
      imported: 0,
      historyImported: 0,
      unchanged: true,
    });
    expect(upsertModelPricing).toHaveBeenCalledTimes(1);
    expect(upsertModelPricingHistory).toHaveBeenCalledTimes(1);
  });

  it("does not skip unchanged manifest when local current rows are missing", async () => {
    const upsertModelPricing = vi.fn();
    const upsertModelPricingHistory = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        pricing: [pricingRow({ modelId: "claude-fable-5", displayName: "Claude Fable 5" })],
      }),
    })) as unknown as typeof fetch;

    await expect(
      syncModelPricingFromRemote({
        remoteUrl: DEFAULT_MODEL_PRICING_REMOTE_URL,
        historyStore: {
          getPricingManifestHash: () => "already-synced",
          getModelPricing: () => [],
          upsertModelPricing,
          upsertModelPricingHistory,
        },
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      ok: true,
      imported: 1,
      historyImported: 1,
    });
    expect(upsertModelPricing).toHaveBeenCalledWith(expect.objectContaining({ modelId: "claude-fable-5" }));
  });

  it("rejects invalid remote pricing without writing partial rows", async () => {
    const upsertModelPricing = vi.fn();
    const upsertModelPricingHistory = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        pricing: [
          {
            modelId: "broken",
            displayName: "Broken",
            inputPerMillion: "free",
            outputPerMillion: "15",
            cacheReadPerMillion: "0",
            cacheCreationPerMillion: "0",
          },
        ],
      }),
    })) as unknown as typeof fetch;

    await expect(
      syncModelPricingFromRemote({
        remoteUrl: DEFAULT_MODEL_PRICING_REMOTE_URL,
        historyStore: { upsertModelPricing, upsertModelPricingHistory },
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      ok: false,
      imported: 0,
      historyImported: 0,
    });
    expect(upsertModelPricing).not.toHaveBeenCalled();
    expect(upsertModelPricingHistory).not.toHaveBeenCalled();
  });

  it("marks missing local models as non-current and snapshots price changes", async () => {
    const upsertModelPricing = vi.fn();
    const upsertModelPricingHistory = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        updatedAt: "2026-06-10",
        pricing: [
          pricingRow({
            modelId: "deepseek-v4-flash",
            displayName: "DeepSeek V4 Flash",
            inputPerMillion: "3",
            outputPerMillion: "15",
            cacheReadPerMillion: "0.30",
            cacheCreationPerMillion: "3.75",
          }),
        ],
      }),
    })) as unknown as typeof fetch;

    await expect(
      syncModelPricingFromRemote({
        remoteUrl: DEFAULT_MODEL_PRICING_REMOTE_URL,
        historyStore: {
          getModelPricing: () => [
            pricingRow({ modelId: "old-model", displayName: "Old Model", isCurrent: true }),
            pricingRow({
              modelId: "deepseek-v4-flash",
              displayName: "DeepSeek V4 Flash",
              inputPerMillion: "0.10",
              outputPerMillion: "0.20",
              cacheReadPerMillion: "0.001",
              cacheCreationPerMillion: "0",
              isCurrent: true,
            }),
          ],
          upsertModelPricing,
          upsertModelPricingHistory,
        },
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      ok: true,
      imported: 2,
      historyImported: 1,
      url: "https://shamcleren.github.io/CodePal/model-pricing.json",
    });
    expect(upsertModelPricing).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "old-model", isCurrent: false }),
    );
    expect(upsertModelPricingHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "deepseek-v4-flash",
        changeKind: "price_change",
        effectiveFrom: Date.parse("2026-06-10T00:00:00.000Z"),
      }),
    );
  });
});
