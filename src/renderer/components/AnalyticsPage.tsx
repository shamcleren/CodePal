import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings } from "../../shared/appSettings";
import type { AnalyticsMetric, TokenTrendGranularity, TokenTrendResult, WorkHealthSignal, WorkHealthSignalKind } from "../../shared/analyticsTypes";
import type { ModelPricing, TokenStatsResult, UsageOverview } from "../../shared/usageTypes";
import type { WorkItemList } from "../../shared/workItems";
import { useI18n } from "../i18n";
import { AnalyticsLineChart } from "./AnalyticsLineChart";
import { AnalyticsSmallMultiples } from "./AnalyticsSmallMultiples";
import { WorkHealthStrip } from "./WorkHealthStrip";
import { deriveAnalyticsWorkHealth } from "../../shared/analyticsWorkHealth";
import { buildWorkHealthSessionTargets } from "../lib/workHealthSessionTargets";

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
      return { start: startOfDay.getTime() - 6 * 24 * 60 * 60 * 1000, end: now };
    case "30d":
      return { start: startOfDay.getTime() - 29 * 24 * 60 * 60 * 1000, end: now };
    case "custom": {
      const start = customStart ? new Date(customStart + "T00:00:00").getTime() : startOfDay.getTime();
      const end = customEnd ? new Date(customEnd + "T23:59:59").getTime() : now;
      return { start, end };
    }
  }
}

function previousEqualRange(range: { start: number; end: number }): { start: number; end: number } {
  const duration = Math.max(1, range.end - range.start);
  return { start: range.start - duration, end: range.start - 1 };
}

