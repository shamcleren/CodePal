import type { UsageOverview } from "../../shared/usageTypes";
import type { WorkItemList } from "../../shared/workItems";

export interface WorkHealthSessionTarget {
  sessionId: string;
  title: string;
}

export function buildWorkHealthSessionTargets(
  sessionIds: string[],
  workItemList?: WorkItemList,
  usageOverview?: UsageOverview | null,
): WorkHealthSessionTarget[] {
  const workItemsBySession = new Map(
    (workItemList?.items ?? []).map((item) => [item.sessionId, item]),
  );
  const usageBySession = new Map(
    (usageOverview?.sessions ?? []).map((session) => [session.sessionId, session]),
  );

  return Array.from(new Set(sessionIds)).map((sessionId) => {
    const workItem = workItemsBySession.get(sessionId);
    if (workItem) {
      return { sessionId, title: workItem.title };
    }

    const usageSession = usageBySession.get(sessionId);
    const title = usageSession?.title?.trim();
    if (title) {
      return { sessionId, title };
    }

    return {
      sessionId,
      title: usageSession?.agent
        ? `${usageSession.agent} session ${shortSessionId(sessionId)}`
        : `Session ${shortSessionId(sessionId)}`,
    };
  });
}

function shortSessionId(sessionId: string): string {
  return sessionId.length > 14
    ? `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}`
    : sessionId;
}
