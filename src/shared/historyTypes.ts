import type { ActivityItem } from "./sessionTypes";

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

export type HistoryDiagnostics = {
  enabled: boolean;
  dbPath: string;
  dbSizeBytes: number;
  estimatedSessionCount: number;
  estimatedActivityCount: number;
  lastCleanupAt: number | null;
};
