import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import {
  type ActivityItem,
  type PendingAction,
  type PendingCloseReason,
  type PendingClosed,
  type ResponseTarget,
  type SessionRecord,
  type SessionStatus,
  isSessionStatus,
} from "./sessionTypes";

/** 无 responseTarget.timeoutMs 时用于计算 pending 过期时间 */
export const DEFAULT_PENDING_LIFECYCLE_TIMEOUT_MS = 25_000;
export const ACTIVE_SESSION_STALENESS_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const COMPLETED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
export const ERROR_SESSION_RETENTION_MS = 48 * 60 * 60 * 1000;
export const MAX_HISTORY_SESSION_COUNT = 150;
const MAX_ACTIVITY_ITEMS = 6;

export type SessionEvent = {
  type?: string;
  sessionId: string;
  tool: string;
  status: SessionStatus;
  title?: string;
  task?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
  activityItems?: ActivityItem[];
  /** 未出现则保留原值；null 表示清除 */
  pendingAction?: PendingAction | null;
  /** 与 pendingAction 同条事件可选携带；按 action upsert 时写入该 action 的运行时路由 */
  responseTarget?: ResponseTarget;
  /** 仅关闭该 action，不整会话清空 pending */
  pendingClosed?: PendingClosed;
};

type PendingActionRuntimeState = {
  action: PendingAction;
  responseTarget?: ResponseTarget;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  effectiveTimeoutMs: number;
};

type InternalSessionRecord = {
  id: string;
  tool: string;
  status: SessionStatus;
  title?: string;
  task?: string;
  updatedAt: number;
  lastUserMessageAt?: number;
  activityItems: ActivityItem[];
  activities: string[];
  pendingById: Map<string, PendingActionRuntimeState>;
  /** 最近关闭的 action（新 upsert 同 id 时会移除），供控制器去重 */
  closedLedger: Map<string, PendingCloseReason>;
};

export type PendingActionResponsePrep = {
  line: string;
  responseTarget?: ResponseTarget;
};

