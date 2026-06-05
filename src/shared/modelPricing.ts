import type { ModelPricing } from "./usageTypes";

export type TokenCostInput = {
  agent?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export type PricingMatchSource = "exact" | "normalized" | "contained" | "fallback";

export type PricingMatch = {
  pricing: ModelPricing;
  source: PricingMatchSource;
};

export function estimateTokenCost(
  tokens: TokenCostInput,
  pricing: ModelPricing[],
  options: { allowModelFallback?: boolean } = {},
): number | undefined {
  const match = resolveModelPricing(tokens, pricing, options);
  if (!match) return undefined;
  const inputPerMillion = parsePricePerMillion(match.pricing.inputPerMillion);
  const outputPerMillion = parsePricePerMillion(match.pricing.outputPerMillion);
  const cacheReadPerMillion = parsePricePerMillion(match.pricing.cacheReadPerMillion);
  const cacheCreationPerMillion = parsePricePerMillion(match.pricing.cacheCreationPerMillion);
  if (
    inputPerMillion === null ||
    outputPerMillion === null ||
    cacheReadPerMillion === null ||
    cacheCreationPerMillion === null
  ) {
    return undefined;
  }

  const cost =
    (tokens.inputTokens / 1_000_000) * inputPerMillion +
    (tokens.outputTokens / 1_000_000) * outputPerMillion +
    (tokens.cacheReadTokens / 1_000_000) * cacheReadPerMillion +
    (tokens.cacheCreationTokens / 1_000_000) * cacheCreationPerMillion;
  return cost > 0 ? cost : undefined;
}

export function resolveModelPricing(
  tokens: Pick<TokenCostInput, "agent" | "model">,
  pricing: ModelPricing[],
  options: { allowModelFallback?: boolean } = {},
): PricingMatch | undefined {
  const candidates = pricingCandidates(tokens, options);
  for (const candidate of candidates) {
    const exactMatch = pricing.find(
      (price) =>
        normalizedModelText(price.modelId) === candidate.normalized ||
        normalizedModelText(price.displayName) === candidate.normalized,
    );
    if (exactMatch) {
      return { pricing: exactMatch, source: candidate.fallback ? "fallback" : "exact" };
    }

    const canonical = canonicalModelKey(candidate.value);
    if (canonical) {
      const normalizedMatch = pricing
        .filter((price) =>
          canonicalModelKey(price.modelId) === canonical ||
          canonicalModelKey(price.displayName) === canonical,
        )
        .sort((a, b) => b.modelId.length - a.modelId.length)[0];
      if (normalizedMatch) {
        return { pricing: normalizedMatch, source: candidate.fallback ? "fallback" : "normalized" };
      }
    }

    const containedMatch = pricing
      .filter((price) => {
        const modelId = normalizedModelText(price.modelId);
        const displayName = normalizedModelText(price.displayName);
        return candidate.normalized.includes(modelId) || candidate.normalized.includes(displayName);
      })
      .sort((a, b) => b.modelId.length - a.modelId.length)[0];
    if (containedMatch) {
      return { pricing: containedMatch, source: candidate.fallback ? "fallback" : "contained" };
    }
  }
  return undefined;
}

export function fallbackModelForAgent(agent: string | undefined): string | undefined {
  if (agent === "codex") return "codex-default";
  if (agent === "claude") return "claude-sonnet-4-5-20250929";
  return undefined;
}

function pricingCandidates(
  tokens: Pick<TokenCostInput, "agent" | "model">,
  options: { allowModelFallback?: boolean },
): Array<{ value: string; normalized: string; fallback: boolean }> {
  const normalizedModel = tokens.model?.trim();
  const values = [
    {
      value: normalizedModel && normalizedModel.toLowerCase() !== "unknown" ? normalizedModel : "",
      fallback: false,
    },
    {
      value: options.allowModelFallback === false ? "" : fallbackModelForAgent(tokens.agent) ?? "",
      fallback: true,
    },
  ].filter((candidate) => candidate.value.length > 0);

  return values.map((candidate) => ({
    ...candidate,
    normalized: normalizedModelText(candidate.value),
  }));
}

function parsePricePerMillion(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizedModelText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[/_.\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function canonicalModelKey(value: string): string | undefined {
  const normalized = normalizedModelText(value);
  const fastSuffix = /(?:^|-)fast(?:-|$)/.test(normalized) ? "-fast" : "";

  const claudeFamily = normalized.match(/(?:^|-)(?:claude-)?(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
  if (claudeFamily) {
    const [, family, major, rawMinor] = claudeFamily;
    const minor = rawMinor && rawMinor.length <= 2 ? `-${rawMinor}` : "";
    return `claude-${family}-${major}${minor}${fastSuffix}`;
  }

  const claudeLegacy = normalized.match(/(?:^|-)claude-(\d+)-(\d+)-(opus|sonnet|haiku)(?:-|$)/);
  if (claudeLegacy) {
    const [, major, minor, family] = claudeLegacy;
    return `claude-${family}-${major}-${minor}${fastSuffix}`;
  }

  return undefined;
}
