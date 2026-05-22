import type { ModelPricing } from "./usageTypes";

/** Data provenance: how this fact was obtained */
export type FactSource = "live" | "backfill" | "estimated" | "manual";

/** Granularity of the report */
export type ReportGranularity = "daily" | "weekly" | "monthly";

/** Token usage breakdown for a single entity (agent, model, day, or session) */
export interface TokenFacts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  requestCount: number;
}

/** Cost estimate attached to a token usage block */
export interface CostFacts {
  estimatedUsd: number;
  pricingSource: "model-pricing" | "fallback" | "none";
}

/** Per-day token usage row */
export interface DailyFactRow {
  date: string;
  agent: string;
  tokens: TokenFacts;
  cost: CostFacts;
  source: FactSource;
}

/** Per-agent aggregated usage */
export interface AgentFactRow {
  agent: string;
  tokens: TokenFacts;
  cost: CostFacts;
}

/** Per-model aggregated usage */
export interface ModelFactRow {
  model: string;
  agent: string;
  tokens: TokenFacts;
  cost: CostFacts;
}

/** Session status distribution */
export interface SessionStatusFacts {
  running: number;
  waiting: number;
  completed: number;
  error: number;
  idle: number;
  offline: number;
  total: number;
}

/** Notable operation logged during the period */
export interface OperationFactEntry {
  sessionId: string;
  action: string;
  ok: boolean;
  timestamp: number;
  error?: string;
  detail?: string;
}

/** Follow-up or action-needed signal */
export interface FollowUpFactEntry {
  sessionId: string;
  reason: "waiting" | "error" | "idle_too_long" | "no_outcome";
  since: number;
}

/** Coverage metadata for the report */
export interface CoverageFacts {
  /** Number of sessions with live (real-time) usage data */
  liveSessionCount: number;
  /** Number of sessions with only backfilled usage data */
  backfillSessionCount: number;
  /** Number of sessions with estimated (no pricing match) costs */
  estimatedCostSessionCount: number;
  /** Whether all known sessions in the range are covered */
  complete: boolean;
  /** Human-readable notes about missing data */
  gaps: string[];
}

/** Top sessions by token usage */
export interface TopSessionFactRow {
  sessionId: string;
  title: string | null;
  agent: string;
  model: string;
  tokens: TokenFacts;
  cost: CostFacts;
  duration: number | null;
}

/**
 * The complete deterministic Report Facts object.
 * This is the only supported input to LLM report generation.
 * Every field is derived from persisted data — no LLM inference.
 */
export interface ReportFacts {
  /** Report granularity */
  granularity: ReportGranularity;
  /** ISO date range start (inclusive), e.g. "2026-05-12" */
  startDate: string;
  /** ISO date range end (inclusive), e.g. "2026-05-18" */
  endDate: string;
  /** When the facts were generated */
  generatedAt: number;

  /** Aggregate token usage across the entire range */
  aggregate: TokenFacts & CostFacts;
  /** Per-day breakdown */
  daily: DailyFactRow[];
  /** Per-agent breakdown */
  byAgent: AgentFactRow[];
  /** Per-model breakdown */
  byModel: ModelFactRow[];

  /** Session status distribution */
  sessionStatus: SessionStatusFacts;
  /** Top sessions by token usage */
  topSessions: TopSessionFactRow[];

  /** Operations executed during this period */
  operations: OperationFactEntry[];
  /** Items needing follow-up */
  followUps: FollowUpFactEntry[];

  /** Data coverage and provenance */
  coverage: CoverageFacts;
}

export type ReportFactsInput = {
  granularity: ReportGranularity;
  startDate: string;
  endDate: string;
  daily: Array<{
    date: string;
    agent: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    requestCount: number;
  }>;
  byModel: Array<{
    model: string;
    agent: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    requestCount: number;
  }>;
  byAgent: Array<{
    agent: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    requestCount: number;
  }>;
  sessionStats: Array<{ agent: string; status: string; count: number }>;
  topSessions: Array<{
    sessionId: string;
    title: string | null;
    agent: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    requestCount: number;
    firstSeenAt: number;
    lastSeenAt: number;
  }>;
  operations?: OperationFactEntry[];
  followUps?: FollowUpFactEntry[];
  pricing: ModelPricing[];
  importStatus?: {
    completedAt: number | null;
    claudeRowsImported: number;
    codexRowsImported: number;
  };
};

