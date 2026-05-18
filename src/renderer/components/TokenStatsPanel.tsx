import { useCallback, useEffect, useState } from "react";
import type { DailyTokenStats, ModelTokenStats, ModelPricing, TokenStatsResult } from "../../shared/usageTypes";
import { useI18n } from "../i18n";
import { buildTokenReport } from "../tokenReport";

type RangePreset = "today" | "7d" | "30d";

function resolveRange(preset: RangePreset): { start: number; end: number } {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today":
      return { start: startOfDay.getTime(), end: now };
    case "7d":
      return { start: now - 7 * 24 * 60 * 60 * 1000, end: now };
    case "30d":
      return { start: now - 30 * 24 * 60 * 60 * 1000, end: now };
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function estimateCost(
  stats: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number },
  pricingMap: Map<string, ModelPricing>,
  model?: string,
): number {
  const pricing = (model ? pricingMap.get(model) : null) ?? pricingMap.get("claude-sonnet-4-5-20250929");
  if (!pricing) return 0;
  const inputCost = (stats.inputTokens / 1_000_000) * Number(pricing.inputPerMillion);
  const outputCost = (stats.outputTokens / 1_000_000) * Number(pricing.outputPerMillion);
  const cacheReadCost = (stats.cacheReadTokens / 1_000_000) * Number(pricing.cacheReadPerMillion);
  const cacheCreationCost = (stats.cacheCreationTokens / 1_000_000) * Number(pricing.cacheCreationPerMillion);
  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}

