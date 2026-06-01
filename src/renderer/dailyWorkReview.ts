import type { ResolvedLocale } from "../shared/i18nTypes";
import type { TokenTrendPoint } from "../shared/analyticsTypes";
import type { UserPromptSummary } from "../shared/historyTypes";
import { isSessionStatus, type ActivityItem, type SessionStatus } from "../shared/sessionTypes";
import { computeSessionTiming, formatSessionDuration } from "../shared/sessionTiming";
import type { ModelPricing, SessionUsage, UsageOverview, UsageTokens } from "../shared/usageTypes";
import {
  UNKNOWN_PROJECT_NAME,
  UNKNOWN_PROJECT_PATH,
  isUnknownProjectPath,
} from "../shared/projectAttribution";
import type { MonitorSessionRow } from "./monitorSession";
import { estimateTokenCost, estimateTrendPointCost, formatUsageCost, formatUsageTokens } from "./usageFormat";

export type DailyWorkReviewSource = {
  id: string;
  tool: string;
  status: SessionStatus | string;
  title?: string | null;
  task?: string | null;
  projectPath?: string | null;
  projectName?: string | null;
  updatedAt: number;
  lastUserMessageAt?: number | null;
  activityItems?: ActivityItem[];
  startedAt?: number | null;
  latestRunningStartedAt?: number | null;
  sessionDurationMs?: number | null;
  latestRunningDurationMs?: number | null;
  collapsedSummary?: string;
  titleLabel?: string;
  isManaged?: boolean;
  managedTaskTitle?: string;
  userPrompts?: UserPromptSummary[];
  shortId?: string;
  timelineItems?: unknown[];
};

export type DailyWorkReviewEntry = {
  id: string;
  sessionId: string;
  title: string;
  detail: string;
  agent: string;
  projectPath?: string;
  projectName?: string;
  status: SessionStatus;
  source: "managed" | "observed";
  availability: "current" | "history";
  timestamp: number;
  latestRunningDurationLabel?: string;
  sessionDurationLabel?: string;
};

export type DailyWorkReviewDay = {
  key: string;
  isToday: boolean;
  dateLabel: string;
  weekdayLabel: string;
  relativeLabel: string;
  summaryText: string;
  sessionCount: number;
  completedCount: number;
  ongoingCount: number;
  managedCount: number;
  observedCount: number;
  totalTokens?: number;
  reportedCost?: number;
  estimatedCost?: number;
  costCurrency?: string;
  agents: string[];
  completed: DailyWorkReviewEntry[];
  ongoing: DailyWorkReviewEntry[];
  entries: DailyWorkReviewEntry[];
};

