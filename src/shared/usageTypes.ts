export type UsageSource = "session-derived" | "statusline-derived" | "provider-derived";

export interface UsageTokens {
  input?: number;
  output?: number;
  total?: number;
  cachedInput?: number;
  reasoningOutput?: number;
}

export interface UsageContext {
  used?: number;
  max?: number;
  percent?: number;
}

export interface UsageCost {
  reported?: number;
  estimated?: number;
  currency?: string;
}

export interface UsageRateLimit {
  remaining?: number;
  limit?: number;
  usedPercent?: number;
  resetAt?: number;
  windowLabel?: string;
  planType?: string;
  windows?: Array<{
    key: string;
    label: string;
    usedPercent?: number;
    resetAt?: number;
    remaining?: number;
    limit?: number;
    windowLabel?: string;
    planType?: string;
  }>;
}

export interface UsageSnapshot {
  agent: string;
  sessionId?: string;
  source: UsageSource;
  updatedAt: number;
  title?: string;
  tokens?: UsageTokens;
  context?: UsageContext;
  cost?: UsageCost;
  rateLimit?: UsageRateLimit;
  meta?: Record<string, unknown>;
}

export type UsageCompleteness = "minimal" | "partial" | "full";

export interface SessionUsage {
  agent: string;
  sessionId: string;
  title?: string;
  model?: string;
  updatedAt: number;
  sources: UsageSource[];
  completeness: UsageCompleteness;
  tokens?: UsageTokens;
  context?: UsageContext;
  cost?: UsageCost;
  rateLimit?: UsageRateLimit;
}

export interface UsageOverviewSummary {
  updatedAt?: number;
  tokens?: UsageTokens;
  cost?: UsageCost;
  rateLimits: Array<{
    agent: string;
    remaining?: number;
    limit?: number;
    usedPercent?: number;
    resetAt?: number;
    windowLabel?: string;
    planType?: string;
  }>;
  contextMode: "none" | "single-session" | "multi-session";
  context?: UsageContext;
}

export interface UsageOverview {
  updatedAt?: number;
  summary: UsageOverviewSummary;
  sessions: SessionUsage[];
  pricing?: ModelPricing[];
}

export interface TokenUsageWrite {
  sessionId: string;
  agent: string;
  model?: string;
  timestamp: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  sourceKind?: string;
  sourceKey?: string;
}

export interface DailyTokenStats {
  date: string;
  agent: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface ModelTokenStats {
  model: string;
  agent: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface AgentTokenStats {
  agent: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface SessionTokenStats {
  sessionId: string;
  title?: string;
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
}

export interface UsageImportStatus {
  completedAt: number | null;
  claudeRowsImported: number;
  codexRowsImported: number;
  lastError: string | null;
}

export interface ModelPricing {
  modelId: string;
  displayName: string;
  inputPerMillion: string;
  outputPerMillion: string;
  cacheReadPerMillion: string;
  cacheCreationPerMillion: string;
}

export interface TokenStatsRange {
  start: number;
  end: number;
}

export interface SessionStatsEntry {
  agent: string;
  status: string;
  count: number;
}

export interface TokenStatsResult {
  daily: DailyTokenStats[];
  byModel: ModelTokenStats[];
  byAgent: AgentTokenStats[];
  topSessions: SessionTokenStats[];
  importStatus: UsageImportStatus;
  pricing: ModelPricing[];
}
