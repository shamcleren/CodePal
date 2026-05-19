import { useCallback, useEffect, useState } from "react";
import type { ModelPricing, TokenStatsResult } from "../../shared/usageTypes";
import { useI18n } from "../i18n";

type RangePreset = "today" | "7d" | "30d" | "custom";
type BreakdownMode = "model" | "agent";

const AGENT_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  codebuddy: "CodeBuddy",
  cursor: "Cursor",
  goland: "GoLand",
  pycharm: "PyCharm",
};

function resolveRange(preset: RangePreset, customStart?: string, customEnd?: string): { start: number; end: number } {
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
    case "custom": {
      const start = customStart ? new Date(customStart + "T00:00:00").getTime() : startOfDay.getTime();
      const end = customEnd ? new Date(customEnd + "T23:59:59").getTime() : now;
      return { start, end };
    }
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

function agentLabel(agent: string): string {
  return AGENT_LABELS[agent] ?? agent;
}

function estimateCost(
  stats: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number },
  pricingMap: Map<string, ModelPricing>,
  model?: string,
): number {
  const pricing = (model ? pricingMap.get(model) : null) ?? pricingMap.get("claude-sonnet-4-5-20250929");
  if (!pricing) return 0;
  return (
    (stats.inputTokens / 1_000_000) * Number(pricing.inputPerMillion) +
    (stats.outputTokens / 1_000_000) * Number(pricing.outputPerMillion) +
    (stats.cacheReadTokens / 1_000_000) * Number(pricing.cacheReadPerMillion) +
    (stats.cacheCreationTokens / 1_000_000) * Number(pricing.cacheCreationPerMillion)
  );
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function AnalyticsPage() {
  const i18n = useI18n();
  const [range, setRange] = useState<RangePreset>("7d");
  const [customStart, setCustomStart] = useState(weekAgoStr());
  const [customEnd, setCustomEnd] = useState(todayStr());
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>("model");
  const [data, setData] = useState<TokenStatsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (preset: RangePreset) => {
    setLoading(true);
    try {
      const { start, end } = resolveRange(preset, customStart, customEnd);
      const result = await window.codepal.getTokenStats(start, end);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [customStart, customEnd]);

  useEffect(() => {
    void fetchData(range);
  }, [range, fetchData]);

  const handleOpenReport = useCallback(async () => {
    const { start, end } = resolveRange(range, customStart, customEnd);
    const filePath = await window.codepal.generateHtmlReport(start, end);
    await window.codepal.openExternalTarget(filePath);
  }, [range, customStart, customEnd]);

  const pricingMap = new Map<string, ModelPricing>();
  for (const p of data?.pricing ?? []) {
    pricingMap.set(p.modelId, p);
  }

  const totalInput = (data?.daily ?? []).reduce((s, d) => s + d.inputTokens, 0);
  const totalOutput = (data?.daily ?? []).reduce((s, d) => s + d.outputTokens, 0);
  const totalCacheRead = (data?.daily ?? []).reduce((s, d) => s + d.cacheReadTokens, 0);
  const totalCacheCreation = (data?.daily ?? []).reduce((s, d) => s + d.cacheCreationTokens, 0);
  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheCreation;
  const totalRequests = (data?.daily ?? []).reduce((s, d) => s + d.requestCount, 0);
  const cacheHitRate = totalCacheRead + totalInput > 0
    ? totalCacheRead / (totalCacheRead + totalInput + totalCacheCreation)
    : 0;
  const totalCost = (data?.byModel ?? []).reduce((s, m) => s + estimateCost(m, pricingMap, m.model), 0);
  const topAgent = data?.byAgent?.[0];
  const topModel = data?.byModel?.[0];
  const importStatus = data?.importStatus;
  const importSummary = importStatus?.completedAt
    ? i18n.t("tokenStats.backfillSummary", {
        claude: importStatus.claudeRowsImported,
        codex: importStatus.codexRowsImported,
      })
    : i18n.t("tokenStats.backfillPending");

  const dailyByDate = new Map<string, { input: number; output: number; cache: number }>();
  for (const d of data?.daily ?? []) {
    const existing = dailyByDate.get(d.date) ?? { input: 0, output: 0, cache: 0 };
    existing.input += d.inputTokens;
    existing.output += d.outputTokens;
    existing.cache += d.cacheReadTokens + d.cacheCreationTokens;
    dailyByDate.set(d.date, existing);
  }
  const dailyEntries = Array.from(dailyByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDailyTokens = Math.max(1, ...dailyEntries.map(([, v]) => v.input + v.output + v.cache));

  const rangeButtons: Array<{ key: RangePreset; label: string }> = [
    { key: "today", label: i18n.t("tokenStats.range.today") },
    { key: "7d", label: i18n.t("tokenStats.range.7d") },
    { key: "30d", label: i18n.t("tokenStats.range.30d") },
    { key: "custom", label: i18n.t("tokenStats.range.custom") },
  ];

  const heroStats = [
    { label: i18n.t("tokenStats.totalTokens"), value: formatTokens(totalTokens) },
    { label: i18n.t("tokenStats.requests"), value: String(totalRequests) },
    { label: i18n.t("tokenStats.input"), value: formatTokens(totalInput) },
    { label: i18n.t("tokenStats.output"), value: formatTokens(totalOutput) },
    {
      label: i18n.t("tokenStats.topAgent"),
      value: topAgent ? agentLabel(topAgent.agent) : "—",
      detail: topAgent
        ? i18n.t("tokenStats.tokensValue", { value: formatTokens(topAgent.totalTokens) })
        : undefined,
    },
    {
      label: i18n.t("tokenStats.topModel"),
      value: topModel ? `${topModel.model}` : "—",
      detail: topModel ? agentLabel(topModel.agent) : undefined,
    },
    { label: i18n.t("tokenStats.cacheHit"), value: `${Math.round(cacheHitRate * 100)}%` },
    { label: i18n.t("tokenStats.estimatedCost"), value: formatCost(totalCost) },
  ];

  const breakdownRows =
    breakdownMode === "model"
      ? (data?.byModel ?? []).slice(0, 8).map((m) => ({
          key: `${m.agent}-${m.model}`,
          name: m.model,
          agent: m.agent,
          requestCount: m.requestCount,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          cacheReadTokens: m.cacheReadTokens,
          cacheCreationTokens: m.cacheCreationTokens,
          totalTokens: m.totalTokens,
          cost: estimateCost(m, pricingMap, m.model),
        }))
      : (data?.byAgent ?? []).map((agent) => ({
          key: agent.agent,
          name: agent.agent,
          agent: "",
          requestCount: agent.requestCount,
          inputTokens: agent.inputTokens,
          outputTokens: agent.outputTokens,
          cacheReadTokens: agent.cacheReadTokens,
          cacheCreationTokens: agent.cacheCreationTokens,
          totalTokens: agent.totalTokens,
          cost: 0,
        }));

  return (
    <div className="analytics-page">
      <div className="analytics-page__header">
        <h2 className="analytics-page__title">{i18n.t("nav.analytics")}</h2>
        <p className="analytics-page__subtitle">{i18n.t("tokenStats.subtitle")}</p>
      </div>

      <div className="analytics-page__toolbar">
        <div className="analytics-page__range-group">
          {rangeButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => {
                setRange(btn.key);
                if (btn.key !== "custom") {
                  void fetchData(btn.key);
                }
              }}
              className={`analytics-page__range-btn ${range === btn.key ? "analytics-page__range-btn--active" : ""}`}
            >
              {btn.label}
            </button>
          ))}
          {range === "custom" ? (
            <div className="analytics-page__date-range">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="analytics-page__date-input"
              />
              <span className="analytics-page__date-sep">~</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="analytics-page__date-input"
              />
              <button
                onClick={() => void fetchData("custom")}
                disabled={loading}
                className="analytics-page__refresh-btn"
              >
                {loading ? "..." : "✓"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => void fetchData(range)}
              disabled={loading}
              className="analytics-page__refresh-btn"
            >
              {loading ? "..." : "↻"}
            </button>
          )}
        </div>
        <button
          onClick={() => void handleOpenReport()}
          className="analytics-page__report-btn"
        >
          {i18n.t("tokenStats.openReport")}
        </button>
      </div>

      <div className="analytics-page__hero-grid">
        {heroStats.map((stat) => (
          <div key={stat.label} className="analytics-page__hero-card">
            <div className="analytics-page__hero-label">{stat.label}</div>
            <div className="analytics-page__hero-value">{stat.value}</div>
            {stat.detail ? <div className="analytics-page__hero-detail">{stat.detail}</div> : null}
          </div>
        ))}
      </div>

      {importStatus ? (
        <div className="analytics-page__import-strip">
          <span>{importSummary}</span>
          {importStatus.lastError ? (
            <span className="analytics-page__import-error">{importStatus.lastError}</span>
          ) : null}
        </div>
      ) : null}

      {dailyEntries.length > 0 ? (
        <div className="analytics-page__section">
          <div className="analytics-page__section-title">{i18n.t("tokenStats.dailyTrend")}</div>
          <div className="analytics-page__chart-wrap">
            <div className="analytics-page__chart-y-axis">
              <span>{formatTokens(maxDailyTokens)}</span>
              <span>{formatTokens(Math.round(maxDailyTokens * 0.5))}</span>
              <span>0</span>
            </div>
            <div className="analytics-page__chart">
              {dailyEntries.map(([date, vals]) => {
                const total = vals.input + vals.output + vals.cache;
                const heightPct = (total / maxDailyTokens) * 100;
                const inputPct = total > 0 ? (vals.input / total) * heightPct : 0;
                const outputPct = total > 0 ? (vals.output / total) * heightPct : 0;
                return (
                  <div
                    key={date}
                    className="analytics-page__chart-col"
                    title={`${date}\n${i18n.t("tokenStats.input")}: ${formatTokens(vals.input)}\n${i18n.t("tokenStats.output")}: ${formatTokens(vals.output)}\n${i18n.t("tokenStats.cache")}: ${formatTokens(vals.cache)}\n${i18n.t("tokenStats.totalTokens")}: ${formatTokens(total)}`}
                  >
                    <div className="analytics-page__chart-value">{formatTokens(total)}</div>
                    <div className="analytics-page__chart-bar-group" style={{ height: `${Math.max(2, heightPct)}%` }}>
                      <div className="analytics-page__chart-bar analytics-page__chart-bar--input" style={{ height: `${inputPct / Math.max(2, heightPct) * 100}%` }} />
                      <div className="analytics-page__chart-bar analytics-page__chart-bar--output" style={{ height: `${outputPct / Math.max(2, heightPct) * 100}%` }} />
                      <div className="analytics-page__chart-bar analytics-page__chart-bar--cache" style={{ flex: 1 }} />
                    </div>
                    <div className="analytics-page__chart-label">{date.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="analytics-page__chart-legend">
            <span className="analytics-page__legend-item"><span className="analytics-page__legend-dot analytics-page__legend-dot--input" />{i18n.t("tokenStats.input")}</span>
            <span className="analytics-page__legend-item"><span className="analytics-page__legend-dot analytics-page__legend-dot--output" />{i18n.t("tokenStats.output")}</span>
            <span className="analytics-page__legend-item"><span className="analytics-page__legend-dot analytics-page__legend-dot--cache" />{i18n.t("tokenStats.cache")}</span>
          </div>
        </div>
      ) : null}

      {breakdownRows.length > 0 ? (
        <div className="analytics-page__section">
          <div className="analytics-page__section-header">
            <div className="analytics-page__section-title">{i18n.t("tokenStats.breakdown")}</div>
            <div className="analytics-page__segmented" aria-label={i18n.t("tokenStats.breakdown")}>
              <button
                type="button"
                className={`analytics-page__segment ${breakdownMode === "model" ? "analytics-page__segment--active" : ""}`}
                onClick={() => setBreakdownMode("model")}
              >
                {i18n.t("tokenStats.byModel")}
              </button>
              <button
                type="button"
                className={`analytics-page__segment ${breakdownMode === "agent" ? "analytics-page__segment--active" : ""}`}
                onClick={() => setBreakdownMode("agent")}
              >
                {i18n.t("tokenStats.byAgent")}
              </button>
            </div>
          </div>
          <table className="analytics-page__table">
            <thead>
              <tr>
                <th className="analytics-page__table-model">
                  {breakdownMode === "model" ? i18n.t("tokenStats.model") : i18n.t("tokenStats.agent")}
                </th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.requests")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.totalTokens")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.input")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.output")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.cacheHit")}</th>
                {breakdownMode === "model" ? (
                  <th className="analytics-page__table-num">{i18n.t("tokenStats.cost")}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((row) => {
                const inputLikeTotal = row.inputTokens + row.cacheReadTokens + row.cacheCreationTokens;
                const cacheRate = inputLikeTotal > 0 ? row.cacheReadTokens / inputLikeTotal : 0;
                return (
                <tr key={row.key}>
                  <td className="analytics-page__table-model">
                    {row.agent ? <span className="analytics-page__table-agent">{row.agent}</span> : null}
                    {row.name}
                  </td>
                  <td className="analytics-page__table-num">{row.requestCount}</td>
                  <td className="analytics-page__table-num">{formatTokens(row.totalTokens)}</td>
                  <td className="analytics-page__table-num">{formatTokens(row.inputTokens)}</td>
                  <td className="analytics-page__table-num">{formatTokens(row.outputTokens)}</td>
                  <td className="analytics-page__table-num">{cacheRate > 0 ? `${Math.round(cacheRate * 100)}%` : "—"}</td>
                  {breakdownMode === "model" ? (
                    <td className="analytics-page__table-num">{formatCost(row.cost)}</td>
                  ) : null}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {totalTokens === 0 && !loading ? (
        <div className="analytics-page__empty">{i18n.t("tokenStats.empty")}</div>
      ) : null}
    </div>
  );
}