type BuildDailyWorkReviewOptions = {
  locale?: ResolvedLocale;
  now?: number;
  maxDays?: number;
  rangeDays?: number;
  usageOverview?: UsageOverview | null;
  tokenTrendPoints?: TokenTrendPoint[];
  pricing?: ModelPricing[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfWeek(timestamp: number): number {
  const date = new Date(startOfDay(timestamp));
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
}

function relativeLabel(timestamp: number, now: number, locale: ResolvedLocale): string {
  const diffDays = Math.round((startOfDay(now) - startOfDay(timestamp)) / MS_PER_DAY);
  const nowWeekStart = startOfWeek(now);
  const timestampWeekStart = startOfWeek(timestamp);
  const isThisWeek = timestampWeekStart === nowWeekStart;
  const isLastWeek = timestampWeekStart === nowWeekStart - 7 * MS_PER_DAY;
  if (locale === "zh-CN") {
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (isThisWeek) return "本周";
    if (isLastWeek) return "上周";
    return "更早";
  }
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (isThisWeek) return "This week";
  if (isLastWeek) return "Last week";
  return "Earlier";
}

function formatDate(timestamp: number, locale: ResolvedLocale): string {
  return new Date(timestamp).toLocaleDateString(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function formatWeekday(timestamp: number, locale: ResolvedLocale): string {
  return new Date(timestamp).toLocaleDateString(locale, {
    weekday: "short",
  });
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isJsonOnlyText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function isLowValueReviewText(value: string | undefined): boolean {
  const text = cleanText(value);
  if (!text) return true;
  const lower = text.toLowerCase();
  return (
    lower.startsWith("the following is the codex agent history whose request action you are assessing") ||
    lower.startsWith("the following is the codex agent history added since your last approval assessment") ||
    lower.startsWith("<local-command-caveat>") ||
    lower.startsWith("caveat: the messages below were generated by the user") ||
    lower.startsWith("# files mentioned by the user") ||
    lower.startsWith("files mentioned by the user") ||
    lower.startsWith("wall time:") ||
    lower.startsWith("process exited with code") ||
    lower.startsWith("chunk id:") ||
    lower.startsWith("auto-inferred:") ||
    lower.includes("/users/") ||
    lower === "exec_command completed" ||
    lower === "write_stdin completed" ||
    lower === "working" ||
    isJsonOnlyText(text)
  );
}

const LOW_VALUE_USER_PROMPTS = new Set([
  "ok",
  "okay",
  "yes",
  "y",
  "嗯",
  "嗯嗯",
  "好",
  "好的",
  "可以",
  "继续",
  "继续吧",
  "收到",
]);

function isLowValueUserPrompt(value: string | undefined): boolean {
  const text = cleanText(value);
  if (isLowValueReviewText(text)) return true;
  if (LOW_VALUE_USER_PROMPTS.has(text.toLowerCase())) return true;
  return text.length <= 1;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function normalizeStatus(status: string): SessionStatus {
  return isSessionStatus(status) ? status : "completed";
}

function fallbackTitle(row: DailyWorkReviewSource): string {
  return cleanText(
    row.managedTaskTitle ||
      row.titleLabel ||
      row.title ||
      row.task ||
      row.collapsedSummary ||
      `${row.tool} session`,
  );
}

function fallbackDetail(row: DailyWorkReviewSource, title: string): string {
  const summary = cleanText(row.collapsedSummary);
  if (summary && summary !== title && !isLowValueReviewText(summary)) {
    return truncate(summary, 128);
  }
  const item = row.activityItems?.find((activity) => !isLowValueReviewText(activity.body));
  const body = cleanText(item?.body);
  return body && body !== title ? truncate(body, 128) : "";
}

function promptDetail(row: DailyWorkReviewSource, title: string): string {
  const summary = cleanText(row.collapsedSummary);
  if (summary && summary !== title && !isLowValueReviewText(summary)) {
    return truncate(summary, 128);
  }
  return "";
}

function promptSummaries(row: DailyWorkReviewSource): UserPromptSummary[] {
  const persistedPrompts = row.userPrompts ?? [];
  const activityPrompts = row.activityItems
    ?.filter((activity) => activity.kind === "message" && activity.source === "user")
    .map((activity) => ({
      id: activity.id,
      body: activity.body,
      timestamp: activity.timestamp,
    })) ?? [];
  const prompts = persistedPrompts.length > 0 ? persistedPrompts : activityPrompts;
  return prompts
    .map((prompt, index) => ({
      id: cleanText(prompt.id) || String(index + 1),
      body: cleanText(prompt.body),
      timestamp: prompt.timestamp,
    }))
    .filter((prompt) => Number.isFinite(prompt.timestamp) && !isLowValueUserPrompt(prompt.body));
}

function entryAvailability(row: DailyWorkReviewSource): DailyWorkReviewEntry["availability"] {
  return row.shortId || row.timelineItems ? "current" : "history";
}

function entryProjectPath(row: DailyWorkReviewSource): string {
  return row.projectPath?.trim() || UNKNOWN_PROJECT_PATH;
}

function entryProjectName(row: DailyWorkReviewSource): string {
  const projectPath = entryProjectPath(row);
  if (isUnknownProjectPath(projectPath)) {
    return UNKNOWN_PROJECT_NAME;
  }
  return row.projectName?.trim() || projectPath;
}

function buildEntry(
  row: DailyWorkReviewSource,
  now: number,
  locale: ResolvedLocale,
  override?: { id: string; title: string; timestamp: number; promptBased?: boolean },
): DailyWorkReviewEntry {
  const title = truncate(cleanText(override?.title ?? fallbackTitle(row)), override?.promptBased ? 96 : 80);
  const status = normalizeStatus(row.status);
  const timing = computeSessionTiming({
    status: row.status,
    updatedAt: row.updatedAt,
    lastUserMessageAt: row.lastUserMessageAt,
    activityItems: row.activityItems,
    startedAt: row.startedAt,
    latestRunningStartedAt: row.latestRunningStartedAt,
    sessionDurationMs: row.sessionDurationMs,
    latestRunningDurationMs: row.latestRunningDurationMs,
  }, now);
  const latestRunningDurationLabel = formatSessionDuration(timing.latestRunningDurationMs, locale, {
    includeSeconds: true,
  });
  const sessionDurationLabel = formatSessionDuration(timing.sessionDurationMs, locale, {
    includeSeconds: status === "running",
  });
  return {
    id: override?.id ?? row.id,
    sessionId: row.id,
    title,
    detail: override?.promptBased ? promptDetail(row, title) : fallbackDetail(row, title),
    agent: row.tool,
    projectPath: entryProjectPath(row),
    projectName: entryProjectName(row),
    status,
    source: row.isManaged ? "managed" : "observed",
    availability: entryAvailability(row),
    timestamp: override?.timestamp ?? row.lastUserMessageAt ?? row.updatedAt,
    ...(latestRunningDurationLabel ? { latestRunningDurationLabel } : {}),
    ...(sessionDurationLabel ? { sessionDurationLabel } : {}),
  };
}

function buildEntries(
  row: DailyWorkReviewSource,
  now: number,
  locale: ResolvedLocale,
): DailyWorkReviewEntry[] {
  const prompts = promptSummaries(row);
  if (prompts.length > 0) {
    return prompts.map((prompt) =>
      buildEntry(row, now, locale, {
        id: `${row.id}:prompt:${prompt.id}`,
        title: prompt.body,
        timestamp: prompt.timestamp,
        promptBased: true,
      }),
    );
  }

  const title = fallbackTitle(row);
  if (isLowValueReviewText(title)) {
    return [];
  }
  return [buildEntry(row, now, locale)];
}

function isCompleted(status: SessionStatus): boolean {
  return status === "completed" || status === "idle";
}

function isOngoing(status: SessionStatus): boolean {
  return status === "running" || status === "waiting" || status === "offline";
}

function sortEntries(entries: DailyWorkReviewEntry[]): DailyWorkReviewEntry[] {
  return [...entries].sort((a, b) => b.timestamp - a.timestamp);
}

function tokenTotal(tokens?: UsageTokens): number {
  if (!tokens) return 0;
  if (typeof tokens.total === "number" && Number.isFinite(tokens.total)) {
    return tokens.total;
  }
  return [tokens.input, tokens.output, tokens.cachedInput, tokens.reasoningOutput]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
}

function estimateUsageCostFromPricing(session: SessionUsage, pricing: ModelPricing[]): number | undefined {
  if (!session.tokens) return undefined;
  return estimateTokenCost({
    agent: session.agent,
    model: session.model,
    inputTokens: session.tokens.input ?? 0,
    outputTokens: session.tokens.output ?? 0,
    cacheReadTokens: session.tokens.cachedInput ?? 0,
    cacheCreationTokens: 0,
  }, pricing);
}

type ReviewUsageStats = {
  totalTokens?: number;
  reportedCost?: number;
  estimatedCost?: number;
  costCurrency?: string;
};

function finalizeUsageStats({
  hasTokens,
  totalTokens,
  hasCost,
  hasEstimatedCost,
  costTotal,
  costCurrency,
  mixedCurrency,
}: {
  hasTokens: boolean;
  totalTokens: number;
  hasCost: boolean;
  hasEstimatedCost: boolean;
  costTotal: number;
  costCurrency?: string;
  mixedCurrency: boolean;
}): ReviewUsageStats {
  const roundedCost = Math.round(costTotal * 1_000_000) / 1_000_000;
  return {
    ...(hasTokens ? { totalTokens } : {}),
    ...(hasCost && hasEstimatedCost ? { estimatedCost: roundedCost } : {}),
    ...(hasCost && !hasEstimatedCost ? { reportedCost: roundedCost } : {}),
    ...(hasCost && costCurrency && !mixedCurrency ? { costCurrency } : {}),
  };
}

function mergeReviewUsageStats(primary: ReviewUsageStats, fallback: ReviewUsageStats): ReviewUsageStats {
  const fallbackHasAnalyticsUsage =
    fallback.totalTokens !== undefined ||
    fallback.reportedCost !== undefined ||
    fallback.estimatedCost !== undefined;
  if (fallbackHasAnalyticsUsage) {
    return fallback;
  }
  const primaryHasCost = primary.reportedCost !== undefined || primary.estimatedCost !== undefined;
  const fallbackCost = fallback.reportedCost !== undefined
    ? { reportedCost: fallback.reportedCost }
    : fallback.estimatedCost !== undefined
      ? { estimatedCost: fallback.estimatedCost }
      : {};
  return {
    totalTokens: primary.totalTokens ?? fallback.totalTokens,
    ...(primary.reportedCost !== undefined ? { reportedCost: primary.reportedCost } : {}),
    ...(primary.estimatedCost !== undefined ? { estimatedCost: primary.estimatedCost } : {}),
    ...(!primaryHasCost ? fallbackCost : {}),
    costCurrency: primary.costCurrency ?? fallback.costCurrency,
  };
}

function sumTokenTrendStatsForDay(
  dayKey: string,
  tokenTrendPoints: TokenTrendPoint[],
  pricing: ModelPricing[],
): ReviewUsageStats {
  let totalTokens = 0;
  let costTotal = 0;
  let hasTokens = false;
  let hasCost = false;
  let costCurrency: string | undefined;
  let mixedCurrency = false;

  for (const point of tokenTrendPoints) {
    if (dateKey(point.bucketStart) !== dayKey) continue;
    if (point.totalTokens > 0) {
      hasTokens = true;
      totalTokens += point.totalTokens;
    }
    const cost = estimateTrendPointCost(point, pricing);
    if (cost !== undefined) {
      hasCost = true;
      costTotal += cost;
      const currency = "USD";
      if (costCurrency && costCurrency !== currency) {
        mixedCurrency = true;
      }
      costCurrency = costCurrency ?? currency;
    }
  }

  return finalizeUsageStats({
    hasTokens,
    totalTokens,
    hasCost,
    hasEstimatedCost: hasCost,
    costTotal,
    costCurrency,
    mixedCurrency,
  });
}

function sumReviewUsageStats(
  entries: DailyWorkReviewEntry[],
  usageOverview: UsageOverview | null | undefined,
  pricing: ModelPricing[],
): ReviewUsageStats {
  const usageBySessionId = new Map((usageOverview?.sessions ?? []).map((session) => [session.sessionId, session]));
  let totalTokens = 0;
  let costTotal = 0;
  let hasTokens = false;
  let hasCost = false;
  let hasEstimatedCost = false;
  let costCurrency: string | undefined;
  let mixedCurrency = false;
  const countedSessionIds = new Set<string>();

  for (const entry of entries) {
    if (countedSessionIds.has(entry.sessionId)) {
      continue;
    }
    countedSessionIds.add(entry.sessionId);
    const usage = usageBySessionId.get(entry.sessionId);
    if (!usage) continue;

    const entryTokens = tokenTotal(usage.tokens);
    if (entryTokens > 0) {
      hasTokens = true;
      totalTokens += entryTokens;
    }

    const reportedCost = usage.cost?.reported;
    const estimatedCost = usage.cost?.estimated ?? estimateUsageCostFromPricing(usage, pricing);
    const cost = typeof reportedCost === "number" && Number.isFinite(reportedCost)
      ? reportedCost
      : typeof estimatedCost === "number" && Number.isFinite(estimatedCost)
        ? estimatedCost
        : undefined;
    if (cost !== undefined) {
      hasCost = true;
      costTotal += cost;
      if (cost === estimatedCost && reportedCost === undefined) {
        hasEstimatedCost = true;
      }
      const currency = usage.cost?.currency ?? (reportedCost === undefined ? "USD" : undefined);
      if (currency) {
        if (costCurrency && costCurrency !== currency) {
          mixedCurrency = true;
        }
        costCurrency = costCurrency ?? currency;
      }
    }
  }

  return finalizeUsageStats({
    hasTokens,
    totalTokens,
    hasCost,
    hasEstimatedCost,
    costTotal,
    costCurrency,
    mixedCurrency,
  });
}

function buildSummaryText(
  completed: DailyWorkReviewEntry[],
  ongoing: DailyWorkReviewEntry[],
  agents: string[],
  usageStats: ReviewUsageStats,
  locale: ResolvedLocale,
): string {
  const sessionCount = completed.length + ongoing.length;
  const totalTokens = usageStats.totalTokens ?? 0;
  const cost = usageStats.reportedCost ?? usageStats.estimatedCost;
  if (locale === "zh-CN") {
    if (sessionCount === 0) {
      return "这一天没有可回顾的已完成或跟进中会话。";
    }
    const statusParts = [
      completed.length > 0 ? `完成 ${completed.length}` : "",
      ongoing.length > 0 ? `跟进 ${ongoing.length}` : "",
    ].filter(Boolean);
    const summaryParts = [`${sessionCount} 个事项：${statusParts.join("、")}`, `${agents.length} 个 agent`];
    const usageParts: string[] = [];
    if (totalTokens > 0) {
      usageParts.push(`消耗 ${formatUsageTokens(totalTokens, locale)} token`);
    }
    if (cost !== undefined) {
      const costLabel = `${usageStats.estimatedCost !== undefined ? "估算费用" : "费用"} ${formatUsageCost(cost, {
        currency: usageStats.costCurrency,
        locale,
      })}`;
      usageParts.push(costLabel);
    }
    if (usageParts.length > 0) {
      summaryParts.push(usageParts.join("，"));
    }
    return `${summaryParts.join("；")}。`;
  }

  if (sessionCount === 0) {
    return "No completed or in-progress sessions to review for this day.";
  }
  const statusParts = [
    completed.length > 0 ? `${completed.length} completed` : "",
    ongoing.length > 0 ? `${ongoing.length} in progress` : "",
  ].filter(Boolean);
  const usageParts = [
    `${sessionCount} ${sessionCount === 1 ? "item" : "items"}: ${statusParts.join(", ")}`,
    `${agents.length} ${agents.length === 1 ? "agent" : "agents"}`,
  ];
  if (totalTokens > 0) {
    usageParts.push(`${formatUsageTokens(totalTokens, locale)} tokens`);
  }
  if (cost !== undefined) {
    usageParts.push(`${usageStats.estimatedCost !== undefined ? "est. " : ""}${formatUsageCost(cost, {
      currency: usageStats.costCurrency,
      locale,
    })}`);
  }
  return `${usageParts.join("; ")}.`;
}

export function buildDailyWorkReview(
  rows: Array<DailyWorkReviewSource | MonitorSessionRow>,
  options: BuildDailyWorkReviewOptions = {},
): DailyWorkReviewDay[] {
  const locale = options.locale ?? "en";
  const now = options.now ?? Date.now();
  const maxDays = options.maxDays ?? 14;
  const rangeStart =
    typeof options.rangeDays === "number" && options.rangeDays > 0
      ? startOfDay(now) - (Math.floor(options.rangeDays) - 1) * MS_PER_DAY
      : undefined;
  const pricing = options.pricing ?? options.usageOverview?.pricing ?? [];
  const grouped = new Map<string, DailyWorkReviewEntry[]>();
  const dedupedRows = new Map<string, DailyWorkReviewSource | MonitorSessionRow>();

  for (const row of rows) {
    dedupedRows.set(row.id, row);
  }

  for (const row of dedupedRows.values()) {
    const status = normalizeStatus(row.status);
    if (status === "error") {
      continue;
    }
    for (const entry of buildEntries(row, now, locale)) {
      if (!Number.isFinite(entry.timestamp)) {
        continue;
      }
      if (rangeStart !== undefined && entry.timestamp < rangeStart) {
        continue;
      }
      const isToday = startOfDay(entry.timestamp) === startOfDay(now);
      if (!isToday && !isCompleted(entry.status)) {
        continue;
      }
      const key = dateKey(entry.timestamp);
      grouped.set(key, [...(grouped.get(key) ?? []), entry]);
    }
  }

  return Array.from(grouped.entries())
    .map(([key, entries]) => {
      const sortedEntries = sortEntries(entries);
      const timestamp = sortedEntries[0]?.timestamp ?? now;
      const completed = sortedEntries.filter((entry) => isCompleted(entry.status));
      const ongoing = sortedEntries.filter((entry) => isOngoing(entry.status));
      const agents = Array.from(new Set(sortedEntries.map((entry) => entry.agent))).sort();
      const managedCount = sortedEntries.filter((entry) => entry.source === "managed").length;
      const liveUsageStats = sumReviewUsageStats([...completed, ...ongoing], options.usageOverview, pricing);
      const historicalUsageStats = sumTokenTrendStatsForDay(key, options.tokenTrendPoints ?? [], pricing);
      const usageStats = mergeReviewUsageStats(liveUsageStats, historicalUsageStats);

      return {
        key,
        isToday: startOfDay(timestamp) === startOfDay(now),
        dateLabel: formatDate(timestamp, locale),
        weekdayLabel: formatWeekday(timestamp, locale),
        relativeLabel: relativeLabel(timestamp, now, locale),
        summaryText: buildSummaryText(completed, ongoing, agents, usageStats, locale),
        sessionCount: sortedEntries.length,
        completedCount: completed.length,
        ongoingCount: ongoing.length,
        managedCount,
        observedCount: sortedEntries.length - managedCount,
        ...usageStats,
        agents,
        completed,
        ongoing,
        entries: sortedEntries,
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, maxDays);
}
