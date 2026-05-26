import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyticsMetric, TokenTrendGranularity, TokenTrendPoint, TokenTrendResult } from "../../shared/analyticsTypes";
import type { ModelPricing, TokenStatsResult } from "../../shared/usageTypes";
import { UNKNOWN_PROJECT_NAME, UNKNOWN_PROJECT_PATH, isUnknownProjectPath, sortProjectRows } from "../../shared/projectAttribution";
import { useI18n } from "../i18n";
import { readAnalyticsPagePreferences, writeAnalyticsPagePreferences } from "../projectViewPreferences";
import { AnalyticsLineChart } from "./AnalyticsLineChart";
import { AnalyticsSmallMultiples } from "./AnalyticsSmallMultiples";

type RangePreset = "today" | "7d" | "30d" | "custom";
type BreakdownMode = "project" | "model" | "agent";

export const TREND_METRICS = ["tokens", "cost"] as const satisfies readonly AnalyticsMetric[];
export const BREAKDOWN_MODES = ["project", "model", "agent"] as const satisfies readonly BreakdownMode[];

export type AnalyticsBreakdownRow = {
  key: string;
  name: string;
  fullName?: string;
  agent: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  cost: number;
};

type UsageRank = {
  key: string;
  requestCount: number;
  totalTokens: number;
};

type ProjectFilterOption = {
  projectPath: string;
  projectName: string;
};

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

export function buildAnalyticsBreakdownRows(
  breakdownMode: BreakdownMode,
  data: TokenStatsResult | null,
): AnalyticsBreakdownRow[] {
  const pricingMap = new Map<string, ModelPricing>();
  for (const p of data?.pricing ?? []) {
    pricingMap.set(p.modelId, p);
  }

  if (breakdownMode === "project") {
    return sortProjectRows(data?.byProject ?? []).map((project) => ({
      key: project.projectPath,
      name: project.projectName,
      fullName: isUnknownProjectPath(project.projectPath) ? undefined : project.projectPath,
      agent: "",
      requestCount: project.requestCount,
      inputTokens: project.inputTokens,
      outputTokens: project.outputTokens,
      cacheReadTokens: project.cacheReadTokens,
      cacheCreationTokens: project.cacheCreationTokens,
      totalTokens: project.totalTokens,
      cost: project.estimatedCost ?? 0,
    }));
  }

  if (breakdownMode === "model") {
    return (data?.byModel ?? []).slice(0, 8).map((m) => ({
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
    }));
  }

  const costByAgent = new Map<string, number>();
  for (const modelStats of data?.byModel ?? []) {
    costByAgent.set(
      modelStats.agent,
      (costByAgent.get(modelStats.agent) ?? 0) +
        estimateCost(modelStats, pricingMap, modelStats.model),
    );
  }

  return (data?.byAgent ?? []).map((agent) => ({
    key: agent.agent,
    name: agent.agent,
    agent: "",
    requestCount: agent.requestCount,
    inputTokens: agent.inputTokens,
    outputTokens: agent.outputTokens,
    cacheReadTokens: agent.cacheReadTokens,
    cacheCreationTokens: agent.cacheCreationTokens,
    totalTokens: agent.totalTokens,
    cost: costByAgent.get(agent.agent) ?? 0,
  }));
}

function addUsageRank(
  ranks: Map<string, UsageRank>,
  key: string,
  requestCount: number,
  totalTokens: number,
): void {
  if (!key) return;
  const current = ranks.get(key);
  if (current) {
    current.requestCount += requestCount;
    current.totalTokens += totalTokens;
    return;
  }
  ranks.set(key, { key, requestCount, totalTokens });
}

function sortedUsageKeys(ranks: Map<string, UsageRank>): string[] {
  return Array.from(ranks.values())
    .sort((a, b) =>
      b.requestCount - a.requestCount ||
      b.totalTokens - a.totalTokens ||
      a.key.localeCompare(b.key),
    )
    .map((rank) => rank.key);
}

export function buildAvailableAgents(
  data: TokenStatsResult | null,
  trendPoints: TokenTrendPoint[],
): string[] {
  const ranks = new Map<string, UsageRank>();
  for (const entry of data?.byAgent ?? []) {
    addUsageRank(ranks, entry.agent, entry.requestCount, entry.totalTokens);
  }

  const fallbackRanks = new Map<string, UsageRank>();
  for (const point of trendPoints) {
    addUsageRank(fallbackRanks, point.agent, point.requestCount, point.totalTokens);
  }
  for (const [agent, rank] of fallbackRanks) {
    if (!ranks.has(agent)) ranks.set(agent, rank);
  }

  return sortedUsageKeys(ranks);
}

