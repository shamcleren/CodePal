import { useMemo, useState } from "react";
import type { ModelPricingHistoryEntry } from "../../shared/pricingManifest";
import type { ModelPricing, PricingChangeEvent } from "../../shared/usageTypes";
import type { ResolvedLocale } from "../../shared/i18nTypes";
import { useI18n } from "../i18n";
import { formatUsageCost } from "../usageFormat";

type SortField = "model" | "input" | "output" | "cacheRead" | "cacheWrite";
type SortDirection = "asc" | "desc";

type PricingTableState = {
  field: SortField;
  direction: SortDirection;
};

type PricingVendor = {
  id: string;
  label: string;
};

const VENDOR_LABELS: Record<string, string> = {
  anthropic: "Anthropic / Claude",
  openai: "OpenAI / Codex",
  mimo: "MiMo",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  qwen: "Qwen",
  kimi: "Kimi",
  zhipu: "Zhipu GLM",
  siliconflow: "SiliconFlow",
  openrouter: "OpenRouter",
  other: "Other",
};

function changeKindLabel(
  changeKind: PricingChangeEvent["changeKind"],
  t: (key: string) => string,
): string {
  return t(`tokenStats.pricingTrend.change.${changeKind}`);
}

function formatEventDate(timestamp: number, locale: ResolvedLocale): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

