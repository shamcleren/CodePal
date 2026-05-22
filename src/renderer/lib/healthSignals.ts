import type { WorkItemList } from "../../shared/workItems";
import type { DailyTokenStats } from "../../shared/usageTypes";

export interface TokenDelta {
  current: number;
  previous: number;
  pctChange: number;
}

export interface HealthSignals {
  attentionCount: number;
  longestWaitMin: number;
  failedCount: number;
  tokenDelta: TokenDelta | null;
}

/**
 * Derive health signals from live work items and historical daily data.
 */
export function deriveHealthSignals(
  workItemList: WorkItemList,
  dailyTokens: DailyTokenStats[],
  currentRange: { startMs: number; endMs: number },
): HealthSignals {
  const activeItems = workItemList.items.filter(
    (i) => i.state === "waiting" || i.state === "needs_follow_up" || i.state === "failed",
  );

  const attentionCount = activeItems.filter(
    (i) => i.priority === "critical" || i.priority === "high",
  ).length;

  const waitItems = workItemList.items.filter(
    (i) => i.state === "waiting" || i.state === "needs_follow_up",
  );
  const longestWaitMin =
    waitItems.length > 0
      ? Math.round(Math.max(...waitItems.map((i) => i.durationMs)) / 60_000)
      : 0;

  const failedCount = workItemList.counts.failed;

  const tokenDelta = computeTokenDelta(dailyTokens, currentRange);

  return { attentionCount, longestWaitMin, failedCount, tokenDelta };
}

function computeTokenDelta(
  dailyTokens: DailyTokenStats[],
  currentRange: { startMs: number; endMs: number },
): TokenDelta | null {
  const rangeDays = Math.max(
    1,
    Math.round((currentRange.endMs - currentRange.startMs) / 86_400_000),
  );
  const previousStartMs = currentRange.startMs - rangeDays * 86_400_000;
  const previousEndMs = currentRange.startMs - 1;

  const startDate = new Date(currentRange.startMs).toISOString().slice(0, 10);
  const endDate = new Date(currentRange.endMs).toISOString().slice(0, 10);
  const prevStartDate = new Date(previousStartMs).toISOString().slice(0, 10);
  const prevEndDate = new Date(previousEndMs).toISOString().slice(0, 10);

  let current = 0;
  let previous = 0;

  for (const row of dailyTokens) {
    if (row.date >= startDate && row.date <= endDate) {
      current += row.totalTokens;
    } else if (row.date >= prevStartDate && row.date <= prevEndDate) {
      previous += row.totalTokens;
    }
  }

  if (previous === 0) {
    return current > 0 ? { current, previous: 0, pctChange: 100 } : null;
  }

  const pctChange = Math.round(((current - previous) / previous) * 100);
  return { current, previous, pctChange };
}