function capitalizeStatus(status: SessionStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function firstMetaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function activityMetaString(item: ActivityItem, key: string): string | undefined {
  const value = item.meta?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function eventTimestamp(event: SessionEvent): number {
  return event.timestamp;
}

function createActivityItem(
  partial: Omit<ActivityItem, "id" | "timestamp"> & { id?: string; timestamp?: number },
  event: SessionEvent,
): ActivityItem {
  return {
    id:
      partial.id ??
      `${event.sessionId}:${eventTimestamp(event)}:${partial.kind}:${partial.source}:${partial.title}`,
    timestamp: partial.timestamp ?? eventTimestamp(event),
    ...partial,
  };
}

function buildFallbackActivityItems(event: SessionEvent): ActivityItem[] {
  const items: ActivityItem[] = [];
  const task = event.task?.trim();
  const hookEventName = firstMetaString(event.meta, "hook_event_name");
  const notificationType = firstMetaString(event.meta, "notification_type");
  const toolName = firstMetaString(event.meta, "tool_name");
  const unsupportedActionType = firstMetaString(event.meta, "unsupported_action_type");
  const codexEventType = firstMetaString(event.meta, "codex_event_type");

  if (unsupportedActionType) {
    items.push(
      createActivityItem(
        {
          kind: "system",
          source: "system",
          title: "Unsupported Cursor action",
          body: task ?? `Unsupported Cursor action: ${unsupportedActionType}`,
          tone: "waiting",
        },
        event,
      ),
    );
  } else if (event.tool === "codex" && codexEventType === "user_message" && task) {
    items.push(
      createActivityItem(
        {
          kind: "message",
          source: "user",
          title: "User",
          body: task,
        },
        event,
      ),
    );
  } else if (
    event.tool === "codex" &&
    (codexEventType === "agent_message" || codexEventType === "task_complete") &&
    task
  ) {
    items.push(
      createActivityItem(
        {
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: task,
        },
        event,
      ),
    );
  } else if (hookEventName === "Notification" && notificationType) {
    items.push(
      createActivityItem(
        {
          kind: "note",
          source: "system",
          title: "Notification",
          body: task ?? capitalizeStatus(event.status),
          tone: "waiting",
          meta: { notificationType },
        },
        event,
      ),
    );
  } else if (hookEventName === "PreToolUse" && toolName) {
    items.push(
      createActivityItem(
        {
          kind: "tool",
          source: "tool",
          title: toolName,
          body: toolName,
          toolName,
          toolPhase: "call",
        },
        event,
      ),
    );
  } else if (hookEventName === "SessionStart") {
    items.push(
      createActivityItem(
        {
          kind: "system",
          source: "system",
          title: "Session started",
          body: task ?? "Session started",
        },
        event,
      ),
    );
  } else if (hookEventName === "SessionEnd") {
    items.push(
      createActivityItem(
        {
          kind: "system",
          source: "system",
          title: "Session ended",
          body: task ?? "Session ended",
        },
        event,
      ),
    );
  } else {
    items.push(
      createActivityItem(
        {
          kind: "note",
          source: "system",
          title: capitalizeStatus(event.status),
          body: task ?? capitalizeStatus(event.status),
          tone:
            event.status === "running" ||
            event.status === "completed" ||
            event.status === "waiting" ||
            event.status === "idle" ||
            event.status === "error"
              ? event.status
              : "system",
        },
        event,
      ),
    );
  }

  if (event.pendingAction && event.pendingAction !== null) {
    items.push(
      createActivityItem(
        {
          kind: "note",
          source: "system",
          title: "Pending action",
          body: event.pendingAction.title,
          tone: "waiting",
        },
        event,
      ),
    );
  }

  if (event.pendingClosed) {
    items.push(
      createActivityItem(
        {
          kind: "system",
          source: "system",
          title: "Action Closed",
          body: `Closed action ${event.pendingClosed.actionId} (${event.pendingClosed.reason})`,
        },
        event,
      ),
    );
  }

  return items;
}

function activityDedupKey(item: ActivityItem): string {
  return [
    item.kind,
    item.source,
    item.title.trim(),
    item.body.trim(),
    item.tone ?? "",
    item.toolName ?? "",
    item.toolPhase ?? "",
  ].join("|");
}

function mergeActivityItems(
  previous: ActivityItem[] | undefined,
  nextItems: ActivityItem[],
): ActivityItem[] {
  const seen = new Set<string>();
  const merged: ActivityItem[] = [];

  const ordered = [...nextItems, ...(previous ?? [])].sort((a, b) => b.timestamp - a.timestamp);

  for (const item of ordered) {
    const key = activityDedupKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
    if (merged.length >= MAX_ACTIVITY_ITEMS) {
      break;
    }
  }

  return merged;
}

function enrichCodexToolResults(
  previous: ActivityItem[] | undefined,
  nextItems: ActivityItem[],
): ActivityItem[] {
  const callNameById = new Map<string, string>();

  for (const item of [...nextItems, ...(previous ?? [])]) {
    const callId = activityMetaString(item, "callId");
    const toolName = item.toolName?.trim() || item.title.trim();
    if (!callId || item.kind !== "tool" || item.toolPhase !== "call" || !toolName) {
      continue;
    }
    if (!callNameById.has(callId)) {
      callNameById.set(callId, toolName);
    }
  }

  return nextItems.map((item) => {
    const callId = activityMetaString(item, "callId");
    if (
      !callId ||
      item.kind !== "tool" ||
      item.toolPhase !== "result" ||
      ((item.toolName && item.toolName !== "Tool") || item.title !== "Tool")
    ) {
      return item;
    }

    const resolvedToolName = callNameById.get(callId);
    if (!resolvedToolName) {
      return item;
    }

    return {
      ...item,
      title: resolvedToolName,
      toolName: resolvedToolName,
    };
  });
}

function prependActivityItem(previous: ActivityItem[] | undefined, item: ActivityItem): ActivityItem[] {
  return mergeActivityItems(previous, [item]);
}

function activityItemToLegacyLine(item: ActivityItem): string {
  if (item.kind === "message") {
    return `${item.title}: ${item.body}`;
  }
  if (item.kind === "tool") {
    return item.toolPhase === "call" ? `Tool call: ${item.toolName ?? item.title}` : item.body;
  }
  if (item.kind === "note") {
    return item.title === item.body ? item.body : `${item.title}: ${item.body}`;
  }
  return item.body;
}

function toLegacyActivities(activityItems: ActivityItem[]): string[] {
  return activityItems.map(activityItemToLegacyLine);
}

function toSessionRecord(internal: InternalSessionRecord): SessionRecord {
  const base: SessionRecord = {
    id: internal.id,
    tool: internal.tool,
    status: internal.status,
    ...(internal.title ? { title: internal.title } : {}),
    task: internal.task,
    updatedAt: internal.updatedAt,
    ...(internal.lastUserMessageAt !== undefined
      ? { lastUserMessageAt: internal.lastUserMessageAt }
      : {}),
    ...(internal.activityItems.length > 0 ? { activityItems: internal.activityItems } : {}),
    ...(internal.activities.length > 0 ? { activities: internal.activities } : {}),
  };
  if (internal.pendingById.size === 0) {
    return base;
  }
  return {
    ...base,
    pendingActions: [...internal.pendingById.values()].map((s) => s.action),
  };
}

function isCurrentStatus(status: SessionStatus): boolean {
  return status === "running" || status === "waiting";
}

function sessionRetentionMs(status: SessionStatus): number | null {
  if (status === "running" || status === "waiting") {
    return ACTIVE_SESSION_STALENESS_MS;
  }
  if (status === "error") {
    return ERROR_SESSION_RETENTION_MS;
  }
  if (status === "completed" || status === "idle" || status === "offline") {
    return COMPLETED_SESSION_RETENTION_MS;
  }
  return null;
}

function eventCarriesUserMessage(event: SessionEvent): boolean {
  if (event.activityItems?.some((item) => item.kind === "message" && item.source === "user")) {
    return true;
  }

  return (
    firstMetaString(event.meta, "codex_event_type") === "user_message" ||
    firstMetaString(event.meta, "hook_event_name") === "beforeSubmitPrompt" ||
    firstMetaString(event.meta, "hook_event_name") === "UserPromptSubmit"
  );
}

function statusPriority(status: SessionStatus): number {
  switch (status) {
    case "error":
      return 5;
    case "completed":
      return 4;
    case "idle":
      return 3;
    case "waiting":
      return 2;
    case "running":
      return 1;
    case "offline":
      return 0;
  }
}

function shouldPreservePreviousStatus(
  prev: InternalSessionRecord | undefined,
  event: SessionEvent,
): boolean {
  if (!prev) {
    return false;
  }

  if (event.timestamp < prev.updatedAt) {
    return true;
  }

  const statusSource = firstMetaString(event.meta, "jetbrains_status_source");
  if (
    statusSource === "activity" &&
    statusPriority(prev.status) >= statusPriority("idle") &&
    statusPriority(event.status) < statusPriority(prev.status)
  ) {
    return true;
  }

  if (event.timestamp === prev.updatedAt && statusPriority(event.status) < statusPriority(prev.status)) {
    return true;
  }

  return false;
}

function isJetBrainsTool(tool: string): boolean {
  return tool === "jetbrains" || tool === "goland" || tool === "pycharm";
}

function isMeaningfulAssistantBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) {
    return false;
  }
  return trimmed !== "正在整理回复" && trimmed !== "正在整理回复...";
}