function formatUpdatedAt(value: string | undefined, locale: ResolvedLocale): string {
  if (!value) return "—";
  const parsed = Date.parse(value.includes("T") ? value : `${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function inferVendorId(row: Pick<ModelPricing, "modelId" | "displayName">): string {
  const text = `${row.modelId} ${row.displayName}`.toLowerCase();
  if (text.includes("siliconflow")) return "siliconflow";
  if (text.includes("openrouter")) return "openrouter";
  if (text.includes("claude")) return "anthropic";
  if (text.includes("gpt") || text.includes("codex")) return "openai";
  if (text.includes("mimo")) return "mimo";
  if (text.includes("deepseek")) return "deepseek";
  if (text.includes("minimax")) return "minimax";
  if (text.includes("qwen")) return "qwen";
  if (text.includes("kimi") || text.includes("moonshot")) return "kimi";
  if (text.includes("glm")) return "zhipu";
  return "other";
}

function vendorLabel(vendorId: string): string {
  return VENDOR_LABELS[vendorId] ?? vendorId;
}

function priceValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function priceCell(value: string, locale: ResolvedLocale): string {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;
  return formatUsageCost(parsed, {
    currency: "USD",
    locale,
    minimumFractionDigits: parsed >= 10 ? 0 : 2,
    maximumFractionDigits: parsed >= 10 ? 0 : 2,
  });
}

function sortRows(rows: ModelPricing[], state: PricingTableState): ModelPricing[] {
  const sorted = [...rows];
  const direction = state.direction === "asc" ? 1 : -1;
  sorted.sort((left, right) => {
    switch (state.field) {
      case "model": {
        const leftLabel = left.displayName.toLowerCase();
        const rightLabel = right.displayName.toLowerCase();
        const compare = leftLabel.localeCompare(rightLabel);
        return compare === 0 ? left.modelId.localeCompare(right.modelId) * direction : compare * direction;
      }
      case "input": {
        return (priceValue(left.inputPerMillion) - priceValue(right.inputPerMillion)) * direction;
      }
      case "output": {
        return (priceValue(left.outputPerMillion) - priceValue(right.outputPerMillion)) * direction;
      }
      case "cacheRead": {
        return (priceValue(left.cacheReadPerMillion) - priceValue(right.cacheReadPerMillion)) * direction;
      }
      case "cacheWrite": {
        return (priceValue(left.cacheCreationPerMillion) - priceValue(right.cacheCreationPerMillion)) * direction;
      }
    }
  });
  return sorted;
}

function dedupeAndOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    rows.push(value);
  }
  return rows;
}

function buildVendorOptions(pricing: ModelPricing[]): PricingVendor[] {
  return dedupeAndOrder(pricing.map(inferVendorId))
    .map((id) => ({ id, label: vendorLabel(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getSortIndicator(field: SortField, state: PricingTableState): string {
  if (state.field !== field) {
    return "↕";
  }
  return state.direction === "asc" ? "↑" : "↓";
}

export function ModelPricingTrendChart({
  pricing,
  pricingUpdatedAt,
  pricingHistory,
  pricingChangeEvents,
  rangeStartMs,
  rangeEndMs,
  selectedVendorIds,
  onSelectedVendorIdsChange,
  sortField,
  sortDirection,
  onSortChange,
}: {
  pricing: ModelPricing[];
  pricingUpdatedAt?: string;
  pricingHistory: ModelPricingHistoryEntry[];
  pricingChangeEvents: PricingChangeEvent[];
  rangeStartMs: number;
  rangeEndMs: number;
  selectedVendorIds: string[];
  onSelectedVendorIdsChange: (vendorIds: string[]) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
}) {
  const i18n = useI18n();
  const [historyModelId, setHistoryModelId] = useState<string | null>(null);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [draftVendorFilter, setDraftVendorFilter] = useState<string[]>([]);
  const sortState: PricingTableState = { field: sortField, direction: sortDirection };
  const currentPricing = useMemo(() => pricing.filter((row) => row.isCurrent !== false), [pricing]);
  const vendorOptions = useMemo(() => buildVendorOptions(currentPricing), [currentPricing]);
  const vendorOptionIds = useMemo(() => vendorOptions.map((vendor) => vendor.id), [vendorOptions]);
  const vendorOptionSet = useMemo(() => new Set(vendorOptionIds), [vendorOptionIds]);

  const normalizedSelectedVendorIds = useMemo(() => {
    if (selectedVendorIds.length === 0) {
      return [];
    }
    const normalized = dedupeAndOrder(selectedVendorIds);
    return vendorOptionIds.length === 0 ? normalized : normalized.filter((id) => vendorOptionSet.has(id));
  }, [selectedVendorIds, vendorOptionIds, vendorOptionSet]);

  const isAllVendorsSelected = normalizedSelectedVendorIds.length === 0;
  const visibleVendorIds = useMemo(() => {
    return normalizedSelectedVendorIds.length === 0 ? vendorOptionIds : normalizedSelectedVendorIds;
  }, [vendorOptionIds, normalizedSelectedVendorIds]);

  const visibleVendorSet = useMemo(() => new Set(visibleVendorIds), [visibleVendorIds]);
  const selectedVendorsLabel = isAllVendorsSelected
    ? i18n.t("tokenStats.pricingFilter.allVendors")
    : i18n.t("tokenStats.pricingFilter.selected", {
      selected: normalizedSelectedVendorIds.length,
      total: vendorOptionIds.length,
    });
  const draftSelectedSet = useMemo(() => new Set(draftVendorFilter), [draftVendorFilter]);

  const currentRows = useMemo(() => {
    const filtered = isAllVendorsSelected
      ? currentPricing
      : currentPricing.filter((row) => visibleVendorSet.has(inferVendorId(row)));
    return sortRows(filtered, sortState);
  }, [currentPricing, isAllVendorsSelected, visibleVendorSet, sortState]);

  const selectedHistoryPricing = useMemo(
    () => pricing.find((row) => row.modelId === historyModelId) ?? null,
    [historyModelId, pricing],
  );
  const selectedHistoryRows = useMemo(
    () =>
      pricingHistory
        .filter((row) => row.modelId === historyModelId)
        .sort((a, b) => b.effectiveFrom - a.effectiveFrom),
    [historyModelId, pricingHistory],
  );

  const visibleEvents = useMemo(
    () =>
      pricingChangeEvents.filter(
        (event) =>
          event.modelId === historyModelId &&
          event.effectiveFrom >= rangeStartMs &&
          event.effectiveFrom <= rangeEndMs,
      ),
    [historyModelId, pricingChangeEvents, rangeEndMs, rangeStartMs],
  );

  const onSort = (field: SortField) => {
    const nextDirection: SortDirection = sortField === field && sortDirection === "asc" ? "desc" : "asc";
    onSortChange(field, nextDirection);
  };

  const openModelFilterDialog = () => {
    setDraftVendorFilter(isAllVendorsSelected ? vendorOptionIds.slice() : normalizedSelectedVendorIds.slice());
    setIsFilterDialogOpen(true);
  };

  const closeModelFilterDialog = () => {
    setIsFilterDialogOpen(false);
  };

  const applyModelFilter = () => {
    const nextSelected = draftVendorFilter.length === vendorOptionIds.length ? [] : draftVendorFilter;
    onSelectedVendorIdsChange(nextSelected);
    setIsFilterDialogOpen(false);
  };

  const selectAllModelFilters = () => {
    setDraftVendorFilter(vendorOptionIds.slice());
  };

  const clearModelFilters = () => {
    setDraftVendorFilter([]);
  };

  const invertModelFilters = () => {
    const next = new Set(draftVendorFilter);
    for (const vendorId of vendorOptionIds) {
      if (next.has(vendorId)) {
        next.delete(vendorId);
      } else {
        next.add(vendorId);
      }
    }
    setDraftVendorFilter(Array.from(next));
  };

  const toggleDraftModelFilter = (vendorId: string) => {
    const next = new Set(draftSelectedSet);
    if (next.has(vendorId)) {
      next.delete(vendorId);
    } else {
      next.add(vendorId);
    }
    setDraftVendorFilter(vendorOptionIds.filter((id) => next.has(id)));
  };

  if (pricing.length === 0) {
    return (
      <div className="pricing-trend">
        <div className="pricing-trend__table-header">
          <div>
            <div className="analytics-page__section-title">{i18n.t("tokenStats.pricingTable.sectionTitle")}</div>
            <div className="analytics-page__subtitle">{i18n.t("tokenStats.pricingTrend.subtitle")}</div>
          </div>
        </div>
        <div className="pricing-trend__empty">{i18n.t("tokenStats.pricingTrend.empty")}</div>
      </div>
    );
  }

  return (
    <div className="pricing-trend">
      <div className="analytics-page__section-header">
        <div>
          <div className="analytics-page__section-title">{i18n.t("tokenStats.pricingTable.sectionTitle")}</div>
          <div className="analytics-page__subtitle">{i18n.t("tokenStats.pricingTrend.subtitle")}</div>
        </div>
      </div>
      <div className="pricing-trend__controls">
        <button
          type="button"
          className="pricing-trend__filter-button"
          onClick={openModelFilterDialog}
          disabled={vendorOptions.length === 0}
        >
          <span>{i18n.t("tokenStats.pricingFilter.title")}</span>
          <span className="pricing-trend__filter-button-count">{selectedVendorsLabel}</span>
        </button>
      </div>
      {isFilterDialogOpen ? (
        <div className="pricing-trend__filter-backdrop" onClick={closeModelFilterDialog}>
          <div className="pricing-trend__filter-modal" onClick={(event) => event.stopPropagation()}>
            <div className="pricing-trend__filter-modal-header">
              <div className="pricing-trend__filter-modal-title">
                {i18n.t("tokenStats.pricingFilter.title")}
              </div>
              <button
                type="button"
                className="pricing-trend__filter-modal-close"
                onClick={closeModelFilterDialog}
                aria-label={i18n.t("common.cancel")}
              >
                ×
              </button>
            </div>
            <div className="pricing-trend__filter-modal-summary">
              {selectedVendorsLabel}
            </div>
            <div className="pricing-trend__filter-list">
              {vendorOptions.length > 0 ? (
                vendorOptions.map((vendor) => (
                  <label key={vendor.id} className="pricing-trend__filter-list-item">
                    <input
                      type="checkbox"
                      checked={draftSelectedSet.has(vendor.id)}
                      onChange={() => toggleDraftModelFilter(vendor.id)}
                    />
                    <span>{vendor.label}</span>
                  </label>
                ))
              ) : (
                <div className="pricing-trend__empty">{i18n.t("tokenStats.pricingTrend.empty")}</div>
              )}
            </div>
            <div className="pricing-trend__filter-modal-actions">
              <button type="button" className="analytics-page__filter-chip" onClick={selectAllModelFilters}>
                {i18n.t("tokenStats.pricingFilter.selectAll")}
              </button>
              <button type="button" className="analytics-page__filter-chip" onClick={clearModelFilters}>
                {i18n.t("tokenStats.pricingFilter.clear")}
              </button>
              <button type="button" className="analytics-page__filter-chip" onClick={invertModelFilters}>
                {i18n.t("tokenStats.pricingFilter.invert")}
              </button>
              <button type="button" className="pricing-trend__history-toggle" onClick={closeModelFilterDialog}>
                {i18n.t("common.cancel")}
              </button>
              <button type="button" className="pricing-trend__history-toggle" onClick={applyModelFilter}>
                {i18n.t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {historyModelId ? (
        <div className="pricing-trend__filter-backdrop" onClick={() => setHistoryModelId(null)}>
          <div className="pricing-trend__history-modal" onClick={(event) => event.stopPropagation()}>
            <div className="pricing-trend__filter-modal-header">
              <div>
                <div className="pricing-trend__filter-modal-title">
                  {i18n.t("tokenStats.pricingTable.historyTitle")}
                </div>
                <div className="pricing-trend__modal-subtitle">
                  {selectedHistoryPricing?.displayName ?? historyModelId}
                </div>
              </div>
              <button
                type="button"
                className="pricing-trend__filter-modal-close"
                onClick={() => setHistoryModelId(null)}
                aria-label={i18n.t("common.cancel")}
              >
                ×
              </button>
            </div>
            <div className="pricing-trend__history-wrap">
              {selectedHistoryRows.length > 0 ? (
                <table className="pricing-trend__history-table">
                  <thead>
                    <tr>
                      <th>{i18n.t("tokenStats.pricingTable.effectiveFrom")}</th>
                      <th>{i18n.t("tokenStats.pricingTable.model")}</th>
                      <th>{i18n.t("tokenStats.pricingTrend.priceType.input")}</th>
                      <th>{i18n.t("tokenStats.pricingTrend.priceType.output")}</th>
                      <th>{i18n.t("tokenStats.pricingTrend.priceType.cacheRead")}</th>
                      <th>{i18n.t("tokenStats.pricingTrend.priceType.cacheWrite")}</th>
                      <th>{i18n.t("tokenStats.pricingTrend.events")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedHistoryRows.map((historyRow) => (
                      <tr key={`${historyRow.modelId}-${historyRow.effectiveFrom}`}>
                        <td>
                          {historyRow.effectiveFrom === 0
                            ? "—"
                            : formatEventDate(historyRow.effectiveFrom, i18n.locale)}
                        </td>
                        <td title={historyRow.modelId}>{historyRow.displayName}</td>
                        <td>{priceCell(historyRow.inputPerMillion, i18n.locale)}</td>
                        <td>{priceCell(historyRow.outputPerMillion, i18n.locale)}</td>
                        <td>{priceCell(historyRow.cacheReadPerMillion, i18n.locale)}</td>
                        <td>{priceCell(historyRow.cacheCreationPerMillion, i18n.locale)}</td>
                        <td>{historyRow.changeKind ? changeKindLabel(historyRow.changeKind, i18n.t) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="pricing-trend__empty">{i18n.t("tokenStats.pricingTrend.empty")}</div>
              )}
            </div>
            {visibleEvents.length > 0 ? (
              <div className="pricing-trend__events pricing-trend__events--modal">
                <div className="pricing-trend__events-title">{i18n.t("tokenStats.pricingTrend.events")}</div>
                <ul className="pricing-trend__events-list">
                  {visibleEvents.map((event) => (
                    <li key={`${event.modelId}-${event.effectiveFrom}`} className="pricing-trend__event">
                      <span className="pricing-trend__event-date">
                        {formatEventDate(event.effectiveFrom, i18n.locale)}
                      </span>
                      <span className="pricing-trend__event-kind">{changeKindLabel(event.changeKind, i18n.t)}</span>
                      <span className="pricing-trend__event-model">{event.displayName}</span>
                      <span className="pricing-trend__event-price">
                        {formatUsageCost(Number.parseFloat(event.inputPerMillion), {
                          currency: "USD",
                          locale: i18n.locale,
                          maximumFractionDigits: 2,
                        })}
                        {" / "}
                        {formatUsageCost(Number.parseFloat(event.outputPerMillion), {
                          currency: "USD",
                          locale: i18n.locale,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {event.note ? <span className="pricing-trend__event-note">{event.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="pricing-trend__current-table-wrap">
        <div className="pricing-trend__table-header">
          <div className="pricing-trend__events-title">{i18n.t("tokenStats.pricingTable.title")}</div>
          <div className="pricing-trend__updated-at">
            {i18n.t("tokenStats.pricingTable.updatedAt", {
              date: formatUpdatedAt(pricingUpdatedAt, i18n.locale),
            })}
          </div>
        </div>
        <table className="pricing-trend__current-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="pricing-trend__sort" onClick={() => onSort("model")}>
                  {i18n.t("tokenStats.pricingTable.model")}
                  <span className="pricing-trend__sort-indicator">{getSortIndicator("model", sortState)}</span>
                </button>
              </th>
              <th>
                <button type="button" className="pricing-trend__sort" onClick={() => onSort("input")}>
                  {i18n.t("tokenStats.pricingTrend.priceType.input")}
                  <span className="pricing-trend__sort-indicator">{getSortIndicator("input", sortState)}</span>
                </button>
              </th>
              <th>
                <button type="button" className="pricing-trend__sort" onClick={() => onSort("output")}>
                  {i18n.t("tokenStats.pricingTrend.priceType.output")}
                  <span className="pricing-trend__sort-indicator">{getSortIndicator("output", sortState)}</span>
                </button>
              </th>
              <th>
                <button type="button" className="pricing-trend__sort" onClick={() => onSort("cacheRead")}>
                  {i18n.t("tokenStats.pricingTrend.priceType.cacheRead")}
                  <span className="pricing-trend__sort-indicator">{getSortIndicator("cacheRead", sortState)}</span>
                </button>
              </th>
              <th>
                <button type="button" className="pricing-trend__sort" onClick={() => onSort("cacheWrite")}>
                  {i18n.t("tokenStats.pricingTrend.priceType.cacheWrite")}
                  <span className="pricing-trend__sort-indicator">{getSortIndicator("cacheWrite", sortState)}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row) => (
              <tr key={row.modelId} className="pricing-trend__current-table-row">
                <td title={row.modelId}>
                  <button
                    type="button"
                    className="pricing-trend__model-link"
                    onClick={() => setHistoryModelId(row.modelId)}
                  >
                    {row.displayName}
                  </button>
                </td>
                <td>{priceCell(row.inputPerMillion, i18n.locale)}</td>
                <td>{priceCell(row.outputPerMillion, i18n.locale)}</td>
                <td>{priceCell(row.cacheReadPerMillion, i18n.locale)}</td>
                <td>{priceCell(row.cacheCreationPerMillion, i18n.locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
