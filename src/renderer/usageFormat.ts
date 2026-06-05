import type { AnalyticsMetric, TokenTrendPoint } from "../shared/analyticsTypes";
import type { ModelPricing, UsageCost } from "../shared/usageTypes";
import type { ResolvedLocale } from "../shared/i18nTypes";
import {
  estimateTokenCost as estimateSharedTokenCost,
  type TokenCostInput,
} from "../shared/modelPricing";

export type UsageCostKind = "reported" | "estimated";

export type SelectedUsageCost = {
  amount: number;
  kind: UsageCostKind;
  currency?: string;
};

export type { TokenCostInput };

export function formatUsageTokens(value: number, locale: ResolvedLocale): string {
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) {
    return `${formatCompactUnit(value / 1_000_000, locale, 1)}M`;
  }
  if (absValue >= 10_000) {
    return `${formatCompactUnit(value / 1_000, locale, 0)}K`;
  }
  if (absValue >= 1_000) {
    return `${formatCompactUnit(value / 1_000, locale, 1)}K`;
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatUsageCost(
  value: number,
  options: {
    locale: ResolvedLocale;
    currency?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  },
): string {
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const formatterOptions: Intl.NumberFormatOptions = {
    minimumFractionDigits,
    maximumFractionDigits,
  };
  if (options.currency) {
    formatterOptions.style = "currency";
    formatterOptions.currency = options.currency;
  }

  const formatter = new Intl.NumberFormat(options.locale, formatterOptions);
  if (value > 0 && value < 0.01 && maximumFractionDigits >= 2) {
    return `<${formatter.format(0.01)}`;
  }
  return formatter.format(value);
}

export function formatMetricValue(
  value: number,
  metric: AnalyticsMetric,
  locale: ResolvedLocale,
): string {
  if (metric === "cost") {
    const fractionDigits = value >= 10 ? 0 : 2;
    return formatUsageCost(value, {
      currency: "USD",
      locale,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }
  if (metric === "cacheHit") {
    return `${Math.round(value)}%`;
  }
  return formatUsageTokens(Math.round(value), locale);
}

export function selectUsageCost(cost: UsageCost | null | undefined): SelectedUsageCost | null {
  if (!cost) return null;
  if (typeof cost.reported === "number" && Number.isFinite(cost.reported)) {
    return { amount: cost.reported, kind: "reported", ...(cost.currency ? { currency: cost.currency } : {}) };
  }
  if (typeof cost.estimated === "number" && Number.isFinite(cost.estimated)) {
    return { amount: cost.estimated, kind: "estimated", ...(cost.currency ? { currency: cost.currency } : {}) };
  }
  return null;
}

export function estimateTokenCost(
  tokens: TokenCostInput,
  pricing: ModelPricing[],
  options: { allowModelFallback?: boolean } = {},
): number | undefined {
  return estimateSharedTokenCost(tokens, pricing, options);
}

export function estimateTrendPointCost(
  point: TokenTrendPoint,
  pricing: ModelPricing[],
): number | undefined {
  return estimateTokenCost(
    {
      agent: point.agent,
      model: point.model,
      inputTokens: point.inputTokens,
      outputTokens: point.outputTokens,
      cacheReadTokens: point.cacheReadTokens,
      cacheCreationTokens: point.cacheCreationTokens,
    },
    pricing,
    { allowModelFallback: false },
  );
}

function formatCompactUnit(value: number, locale: ResolvedLocale, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
  }).format(value);
}
