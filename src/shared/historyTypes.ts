import type { ActivityItem, SessionStatus } from "./sessionTypes";

export type SessionHistoryPageRequest = {
  sessionId: string;
  cursor?: string | null;
  limit?: number;
};

export type SessionHistoryPage = {
  items: ActivityItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type SessionHistorySummaryRequest = {
  maxAgeMs?: number;
  limit?: number;
};

export type SessionHistorySummary = {
  id: string;
  tool: string;
  status: SessionStatus;
  title?: string;
  task?: string;
  updatedAt: number;
  lastUserMessageAt?: number;
};

export type HistoryDiagnostics = {
  enabled: boolean;
  dbPath: string;
  dbSizeBytes: number;
  estimatedSessionCount: number;
  estimatedActivityCount: number;
  lastCleanupAt: number | null;
};