function defaultGranularity(preset: RangePreset, start: number, end: number): TokenTrendGranularity {
  if (preset === "today") return "minute";
  if (preset === "custom") {
    return end - start >= 24 * 60 * 60 * 1000 ? "hour" : "minute";
  }
  return "hour";
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

export function AnalyticsPage({
  appSettings,
  workItemList,
  usageOverview,
  onFocusSession,
}: {
  appSettings?: AppSettings;
  workItemList?: WorkItemList;
  usageOverview?: UsageOverview | null;
  onFocusSession?: (sessionId: string) => void;
}) {
  const i18n = useI18n();
  const [range, setRange] = useState<RangePreset>("7d");
  const [customStart, setCustomStart] = useState(weekAgoStr());
  const [customEnd, setCustomEnd] = useState(todayStr());
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>("model");
  const [data, setData] = useState<TokenStatsResult | null>(null);
  const [previousData, setPreviousData] = useState<TokenStatsResult | null>(null);
  const [trendData, setTrendData] = useState<TokenTrendResult | null>(null);
  const [granularity, setGranularity] = useState<TokenTrendGranularity>("hour");
  const [metric, setMetric] = useState<AnalyticsMetric>("tokens");
  const [agentFilter, setAgentFilter] = useState<string | undefined>(undefined);
  const [modelFilter, setModelFilter] = useState<string | undefined>(undefined);
  const [activeHealthKind, setActiveHealthKind] = useState<WorkHealthSignalKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [redactTitles, setRedactTitles] = useState(false);
  const [redactModels, setRedactModels] = useState(false);
  const [llmReportGenerating, setLlmReportGenerating] = useState(false);
  const [llmReportResult, setLlmReportResult] = useState<string | null>(null);
  const [llmReportError, setLlmReportError] = useState<string | null>(null);
  const [llmModel, setLlmModel] = useState(appSettings?.reports?.llmDefaultModel ?? "");

  const fetchData = useCallback(async (preset: RangePreset) => {
    setLoading(true);
    try {
      const resolved = resolveRange(preset, customStart, customEnd);
      const previous = previousEqualRange(resolved);
      const [result, previousResult] = await Promise.all([
        window.codepal.getTokenStats(resolved.start, resolved.end),
        window.codepal.getTokenStats(previous.start, previous.end),
      ]);
      setData(result);
      setPreviousData(previousResult);
      setGranularity((current) => {
        const preferred = defaultGranularity(preset, resolved.start, resolved.end);
        return current === preferred || preset === "custom" ? current : preferred;
      });
    } finally {
      setLoading(false);
    }
  }, [customStart, customEnd]);

  useEffect(() => {
    void fetchData(range);
  }, [range, fetchData]);

  useEffect(() => {
    const { start, end } = resolveRange(range, customStart, customEnd);
    let cancelled = false;
    void window.codepal
      .getTokenTrend(start, end, granularity, {
        agent: agentFilter,
        model: modelFilter,
      })
      .then((result) => {
        if (!cancelled) setTrendData(result);
      });
    return () => {
      cancelled = true;
    };
  }, [range, customStart, customEnd, granularity, agentFilter, modelFilter]);

  const handleOpenReport = useCallback(async () => {
    const { start, end } = resolveRange(range, customStart, customEnd);
    const opts = {
      redactSessionTitles: redactTitles,
      redactModelNames: redactModels,
      trendGranularity: granularity,
      metric,
      agent: agentFilter,
      model: modelFilter,
      locale: i18n.locale,
    };
    const filePath = await window.codepal.generateHtmlReport(start, end, opts);
    await window.codepal.openExternalTarget(filePath);
  }, [range, customStart, customEnd, redactTitles, redactModels, granularity, metric, agentFilter, modelFilter, i18n.locale]);

  const handleLlmReport = useCallback(async () => {
    setLlmReportGenerating(true);
    setLlmReportResult(null);
    setLlmReportError(null);
    try {
      const { start, end } = resolveRange(range, customStart, customEnd);
      const opts = {
        model: llmModel || undefined,
        redaction: (redactTitles || redactModels)
          ? { redactSessionTitles: redactTitles, redactModelNames: redactModels }
          : undefined,
      };
      const result = await window.codepal.generateLlmReport(start, end, opts);
      if (result.ok && result.report) {
        setLlmReportResult(result.report);
      } else {
        setLlmReportError(result.error ?? "Report generation failed");
      }
    } catch (err) {
      setLlmReportError(err instanceof Error ? err.message : String(err));
    } finally {
      setLlmReportGenerating(false);
    }
  }, [range, customStart, customEnd, llmModel, redactTitles, redactModels]);

  const llmEnabled = appSettings?.reports?.llmEnabled ?? false;

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

  const availableAgents = useMemo(() => {
    const set = new Set<string>((data?.byAgent ?? []).map((entry) => entry.agent));
    for (const point of trendData?.points ?? []) set.add(point.agent);
    return Array.from(set).sort();
  }, [data?.byAgent, trendData?.points]);

  const availableModels = useMemo(() => {
    const set = new Set<string>((data?.byModel ?? []).map((entry) => entry.model));
    for (const point of trendData?.points ?? []) set.add(point.model);
    return Array.from(set).sort();
  }, [data?.byModel, trendData?.points]);

  const currentRange = useMemo(() => {
    const { start, end } = resolveRange(range, customStart, customEnd);
    return { startMs: start, endMs: end };
  }, [range, customStart, customEnd]);

  const healthSummary = useMemo(
    () =>
      workItemList && data && previousData
        ? deriveAnalyticsWorkHealth({
            workItemList,
            usageOverview: usageOverview ?? null,
            currentStats: data,
            previousStats: previousData,
            selectedRange: currentRange,
          })
        : null,
    [workItemList, usageOverview, data, previousData, currentRange],
  );

  const activeHealthSignal = healthSummary?.signals.find((signal) => signal.kind === activeHealthKind);
  const activeHealthTargets = useMemo(
    () =>
      activeHealthSignal
        ? buildWorkHealthSessionTargets(activeHealthSignal.sessionIds, workItemList, usageOverview)
        : [],
    [activeHealthSignal, workItemList, usageOverview],
  );

  const handleHealthSignal = useCallback((signal: WorkHealthSignal) => {
    setActiveHealthKind((current) => current === signal.kind ? null : signal.kind);
    if (signal.sessionIds.length === 1) {
      onFocusSession?.(signal.sessionIds[0]);
    }
  }, [onFocusSession]);

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
                const resolved = resolveRange(btn.key, customStart, customEnd);
                setGranularity(defaultGranularity(btn.key, resolved.start, resolved.end));
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

      <div className="analytics-page__redaction-bar">
        <label className="analytics-page__redaction-toggle">
          <input
            type="checkbox"
            checked={redactTitles}
            onChange={(e) => setRedactTitles(e.target.checked)}
          />
          {i18n.t("tokenStats.redactTitles")}
        </label>
        <label className="analytics-page__redaction-toggle">
          <input
            type="checkbox"
            checked={redactModels}
            onChange={(e) => setRedactModels(e.target.checked)}
          />
          {i18n.t("tokenStats.redactModels")}
        </label>
      </div>

      {llmEnabled ? (
        <div className="analytics-page__llm-section">
          <div className="analytics-page__llm-header">
            <span className="analytics-page__llm-label">LLM Report</span>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              placeholder={appSettings?.reports?.llmDefaultModel || "claude-haiku-4-5"}
              className="analytics-page__llm-model-input"
            />
            <button
              onClick={() => void handleLlmReport()}
              disabled={llmReportGenerating}
              className="analytics-page__llm-btn"
            >
              {llmReportGenerating ? "..." : "Generate"}
            </button>
          </div>
          {llmReportError ? (
            <div className="analytics-page__llm-error">{llmReportError}</div>
          ) : null}
          {llmReportResult ? (
            <div className="analytics-page__llm-result">
              <pre className="analytics-page__llm-report">{llmReportResult}</pre>
            </div>
          ) : null}
        </div>
      ) : null}

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

      {healthSummary ? (
        <>
          <WorkHealthStrip
            summary={healthSummary}
            activeKind={activeHealthKind}
            onSignalClick={handleHealthSignal}
          />
          {activeHealthTargets.length > 1 ? (
            <div className="work-health-panel__list">
              <div className="work-health-panel__list-title">
                {i18n.t("workHealth.filteredList")}
              </div>
              {activeHealthTargets.map((target) => (
                <button
                  key={target.sessionId}
                  type="button"
                  className="work-health-panel__list-item"
                  onClick={() => onFocusSession?.(target.sessionId)}
                >
                  <span>{target.title}</span>
                  <span>{i18n.t("workHealth.focusSession")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {(trendData?.points.length ?? 0) > 0 ? (
        <div className="analytics-page__section analytics-page__trend-section">
          <div className="analytics-page__section-header">
            <div className="analytics-page__section-title">{i18n.t("tokenStats.dailyTrend")}</div>
            <div className="analytics-page__segmented" aria-label="Trend granularity">
              {(["minute", "hour", "day"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`analytics-page__segment ${granularity === value ? "analytics-page__segment--active" : ""}`}
                  onClick={() => setGranularity(value)}
                >
                  {i18n.t(`tokenStats.granularity.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="analytics-page__trend-controls">
            <div className="analytics-page__segmented" aria-label="Trend metric">
              {(["tokens", "requests", "cost", "cacheHit"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`analytics-page__segment ${metric === value ? "analytics-page__segment--active" : ""}`}
                  onClick={() => setMetric(value)}
                >
                  {i18n.t(`tokenStats.metric.${value}`)}
                </button>
              ))}
            </div>
          </div>
          {availableAgents.length > 1 ? (
            <div className="analytics-page__filter-chips">
              <button
                type="button"
                className={`analytics-page__filter-chip${agentFilter === undefined ? " analytics-page__filter-chip--active" : ""}`}
                onClick={() => setAgentFilter(undefined)}
              >
                {i18n.t("tokenStats.filterAllAgents")}
              </button>
              {availableAgents.map((agent) => (
                <button
                  key={agent}
                  type="button"
                  className={`analytics-page__filter-chip${agentFilter === agent ? " analytics-page__filter-chip--active" : ""}`}
                  onClick={() => {
                    setAgentFilter((current) => current === agent ? undefined : agent);
                    setModelFilter(undefined);
                  }}
                >
                  {agentLabel(agent)}
                </button>
              ))}
            </div>
          ) : null}
          {availableModels.length > 1 ? (
            <div className="analytics-page__filter-chips">
              <button
                type="button"
                className={`analytics-page__filter-chip${modelFilter === undefined ? " analytics-page__filter-chip--active" : ""}`}
                onClick={() => setModelFilter(undefined)}
              >
                {i18n.t("tokenStats.filterAllModels")}
              </button>
              {availableModels.slice(0, 8).map((model) => (
                <button
                  key={model}
                  type="button"
                  className={`analytics-page__filter-chip${modelFilter === model ? " analytics-page__filter-chip--active" : ""}`}
                  onClick={() => setModelFilter((current) => current === model ? undefined : model)}
                >
                  {model}
                </button>
              ))}
            </div>
          ) : null}
          <AnalyticsLineChart
            points={trendData?.points ?? []}
            metric={metric}
            granularity={granularity}
            domainStart={currentRange.startMs}
            domainEnd={currentRange.endMs}
            pricing={data?.pricing ?? []}
          />
          <AnalyticsSmallMultiples
            points={trendData?.points ?? []}
            selectedAgent={agentFilter}
            formatValue={formatTokens}
          />
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
          {importStatus ? (
            <div className="analytics-page__source-coverage">
              {i18n.t("tokenStats.sourceCoverage", {
                live: (data?.daily ?? []).filter((row) => row.requestCount > 0).length,
                backfill: importStatus.claudeRowsImported + importStatus.codexRowsImported,
                estimated: (data?.byModel ?? []).length,
              })}
            </div>
          ) : null}
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