function shouldHideNoiseSession(session: InternalSessionRecord): boolean {
  if (!isJetBrainsTool(session.tool)) {
    return false;
  }

  const hasUserMessage = session.activityItems.some(
    (item) => item.kind === "message" && item.source === "user" && item.body.trim().length > 0,
  );
  const hasAssistantContent = session.activityItems.some(
    (item) =>
      item.kind === "message" &&
      item.source === "assistant" &&
      isMeaningfulAssistantBody(item.body),
  );
  const hasToolResult = session.activityItems.some(
    (item) => item.kind === "tool" && item.toolPhase === "result",
  );
  const hasLifecycleOnly = session.activityItems.every(
    (item) =>
      item.kind === "system" ||
      (item.kind === "message" && item.source === "assistant" && !isMeaningfulAssistantBody(item.body)),
  );

  return !hasUserMessage && !hasAssistantContent && !hasToolResult && hasLifecycleOnly;
}

function latestUserMessageBody(session: InternalSessionRecord): string | undefined {
  const latest = session.activityItems
    .filter((item) => item.kind === "message" && item.source === "user")
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  const body = latest?.body.trim();
  return body ? body : undefined;
}

function hasMeaningfulAssistantContent(session: InternalSessionRecord): boolean {
  return session.activityItems.some(
    (item) =>
      item.kind === "message" &&
      item.source === "assistant" &&
      isMeaningfulAssistantBody(item.body),
  );
}