function estimateCost(
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  },
  pricingMap: Map<string, ModelPricing>,
  model?: string,
): CostFacts {
  const pricing = (model ? pricingMap.get(model) : null) ?? pricingMap.get("claude-sonnet-4-5-20250929");
  if (!pricing) return { estimatedUsd: 0, pricingSource: "none" };
  const cost =
    (tokens.inputTokens / 1_000_000) * Number(pricing.inputPerMillion) +
    (tokens.outputTokens / 1_000_000) * Number(pricing.outputPerMillion) +
    (tokens.cacheReadTokens / 1_000_000) * Number(pricing.cacheReadPerMillion) +
    (tokens.cacheCreationTokens / 1_000_000) * Number(pricing.cacheCreationPerMillion);
  return {
    estimatedUsd: Math.round(cost * 100) / 100,
    pricingSource: model && pricingMap.has(model) ? "model-pricing" : "fallback",
  };
}

function sumTokens(
  rows: Array<{
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    requestCount: number;
  }>,
): TokenFacts {
  const result: TokenFacts = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    requestCount: 0,
  };
  for (const row of rows) {
    result.inputTokens += row.inputTokens;
    result.outputTokens += row.outputTokens;
    result.cacheReadTokens += row.cacheReadTokens;
    result.cacheCreationTokens += row.cacheCreationTokens;
    result.totalTokens += row.totalTokens;
    result.requestCount += row.requestCount;
  }
  return result;
}

export function buildReportFacts(input: ReportFactsInput): ReportFacts {
  const pricingMap = new Map<string, ModelPricing>();
  for (const p of input.pricing) {
    pricingMap.set(p.modelId, p);
  }

  // Aggregate tokens across all daily rows
  const aggregateTokens = sumTokens(input.daily);
  const aggregateCost = estimateCost(
    {
      inputTokens: aggregateTokens.inputTokens,
      outputTokens: aggregateTokens.outputTokens,
      cacheReadTokens: aggregateTokens.cacheReadTokens,
      cacheCreationTokens: aggregateTokens.cacheCreationTokens,
    },
    pricingMap,
  );

  // Per-day rows with cost and source
  const hasBackfill = input.importStatus?.completedAt != null;
  const daily: DailyFactRow[] = input.daily.map((row) => ({
    date: row.date,
    agent: row.agent,
    tokens: {
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      reasoningTokens: row.reasoningTokens,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
    },
    cost: estimateCost(row, pricingMap),
    source: (hasBackfill ? "backfill" : "live") as FactSource,
  }));

  // Per-agent rows
  const byAgent: AgentFactRow[] = input.byAgent.map((row) => ({
    agent: row.agent,
    tokens: {
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      reasoningTokens: 0,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
    },
    cost: estimateCost(row, pricingMap),
  }));

  // Per-model rows
  const byModel: ModelFactRow[] = input.byModel.map((row) => ({
    model: row.model,
    agent: row.agent,
    tokens: {
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      reasoningTokens: 0,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
    },
    cost: estimateCost(row, pricingMap, row.model),
  }));

  // Session status distribution
  const sessionStatus: SessionStatusFacts = {
    running: 0,
    waiting: 0,
    completed: 0,
    error: 0,
    idle: 0,
    offline: 0,
    total: 0,
  };
  for (const stat of input.sessionStats) {
    const key = stat.status as keyof Omit<SessionStatusFacts, "total">;
    if (key in sessionStatus && key !== "total") {
      sessionStatus[key] += stat.count;
      sessionStatus.total += stat.count;
    }
  }

  // Top sessions
  const topSessions: TopSessionFactRow[] = input.topSessions.map((row) => ({
    sessionId: row.sessionId,
    title: row.title,
    agent: row.agent,
    model: row.model,
    tokens: {
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      reasoningTokens: 0,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
    },
    cost: estimateCost(row, pricingMap, row.model),
    duration: row.lastSeenAt > row.firstSeenAt ? row.lastSeenAt - row.firstSeenAt : null,
  }));

  // Coverage
  const liveCount = hasBackfill ? 0 : input.topSessions.length;
  const backfillCount = hasBackfill ? input.topSessions.length : 0;
  const gaps: string[] = [];
  if (hasBackfill && !input.importStatus?.completedAt) {
    gaps.push("History backfill is still in progress");
  }
  const coverage: CoverageFacts = {
    liveSessionCount: liveCount,
    backfillSessionCount: backfillCount,
    estimatedCostSessionCount: 0,
    complete: gaps.length === 0,
    gaps,
  };

  return {
    granularity: input.granularity,
    startDate: input.startDate,
    endDate: input.endDate,
    generatedAt: Date.now(),
    aggregate: { ...aggregateTokens, ...aggregateCost },
    daily,
    byAgent,
    byModel,
    sessionStatus,
    topSessions,
    operations: input.operations ?? [],
    followUps: input.followUps ?? [],
    coverage,
  };
}
