import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL_PRICING_REMOTE_URL,
  syncModelPricingFromRemote,
} from "./modelPricingSync";

describe("syncModelPricingFromRemote", () => {
  it("imports remote pricing rows from the default GitHub Pages URL", async () => {
    const upsertModelPricing = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        pricing: [
          {
            modelId: "claude-sonnet-4-6",
            displayName: "Claude Sonnet 4.6",
            inputPerMillion: "3",
            outputPerMillion: "15",
            cacheReadPerMillion: "0.30",
            cacheCreationPerMillion: "3.75",
          },
        ],
      }),
    })) as unknown as typeof fetch;

    await expect(
      syncModelPricingFromRemote({
        remoteUrl: DEFAULT_MODEL_PRICING_REMOTE_URL,
        historyStore: { upsertModelPricing },
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: true,
      imported: 1,
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
    });
  });

  it("rejects invalid remote pricing without writing partial rows", async () => {
    const upsertModelPricing = vi.fn();
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
        historyStore: { upsertModelPricing },
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      ok: false,
      imported: 0,
    });
    expect(upsertModelPricing).not.toHaveBeenCalled();
  });
});