function hasToolResult(session: InternalSessionRecord): boolean {
  return session.activityItems.some((item) => item.kind === "tool" && item.toolPhase === "result");
}

function shouldHideCodeBuddyDuplicateShell(
  session: InternalSessionRecord,
  allSessions: InternalSessionRecord[],
): boolean {
  if (session.tool !== "codebuddy") {
    return false;
  }
  if (hasMeaningfulAssistantContent(session) || hasToolResult(session)) {
    return false;
  }

  const latestUserBody = latestUserMessageBody(session);
  if (!latestUserBody) {
    return false;
  }

  return allSessions.some((other) => {
    if (other.id === session.id || other.tool !== "codebuddy") {
      return false;
    }
    if (latestUserMessageBody(other) !== latestUserBody) {
      return false;
    }
    if (!hasMeaningfulAssistantContent(other) && !hasToolResult(other)) {
      return false;
    }
    return other.updatedAt >= session.updatedAt;
  });
}

export function createSessionStore() {
  const sessions = new Map<string, InternalSessionRecord>();

  function preparePendingActionResponse(
    sessionId: string,
    actionId: string,
    option: string,
  ): PendingActionResponsePrep | null {
    const internal = sessions.get(sessionId);
    const state = internal?.pendingById.get(actionId);
    if (!state) {
      return null;
    }
    const line = stringifyActionResponsePayload(sessionId, actionId, option, state.action.type);
    return {
      line,
      ...(state.responseTarget !== undefined
        ? { responseTarget: state.responseTarget }
        : {}),
    };
  }

  function completePendingActionResponse(sessionId: string, actionId: string): void {
    const internal = sessions.get(sessionId);
    if (!internal?.pendingById.has(actionId)) {
      return;
    }
    const now = Date.now();
    const nextActivityItems = prependActivityItem(internal.activityItems, {
      id: `${sessionId}:${now}:closed-local:${actionId}`,
      kind: "system",
      source: "system",
      title: "Action Closed",
      body: `Closed action ${actionId} (consumed_local)`,
      timestamp: now,
    });
    const nextMap = new Map(internal.pendingById);
    nextMap.delete(actionId);
    const nextLedger = new Map(internal.closedLedger);
    nextLedger.set(actionId, "consumed_local");
    sessions.set(sessionId, {
      ...internal,
      activityItems: nextActivityItems,
      activities: toLegacyActivities(nextActivityItems),
      pendingById: nextMap,
      closedLedger: nextLedger,
      updatedAt: now,
    });
  }

  function closePendingAction(
    sessionId: string,
    actionId: string,
    reason: PendingCloseReason,
  ): void {
    const internal = sessions.get(sessionId);
    if (!internal) {
      return;
    }
    const now = Date.now();
    const nextActivityItems = prependActivityItem(internal.activityItems, {
      id: `${sessionId}:${now}:closed:${actionId}:${reason}`,
      kind: "system",
      source: "system",
      title: "Action Closed",
      body: `Closed action ${actionId} (${reason})`,
      timestamp: now,
    });
    const nextMap = new Map(internal.pendingById);
    nextMap.delete(actionId);
    const nextLedger = new Map(internal.closedLedger);
    nextLedger.set(actionId, reason);
    sessions.set(sessionId, {
      ...internal,
      activityItems: nextActivityItems,
      activities: toLegacyActivities(nextActivityItems),
      pendingById: nextMap,
      closedLedger: nextLedger,
      updatedAt: now,
    });
  }

  function expireStalePendingActions(now: number): boolean {
    let expiredAny = false;
    for (const [sessionId, internal] of sessions) {
      const expiredIds: string[] = [];
      for (const [actionId, state] of internal.pendingById) {
        if (now >= state.expiresAt) {
          expiredIds.push(actionId);
        }
      }
      if (expiredIds.length === 0) {
        continue;
      }
      expiredAny = true;
      const nextMap = new Map(internal.pendingById);
      const nextLedger = new Map(internal.closedLedger);
      for (const id of expiredIds) {
        nextMap.delete(id);
        nextLedger.set(id, "expired");
      }
      sessions.set(sessionId, {
        ...internal,
        activityItems: mergeActivityItems(
          internal.activityItems,
          expiredIds.map((id) => ({
            id: `${sessionId}:${now}:expired:${id}`,
            kind: "system" as const,
            source: "system" as const,
            title: "Action Closed",
            body: `Closed action ${id} (expired)`,
            timestamp: now,
          })),
        ),
        activities: toLegacyActivities(
          mergeActivityItems(
            internal.activityItems,
            expiredIds.map((id) => ({
              id: `${sessionId}:${now}:expired:${id}:legacy`,
              kind: "system" as const,
              source: "system" as const,
              title: "Action Closed",
              body: `Closed action ${id} (expired)`,
              timestamp: now,
            })),
          ),
        ),
        pendingById: nextMap,
        closedLedger: nextLedger,
        updatedAt: now,
      });
    }
    return expiredAny;
  }

  function demoteStaleActiveSessions(now: number): boolean {
    let changed = false;
    for (const [sessionId, internal] of sessions) {
      if (internal.status !== "running") {
        continue;
      }
      if (internal.pendingById.size > 0) {
        continue;
      }
      if (now - internal.updatedAt <= ACTIVE_SESSION_IDLE_TIMEOUT_MS) {
        continue;
      }
      sessions.set(sessionId, {
        ...internal,
        status: "idle",
      });
      changed = true;
    }
    return changed;
  }

  function expireStaleSessions(now: number): boolean {
    const nextEntries = [...sessions.entries()]
      .filter(([, session]) => {
        const retentionMs = sessionRetentionMs(session.status);
        if (retentionMs === null) {
          return true;
        }
        return now - session.updatedAt < retentionMs;
      })
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt);

    const currentEntries = nextEntries.filter(([, session]) => isCurrentStatus(session.status));
    const historyEntries = nextEntries
      .filter(([, session]) => !isCurrentStatus(session.status))
      .slice(0, MAX_HISTORY_SESSION_COUNT);

    const nextMap = new Map<string, InternalSessionRecord>([...currentEntries, ...historyEntries]);
    if (nextMap.size === sessions.size) {
      return false;
    }

    sessions.clear();
    for (const [sessionId, session] of nextMap) {
      sessions.set(sessionId, session);
    }
    return true;
  }

  function clearHistorySessions(): boolean {
    const nextEntries = [...sessions.entries()].filter(([, session]) => isCurrentStatus(session.status));
    if (nextEntries.length === sessions.size) {
      return false;
    }

    sessions.clear();
    for (const [sessionId, session] of nextEntries) {
      sessions.set(sessionId, session);
    }
    return true;
  }

  function isPendingActionClosed(sessionId: string, actionId: string): boolean {
    return sessions.get(sessionId)?.closedLedger.has(actionId) ?? false;
  }

  return {
    applyEvent(event: SessionEvent) {
      if (!isSessionStatus(event.status)) {
        return;
      }
      const prev = sessions.get(event.sessionId);
      const nextClosedLedger = new Map(prev?.closedLedger ?? []);

      let nextPendingById: Map<string, PendingActionRuntimeState>;
      if (event.pendingAction === undefined) {
        nextPendingById = prev?.pendingById ?? new Map();
      } else if (event.pendingAction === null) {
        nextPendingById = new Map();
        for (const id of prev?.pendingById.keys() ?? []) {
          nextClosedLedger.set(id, "cancelled");
        }
      } else {
        nextPendingById = new Map(prev?.pendingById ?? new Map());
        const action = event.pendingAction;
        nextClosedLedger.delete(action.id);
        const existing = nextPendingById.get(action.id);
        const responseTarget =
          event.responseTarget !== undefined
            ? event.responseTarget
            : existing?.responseTarget;
        const effectiveTimeoutMs =
          event.responseTarget?.timeoutMs ??
          existing?.effectiveTimeoutMs ??
          DEFAULT_PENDING_LIFECYCLE_TIMEOUT_MS;
        const ts = event.timestamp;
        const createdAt = existing?.createdAt ?? ts;
        const lastSeenAt = ts;
        const expiresAt = lastSeenAt + effectiveTimeoutMs;
        nextPendingById.set(action.id, {
          action,
          responseTarget,
          createdAt,
          lastSeenAt,
          expiresAt,
          effectiveTimeoutMs,
        });
      }

      if (event.pendingClosed) {
        const { actionId, reason } = event.pendingClosed;
        if (nextPendingById.has(actionId)) {
          nextPendingById = new Map(nextPendingById);
          nextPendingById.delete(actionId);
        }
        nextClosedLedger.set(actionId, reason);
      }

      const nextActivityItems = mergeActivityItems(
        prev?.activityItems,
        event.tool === "codex"
          ? enrichCodexToolResults(
              prev?.activityItems,
              event.activityItems ?? buildFallbackActivityItems(event),
            )
          : (event.activityItems ?? buildFallbackActivityItems(event)),
      );
      const nextLastUserMessageAt = eventCarriesUserMessage(event)
        ? Math.max(prev?.lastUserMessageAt ?? Number.NEGATIVE_INFINITY, event.timestamp)
        : prev?.lastUserMessageAt;
      const preservePreviousStatus = shouldPreservePreviousStatus(prev, event);
      const nextUpdatedAt = Math.max(prev?.updatedAt ?? Number.NEGATIVE_INFINITY, event.timestamp);

      const internal: InternalSessionRecord = {
        id: event.sessionId,
        tool: event.tool,
        status: preservePreviousStatus ? prev.status : event.status,
        title:
          preservePreviousStatus && prev?.title
            ? prev.title
            : (event.title ?? prev?.title),
        task: preservePreviousStatus ? prev?.task : event.task,
        updatedAt: nextUpdatedAt,
        lastUserMessageAt: nextLastUserMessageAt,
        activityItems: nextActivityItems,
        activities: toLegacyActivities(nextActivityItems),
        pendingById: nextPendingById,
        closedLedger: nextClosedLedger,
      };
      sessions.set(event.sessionId, internal);
    },

    preparePendingActionResponse,

    completePendingActionResponse,

    closePendingAction,

    expireStalePendingActions,

    demoteStaleActiveSessions,

    expireStaleSessions,

    clearHistorySessions,

    isPendingActionClosed,

    /** 供尚未迁移到 prepare/complete 的调用方使用；等价于 prepare 后立刻 complete */
    respondToPendingAction(sessionId: string, actionId: string, option: string) {
      const prep = preparePendingActionResponse(sessionId, actionId, option);
      if (!prep) {
        return null;
      }
      completePendingActionResponse(sessionId, actionId);
      return prep.line;
    },

    getSession(sessionId: string): SessionRecord | null {
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }
      return toSessionRecord(session);
    },

    getSessions(): SessionRecord[] {
      const allSessions = [...sessions.values()];
      return allSessions
        .filter((session) => !shouldHideNoiseSession(session))
        .filter((session) => !shouldHideCodeBuddyDuplicateShell(session, allSessions))
        .sort((a, b) => {
          const aUserTs = a.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
          const bUserTs = b.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
          if (aUserTs !== bUserTs) {
            return bUserTs - aUserTs;
          }
          if (a.updatedAt !== b.updatedAt) {
            return b.updatedAt - a.updatedAt;
          }
          return a.id.localeCompare(b.id);
        })
        .map(toSessionRecord);
    },
  };
}
