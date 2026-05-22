import type { SessionRecord, ActionLogEntry } from "./sessionTypes";

/** The lifecycle state of a work item */
export type WorkItemState =
  | "waiting"
  | "needs_follow_up"
  | "failed"
  | "completed"
  | "deferred";

/** How urgently the user should attend to this item */
export type WorkItemPriority = "critical" | "high" | "medium" | "low";

/** A derived work item from session data */
export interface WorkItem {
  /** Derived from the source session id */
  id: string;
  /** The session that produced this work item */
  sessionId: string;
  /** Agent that owns the session */
  agent: string;
  /** Current lifecycle state */
  state: WorkItemState;
  /** Priority based on age, status, and signals */
  priority: WorkItemPriority;
  /** Concise title for scanning */
  title: string;
  /** Optional one-line next action suggestion */
  nextAction: string | null;
  /** Repository or project path when available */
  project: string | null;
  /** When this state was first detected */
  since: number;
  /** Most recent activity timestamp */
  lastActivity: number;
  /** Duration in the current state (ms) */
  durationMs: number;
  /** Action log entries from CodePal operations */
  recentActions: ActionLogEntry[];
  /** Whether the session has pending user actions */
  hasPendingActions: boolean;
}

/** The final work item list grouped by state */
export interface WorkItemList {
  items: WorkItem[];
  /** Items grouped by state for convenience */
  byState: Record<WorkItemState, WorkItem[]>;
  /** Count of items in each state */
  counts: Record<WorkItemState, number>;
  /** When the list was generated */
  generatedAt: number;
}

function deriveState(session: SessionRecord, now: number): WorkItemState {
  // Error state → failed
  if (session.status === "error") return "failed";

  // Pending actions → waiting
  if (session.pendingActions && session.pendingActions.length > 0) return "waiting";
  if (session.externalApproval) return "waiting";

  // Running with no recent activity for >10min → needs_follow_up
  if (session.status === "running" && session.updatedAt && now - session.updatedAt > 10 * 60 * 1000) {
    return "needs_follow_up";
  }

  // Idle is often a restored or terminal-looking local state, not an actionable signal.
  if (session.status === "idle") return "completed";

  // Offline → deferred
  if (session.status === "offline") return "deferred";

  // Completed with no clear outcome → completed
  if (session.status === "completed") return "completed";

  // Waiting → waiting
  if (session.status === "waiting") return "waiting";

  // Default: running session is not a work item
  return "completed";
}

function derivePriority(state: WorkItemState, durationMs: number): WorkItemPriority {
  switch (state) {
    case "waiting":
      return durationMs > 30 * 60 * 1000 ? "critical" : "high";
    case "failed":
      return "critical";
    case "needs_follow_up":
      return durationMs > 60 * 60 * 1000 ? "high" : "medium";
    case "deferred":
      return "low";
    case "completed":
      return "low";
  }
}

function deriveTitle(session: SessionRecord): string {
  if (session.title) return session.title;
  if (session.task) return session.task;

  // Fall back to last meaningful activity item
  const items = session.activityItems;
  if (items && items.length > 0) {
    const lastUser = [...items].reverse().find(
      (item) => item.source === "user" && item.kind === "message",
    );
    if (lastUser) return truncate(lastUser.title || lastUser.body, 80);

    const last = items[items.length - 1];
    return truncate(last.title || last.body, 80);
  }

  return `${session.tool} session`;
}

function deriveNextAction(session: SessionRecord, state: WorkItemState): string | null {
  switch (state) {
    case "waiting":
      if (session.pendingActions?.length) {
        return `Respond to: ${session.pendingActions[0].title}`;
      }
      if (session.externalApproval) {
        return "Approve in original tool";
      }
      return "Check session status";
    case "failed":
      return "Review error and decide next step";
    case "needs_follow_up":
      return "Check progress or resume";
    case "deferred":
      return "Session is offline — resume when ready";
    case "completed":
      return null;
  }
}

function deriveProject(session: SessionRecord): string | null {
  // Try workspace path from external approval
  if (session.externalApproval?.jumpTarget?.workspacePath) {
    return session.externalApproval.jumpTarget.workspacePath;
  }
  // Try terminal context window title
  if (session.terminalContext?.windowTitle) {
    return session.terminalContext.windowTitle;
  }
  return null;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function isActiveState(state: WorkItemState): boolean {
  return state === "waiting" || state === "needs_follow_up" || state === "failed";
}

/**
 * Derive work items from session records.
 * Running sessions with no issues are excluded.
 * Only sessions that need attention produce work items.
 */
export function deriveWorkItems(
  sessions: SessionRecord[],
  now = Date.now(),
): WorkItemList {
  const items: WorkItem[] = [];

  for (const session of sessions) {
    const state = deriveState(session, now);
    // Only include sessions that need attention or are in a terminal state
    if (state === "completed" && !session.actionLog?.length) continue;

    const since = session.updatedAt ?? now;
    const durationMs = now - since;
    const priority = derivePriority(state, durationMs);

    items.push({
      id: `wi-${session.id}`,
      sessionId: session.id,
      agent: session.tool,
      state,
      priority,
      title: deriveTitle(session),
      nextAction: deriveNextAction(session, state),
      project: deriveProject(session),
      since,
      lastActivity: session.updatedAt ?? now,
      durationMs,
      recentActions: session.actionLog?.slice(-5) ?? [],
      hasPendingActions: Boolean(session.pendingActions?.length || session.externalApproval),
    });
  }

  // Sort: critical first, then by duration (longest first)
  const priorityOrder: Record<WorkItemPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  items.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.durationMs - a.durationMs;
  });

  const byState: Record<WorkItemState, WorkItem[]> = {
    waiting: [],
    needs_follow_up: [],
    failed: [],
    completed: [],
    deferred: [],
  };
  const counts: Record<WorkItemState, number> = {
    waiting: 0,
    needs_follow_up: 0,
    failed: 0,
    completed: 0,
    deferred: 0,
  };

  for (const item of items) {
    byState[item.state].push(item);
    counts[item.state]++;
  }

  return {
    items,
    byState,
    counts,
    generatedAt: now,
  };
}

/**
 * Count of items needing immediate attention (critical + high).
 */
export function attentionCount(list: WorkItemList): number {
  return list.items.filter(
    (item) => isActiveState(item.state) && (item.priority === "critical" || item.priority === "high"),
  ).length;
}