export function buildAvailableModels(
  data: TokenStatsResult | null,
  trendPoints: TokenTrendPoint[],
): string[] {
  const ranks = new Map<string, UsageRank>();
  for (const entry of data?.byModel ?? []) {
    addUsageRank(ranks, entry.model, entry.requestCount, entry.totalTokens);
  }

  const fallbackRanks = new Map<string, UsageRank>();
  for (const point of trendPoints) {
    addUsageRank(fallbackRanks, point.model, point.requestCount, point.totalTokens);
  }
  for (const [model, rank] of fallbackRanks) {
    if (!ranks.has(model)) ranks.set(model, rank);
  }

  return sortedUsageKeys(ranks);
}

export function buildAvailableProjects(
  data: TokenStatsResult | null,
  trendPoints: TokenTrendPoint[],
): ProjectFilterOption[] {
  if ((data?.byProject?.length ?? 0) > 0) {
    return sortProjectRows(data?.byProject ?? []).map((project) => ({
      projectPath: project.projectPath,
      projectName: project.projectName,
    }));
  }

  const ranks = new Map<string, ProjectFilterOption & UsageRank>();
  for (const point of trendPoints) {
    const projectPath = point.projectPath?.trim() || UNKNOWN_PROJECT_PATH;
    const projectName = isUnknownProjectPath(projectPath)
      ? UNKNOWN_PROJECT_NAME
      : point.projectName?.trim() || projectPath;
    const current = ranks.get(projectPath);
    if (current) {
      current.requestCount += point.requestCount;
      current.totalTokens += point.totalTokens;
      continue;
    }
    ranks.set(projectPath, {
      key: projectPath,
      projectPath,
      projectName,
      requestCount: point.requestCount,
      totalTokens: point.totalTokens,
    });
  }

  return sortProjectRows(Array.from(ranks.values())).map((project) => ({
    projectPath: project.projectPath,
    projectName: project.projectName,
  }));
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
  const initialPreferencesRef = useRef<ReturnType<typeof readAnalyticsPagePreferences> | null>(null);
  if (initialPreferencesRef.current === null) {
    initialPreferencesRef.current = readAnalyticsPagePreferences();
  }
  const initialPreferences = initialPreferencesRef.current;
  const [range, setRange] = useState<RangePreset>(initialPreferences.range);
  const [customStart, setCustomStart] = useState(initialPreferences.customStart || weekAgoStr());
  const [customEnd, setCustomEnd] = useState(initialPreferences.customEnd || todayStr());
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>(initialPreferences.breakdownMode);
  const [data, setData] = useState<TokenStatsResult | null>(null);
  const [trendData, setTrendData] = useState<TokenTrendResult | null>(null);
  const [granularity, setGranularity] = useState<TokenTrendGranularity>(initialPreferences.granularity);
  const [metric, setMetric] = useState<AnalyticsMetric>(initialPreferences.metric);
  const [projectFilter, setProjectFilter] = useState<string | undefined>(initialPreferences.projectFilter);
  const [agentFilter, setAgentFilter] = useState<string | undefined>(initialPreferences.agentFilter);
  const [modelFilter, setModelFilter] = useState<string | undefined>(initialPreferences.modelFilter);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    writeAnalyticsPagePreferences({
      range,
      customStart,
      customEnd,
      breakdownMode,
      granularity,
      metric,
      projectFilter,
      agentFilter,
      modelFilter,
    });
  }, [
    range,
    customStart,
    customEnd,
    breakdownMode,
    granularity,
    metric,
    projectFilter,
    agentFilter,
    modelFilter,
  ]);

  const fetchData = useCallback(async (preset: RangePreset) => {
    setLoading(true);
    try {
      const resolved = resolveRange(preset, customStart, customEnd);
      const result = await window.codepal.getTokenStats(resolved.start, resolved.end);
      setData(result);
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
        projectPath: projectFilter,
        agent: agentFilter,
        model: modelFilter,
      })
      .then((result) => {
        if (!cancelled) setTrendData(result);
      });
    return () => {
      cancelled = true;
    };
  }, [range, customStart, customEnd, granularity, projectFilter, agentFilter, modelFilter]);

  const handleOpenReport = useCallback(async () => {
    const { start, end } = resolveRange(range, customStart, customEnd);
    const opts = {
      trendGranularity: granularity,
      metric,
      projectPath: projectFilter,
      agent: agentFilter,
      model: modelFilter,
      locale: i18n.locale,
    };
    const filePath = await window.codepal.generateHtmlReport(start, end, opts);
    await window.codepal.openExternalTarget(filePath);
  }, [range, customStart, customEnd, granularity, metric, projectFilter, agentFilter, modelFilter, i18n.locale]);

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

  const availableAgents = useMemo(
    () => buildAvailableAgents(data, trendData?.points ?? []),
    [data, trendData?.points],
  );

  const availableProjects = useMemo(
    () => buildAvailableProjects(data, trendData?.points ?? []),
    [data, trendData?.points],
  );

  const availableModels = useMemo(
    () => buildAvailableModels(data, trendData?.points ?? []),
    [data, trendData?.points],
  );

  const currentRange = useMemo(() => {
    const { start, end } = resolveRange(range, customStart, customEnd);
    return { startMs: start, endMs: end };
  }, [range, customStart, customEnd]);

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

  const breakdownRows = buildAnalyticsBreakdownRows(breakdownMode, data);

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

      <div className="analytics-page__hero-grid">
        {heroStats.map((stat) => (
          <div key={stat.label} className="analytics-page__hero-card">
            <div className="analytics-page__hero-label">{stat.label}</div>
            <div className="analytics-page__hero-value">{stat.value}</div>
            {stat.detail ? <div className="analytics-page__hero-detail">{stat.detail}</div> : null}
          </div>
        ))}
      </div>

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
            {TREND_METRICS.map((value) => (
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
        {availableProjects.length > 1 ? (
          <div className="analytics-page__filter-chips">
            <button
              type="button"
              className={`analytics-page__filter-chip${projectFilter === undefined ? " analytics-page__filter-chip--active" : ""}`}
              onClick={() => setProjectFilter(undefined)}
            >
              {i18n.t("tokenStats.filterAllProjects")}
            </button>
            {availableProjects.slice(0, 8).map((project) => (
              <button
                key={project.projectPath}
                type="button"
                className={`analytics-page__filter-chip${projectFilter === project.projectPath ? " analytics-page__filter-chip--active" : ""}`}
                title={isUnknownProjectPath(project.projectPath) ? undefined : project.projectPath}
                onClick={() => setProjectFilter((current) => current === project.projectPath ? undefined : project.projectPath)}
              >
                {isUnknownProjectPath(project.projectPath) ? i18n.t("tokenStats.unknownProject") : project.projectName}
              </button>
            ))}
          </div>
        ) : null}
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

      {breakdownRows.length > 0 ? (
        <div className="analytics-page__section">
          <div className="analytics-page__section-header">
            <div className="analytics-page__section-title">{i18n.t("tokenStats.breakdown")}</div>
            <div className="analytics-page__segmented" aria-label={i18n.t("tokenStats.breakdown")}>
              {BREAKDOWN_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`analytics-page__segment ${breakdownMode === mode ? "analytics-page__segment--active" : ""}`}
                  onClick={() => setBreakdownMode(mode)}
                >
                  {i18n.t(`tokenStats.by.${mode}`)}
                </button>
              ))}
            </div>
          </div>
          <table className="analytics-page__table">
            <thead>
              <tr>
                <th className="analytics-page__table-model">
                  {breakdownMode === "project"
                    ? i18n.t("tokenStats.project")
                    : breakdownMode === "model"
                      ? i18n.t("tokenStats.model")
                      : i18n.t("tokenStats.agent")}
                </th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.requests")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.totalTokens")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.input")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.output")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.cacheHit")}</th>
                <th className="analytics-page__table-num">{i18n.t("tokenStats.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((row) => {
                const inputLikeTotal = row.inputTokens + row.cacheReadTokens + row.cacheCreationTokens;
                const cacheRate = inputLikeTotal > 0 ? row.cacheReadTokens / inputLikeTotal : 0;
                return (
                <tr key={row.key}>
                  <td className="analytics-page__table-model" title={row.fullName}>
                    {row.agent ? <span className="analytics-page__table-agent">{row.agent}</span> : null}
                    {row.key === UNKNOWN_PROJECT_PATH ? i18n.t("tokenStats.unknownProject") : row.name}
                  </td>
                  <td className="analytics-page__table-num">{row.requestCount}</td>
                  <td className="analytics-page__table-num">{formatTokens(row.totalTokens)}</td>
                  <td className="analytics-page__table-num">{formatTokens(row.inputTokens)}</td>
                  <td className="analytics-page__table-num">{formatTokens(row.outputTokens)}</td>
                  <td className="analytics-page__table-num">{cacheRate > 0 ? `${Math.round(cacheRate * 100)}%` : "—"}</td>
                  <td className="analytics-page__table-num">{formatCost(row.cost)}</td>
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