export function TokenStatsPanel() {
  const i18n = useI18n();
  const [range, setRange] = useState<RangePreset>("7d");
  const [data, setData] = useState<TokenStatsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);

  const fetchData = useCallback(async (preset: RangePreset) => {
    setLoading(true);
    try {
      const { start, end } = resolveRange(preset);
      const result = await window.codepal.getTokenStats(start, end);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(range);
  }, [range, fetchData]);

  const handleGenerateReport = useCallback(async () => {
    const { start, end } = resolveRange(range);
    const startDate = new Date(start).toISOString().slice(0, 10);
    const endDate = new Date(end).toISOString().slice(0, 10);
    const [tokenResult, sessionStats] = await Promise.all([
      window.codepal.getTokenStats(start, end),
      window.codepal.getSessionStats(start, end),
    ]);
    const report = buildTokenReport({
      rangeLabel: range,
      startDate,
      endDate,
      sessionStats,
      daily: tokenResult.daily,
      byModel: tokenResult.byModel,
      pricing: tokenResult.pricing,
    });
    await window.codepal.writeClipboardText(report);
    setReportCopied(true);
    window.setTimeout(() => setReportCopied(false), 1500);
  }, [range]);

  const pricingMap = new Map<string, ModelPricing>();
  for (const p of data?.pricing ?? []) {
    pricingMap.set(p.modelId, p);
  }

  // Aggregate totals
  const totalInput = (data?.daily ?? []).reduce((s, d) => s + d.inputTokens, 0);
  const totalOutput = (data?.daily ?? []).reduce((s, d) => s + d.outputTokens, 0);
  const totalCacheRead = (data?.daily ?? []).reduce((s, d) => s + d.cacheReadTokens, 0);
  const totalCacheCreation = (data?.daily ?? []).reduce((s, d) => s + d.cacheCreationTokens, 0);
  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheCreation;
  const totalRequests = (data?.daily ?? []).reduce((s, d) => s + d.requestCount, 0);
  const cacheHitRate = totalCacheRead + totalInput > 0
    ? totalCacheRead / (totalCacheRead + totalInput + totalCacheCreation)
    : 0;

  // Estimate total cost from per-model data
  const totalCost = (data?.byModel ?? []).reduce((s, m) => {
    return s + estimateCost(m, pricingMap, m.model);
  }, 0);

  // Build daily chart data grouped by date
  const dailyByDate = new Map<string, { input: number; output: number; cache: number }>();
  for (const d of data?.daily ?? []) {
    const existing = dailyByDate.get(d.date) ?? { input: 0, output: 0, cache: 0 };
    existing.input += d.inputTokens;
    existing.output += d.outputTokens;
    existing.cache += d.cacheReadTokens;
    dailyByDate.set(d.date, existing);
  }
  const dailyEntries = Array.from(dailyByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDailyTokens = Math.max(1, ...dailyEntries.map(([, v]) => v.input + v.output + v.cache));

  const rangeButtons: Array<{ key: RangePreset; label: string }> = [
    { key: "today", label: i18n.t("tokenStats.range.today") },
    { key: "7d", label: i18n.t("tokenStats.range.7d") },
    { key: "30d", label: i18n.t("tokenStats.range.30d") },
  ];

  return (
    <div className="display-panel__subsection-block" aria-label={i18n.t("tokenStats.title")}>
      <div className="display-panel__header">
        <div className="display-panel__title">{i18n.t("tokenStats.title")}</div>
        <div className="display-panel__subtitle">{i18n.t("tokenStats.subtitle")}</div>
      </div>

      {/* Range selector */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
        {rangeButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setRange(btn.key)}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: range === btn.key ? 600 : 400,
              background: range === btn.key ? "var(--color-primary, #6366f1)" : "var(--color-surface-secondary, #f3f4f6)",
              color: range === btn.key ? "#fff" : "var(--color-text-secondary, #6b7280)",
            }}
          >
            {btn.label}
          </button>
        ))}
        <button
          onClick={() => void fetchData(range)}
          disabled={loading}
          style={{
            padding: "4px 8px",
            borderRadius: "6px",
            border: "none",
            cursor: loading ? "default" : "pointer",
            fontSize: "12px",
            background: "var(--color-surface-secondary, #f3f4f6)",
            color: "var(--color-text-secondary, #6b7280)",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "..." : "↻"}
        </button>
        <button
          onClick={() => void handleGenerateReport()}
          style={{
            padding: "4px 10px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 500,
            background: "var(--color-surface-secondary, #f3f4f6)",
            color: reportCopied ? "var(--color-success, #10b981)" : "var(--color-text-secondary, #6b7280)",
          }}
        >
          {reportCopied ? i18n.t("tokenStats.reportCopied") : i18n.t("tokenStats.generateReport")}
        </button>
      </div>

      {/* Hero stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        <HeroCard label={i18n.t("tokenStats.totalTokens")} value={formatTokens(totalTokens)} />
        <HeroCard label={i18n.t("tokenStats.requests")} value={String(totalRequests)} />
        <HeroCard label={i18n.t("tokenStats.input")} value={formatTokens(totalInput)} />
        <HeroCard label={i18n.t("tokenStats.output")} value={formatTokens(totalOutput)} />
        <HeroCard label={i18n.t("tokenStats.cacheHit")} value={`${Math.round(cacheHitRate * 100)}%`} />
        <HeroCard label={i18n.t("tokenStats.estimatedCost")} value={formatCost(totalCost)} />
      </div>

      {/* Daily trend bar chart */}
      {dailyEntries.length > 0 ? (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "var(--color-text-secondary, #6b7280)" }}>
            {i18n.t("tokenStats.dailyTrend")}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "3px",
              height: "80px",
              padding: "0 2px",
            }}
          >
            {dailyEntries.map(([date, vals]) => {
              const total = vals.input + vals.output + vals.cache;
              const heightPct = (total / maxDailyTokens) * 100;
              return (
                <div
                  key={date}
                  title={`${date}\n${i18n.t("tokenStats.input")}: ${formatTokens(vals.input)}\n${i18n.t("tokenStats.output")}: ${formatTokens(vals.output)}\n${i18n.t("tokenStats.cache")}: ${formatTokens(vals.cache)}`}
                  style={{
                    flex: 1,
                    minWidth: "8px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      height: `${Math.max(2, heightPct)}%`,
                      borderRadius: "2px 2px 0 0",
                      background: "var(--color-primary, #6366f1)",
                      opacity: 0.8,
                    }}
                  />
                  <div
                    style={{
                      fontSize: "9px",
                      textAlign: "center",
                      color: "var(--color-text-tertiary, #9ca3af)",
                      marginTop: "2px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Model breakdown table */}
      {(data?.byModel ?? []).length > 0 ? (
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "var(--color-text-secondary, #6b7280)" }}>
            {i18n.t("tokenStats.byModel")}
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>{i18n.t("tokenStats.model")}</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>{i18n.t("tokenStats.requests")}</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>{i18n.t("tokenStats.input")}</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>{i18n.t("tokenStats.output")}</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>{i18n.t("tokenStats.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byModel ?? []).map((m) => (
                <tr key={`${m.agent}-${m.model}`} style={{ borderBottom: "1px solid var(--color-border-light, #f3f4f6)" }}>
                  <td style={{ padding: "4px 8px" }}>
                    <span style={{ opacity: 0.6, marginRight: "4px" }}>{m.agent}</span>
                    {m.model}
                  </td>
                  <td style={{ textAlign: "right", padding: "4px 8px" }}>{m.requestCount}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px" }}>{formatTokens(m.inputTokens)}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px" }}>{formatTokens(m.outputTokens)}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px" }}>
                    {formatCost(estimateCost(m, pricingMap, m.model))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {totalTokens === 0 && !loading ? (
        <div style={{ fontSize: "12px", color: "var(--color-text-tertiary, #9ca3af)", padding: "8px 0" }}>
          {i18n.t("tokenStats.empty")}
        </div>
      ) : null}
    </div>
  );
}

function HeroCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: "8px",
        background: "var(--color-surface-secondary, #f9fafb)",
      }}
    >
      <div style={{ fontSize: "11px", color: "var(--color-text-tertiary, #9ca3af)", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
