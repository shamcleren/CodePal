import type { TokenStatsResult, UsageOverview, ModelPricing } from "./usageTypes";
import type { WorkItem, WorkItemList } from "./workItems";
import type { WorkHealthSignal, WorkHealthSummary } from "./analyticsTypes";
import { estimateTokenCost } from "./modelPricing";

const CONTEXT_WARNING_PERCENT = 85;

export function deriveAnalyticsWorkHealth({
  workItemList,
  usageOverview,
  currentStats,
  previousStats,
  selectedRange,
}: {
  workItemList: WorkItemList;
  usageOverview: UsageOverview | null;
  currentStats: TokenStatsResult;
  previousStats: TokenStatsResult;
  selectedRange: { startMs: number; endMs: number };
}): WorkHealthSummary {
  const duration = Math.max(1, selectedRange.endMs - selectedRange.startMs);
  const previousRange = {
    startMs: selectedRange.startMs - duration,
    endMs: selectedRange.startMs - 1,
  };
  const activeItems = workItemList.items.filter(isActiveWorkItem);
  const attentionItems = activeItems.filter(
    (item) => item.priority === "critical" || item.priority === "high",
  );
  const waitingItems = workItemList.items.filter(
    (item) => item.state === "waiting" || item.state === "needs_follow_up",
  );
  const failedItems = workItemList.items.filter((item) => item.state === "failed");
  const contextSessions = (usageOverview?.sessions ?? []).filter(
    (session) => (session.context?.percent ?? 0) >= CONTEXT_WARNING_PERCENT,
  );
  const currentCost = estimateStatsCost(currentStats);
  const previousCost = estimateStatsCost(previousStats);

  return {
    generatedAt: Date.now(),
    selectedRange,
    previousRange,
    signals: [
      {
        kind: "attention",
        label: "Attention",
        value: String(attentionItems.length),
        detail:
          attentionItems.length > 0
            ? `${attentionItems.length} active item${attentionItems.length === 1 ? "" : "s"} need review`
            : "No waiting or failed items need review",
        tone: attentionItems.length > 0 ? "warning" : "neutral",
        sessionIds: sortedSessionIds(attentionItems),
      },
      longestWaitSignal(waitingItems),
      {
        kind: "unrecovered_failure",
        label: "Unrecovered failures",
        value: String(failedItems.length),
        detail:
          failedItems.length > 0
            ? `${failedItems.length} failed session${failedItems.length === 1 ? "" : "s"} without recovery`
            : "No unrecovered failures in the current session set",
        tone: failedItems.length > 0 ? "danger" : "neutral",
        sessionIds: sortedSessionIds(failedItems),
      },
      contextSignal(contextSessions),
      costSignal(currentCost, previousCost),
    ],
  };
}

function isActiveWorkItem(item: WorkItem): boolean {
  return item.state === "waiting" || item.state === "needs_follow_up" || item.state === "failed";
}

function sortedSessionIds(items: WorkItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.sessionId))).sort();
}

function longestWaitSignal(waitingItems: WorkItem[]): WorkHealthSignal {
  if (waitingItems.length === 0) {
    return {
      kind: "longest_wait",
      label: "Longest wait",
      value: "—",
      detail: "No session is currently waiting",
      tone: "neutral",
      sessionIds: [],
    };
  }
  const longest = waitingItems.reduce((max, item) =>
    item.durationMs > max.durationMs ? item : max,
  waitingItems[0]);
  const minutes = Math.max(1, Math.round(longest.durationMs / 60_000));
  return {
    kind: "longest_wait",
    label: "Longest wait",
    value: `${minutes}m`,
    detail: `${longest.title} has been waiting for ${minutes}m`,
    tone: minutes >= 30 ? "warning" : "info",
    sessionIds: [longest.sessionId],
  };
}

function contextSignal(
  sessions: NonNullable<UsageOverview["sessions"]>,
): WorkHealthSignal {
  if (sessions.length === 0) {
    return {
      kind: "context_near_full",
      label: "Context near full",
      value: "—",
      detail: "No live context source is available above the warning threshold",
      tone: "neutral",
      sessionIds: [],
      disabledReason: "No live context source above the warning threshold",
    };
  }

  const highest = sessions.reduce((max, session) =>
    (session.context?.percent ?? 0) > (max.context?.percent ?? 0) ? session : max,
  sessions[0]);
  const percent = Math.round(highest.context?.percent ?? 0);
  return {
    kind: "context_near_full",
    label: "Context near full",
    value: `${percent}%`,
    detail: `${sessions.length} session${sessions.length === 1 ? "" : "s"} above ${CONTEXT_WARNING_PERCENT}% context`,
    tone: "warning",
    sessionIds: Array.from(new Set(sessions.map((session) => session.sessionId).filter(Boolean))).sort(),
  };
}

function costSignal(currentCost: number, previousCost: number): WorkHealthSignal {
  if (currentCost <= 0 && previousCost <= 0) {
    return {
      kind: "cost_anomaly",
      label: "Cost anomaly",
      value: "—",
      detail: "No estimated cost in the selected range or previous equal-length range",
      tone: "neutral",
      sessionIds: [],
    };
  }
  if (previousCost <= 0) {
    return {
      kind: "cost_anomaly",
      label: "Cost anomaly",
      value: "New",
      detail: "New cost activity; no previous equal-length baseline",
      tone: currentCost > 0 ? "info" : "neutral",
      sessionIds: [],
    };
  }

  const pctChange = Math.round(((currentCost - previousCost) / previousCost) * 100);
  return {
    kind: "cost_anomaly",
    label: "Cost anomaly",
    value: `${pctChange >= 0 ? "+" : ""}${pctChange}%`,
    detail: "vs previous equal-length range",
    tone: Math.abs(pctChange) >= 50 ? "warning" : "info",
    sessionIds: [],
  };
}

function estimateStatsCost(stats: TokenStatsResult): number {
  return stats.byModel.reduce((sum, modelStats) => {
    return sum + estimateCost(modelStats, stats.pricing);
  }, 0);
}

function estimateCost(
  stats: {
    agent?: string;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  },
  pricing: ModelPricing[],
): number {
  return estimateTokenCost(stats, pricing, { allowModelFallback: false }) ?? 0;
}
