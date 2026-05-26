export type TokenTrendGranularity = "minute" | "hour" | "day";
export type AnalyticsMetric = "tokens" | "requests" | "cost" | "cacheHit";

export interface TokenTrendPoint {
  bucketStart: number;
  projectPath?: string;
  projectName?: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface TokenTrendResult {
  granularity: TokenTrendGranularity;
  points: TokenTrendPoint[];
  sourcePointCount: number;
}

export type WorkHealthSignalKind =
  | "attention"
  | "longest_wait"
  | "unrecovered_failure"
  | "context_near_full"
  | "cost_anomaly";

export interface WorkHealthSignal {
  kind: WorkHealthSignalKind;
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "info" | "warning" | "danger";
  sessionIds: string[];
  disabledReason?: string;
}

export interface WorkHealthSummary {
  generatedAt: number;
  selectedRange: { startMs: number; endMs: number };
  previousRange: { startMs: number; endMs: number };
  signals: WorkHealthSignal[];
}
