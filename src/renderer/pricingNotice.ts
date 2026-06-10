import type { PricingChangeEvent } from "../shared/pricingHistory";

export function formatPricingChangeNotice(
  events: PricingChangeEvent[],
  t: (key: string, params?: Record<string, string | number | boolean | undefined>) => string,
): string | null {
  if (events.length === 0) return null;
  const newest = events[events.length - 1];
  if (events.length === 1) {
    if (newest.changeKind === "new_model") {
      return t("tokenStats.pricingNotice.newModel", { model: newest.displayName });
    }
    if (newest.changeKind === "price_change") {
      return t("tokenStats.pricingNotice.priceChange", { model: newest.displayName });
    }
  }
  return t("tokenStats.pricingNotice.multiple", { count: events.length });
}
