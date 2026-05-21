import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import {
  type ActionLogEntry,
  type ActivityItem,
  type ExternalApprovalState,
  type PendingAction,
  type PendingCloseReason,
  type PendingClosed,
  type ResponseTarget,
  type SessionOutcome,
  type SessionRecord,
  type SessionStatus,
  type TerminalContext,
  isSessionStatus,
  isTerminalContext,
} from "./sessionTypes";

/**
 * 无 event.pendingLifetimeMs 时用于计算 pending 过期时间。与 hook 端
 * `blockingHookBridge.parseWaitMs` 的默认值对齐：hook 最多阻塞 2 分钟等用户决策，
 * UI 侧的 pending 卡片也在 2 分钟后过期（避免 UI 提前消失但 hook 还在等的错位）。
 */
export const DEFAULT_PENDING_LIFECYCLE_TIMEOUT_MS = 120_000;
export const ACTIVE_SESSION_STALENESS_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const COMPLETED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
export const ERROR_SESSION_RETENTION_MS = 48 * 60 * 60 * 1000;
export const MAX_HISTORY_SESSION_COUNT = 150;
const MAX_ACTIVITY_ITEMS = 6;
const CURSOR_SESSION_MERGE_WINDOW_MS = 30 * 60 * 1000;
const CODEX_SUBAGENT_MERGE_WINDOW_MS = 30 * 60 * 1000;

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
  /** 未出现时仅在会话仍保持 waiting 时保留；null 表示清除 */
  externalApproval?: ExternalApprovalState | null;
  /** 与 pendingAction 同条事件可选携带；按 action upsert 时写入该 action 的运行时路由 */
  responseTarget?: ResponseTarget;
  /**
   * pending action 在 UI 上的存活时间（毫秒）。与 hook 阻塞等待时长对齐，过期后
   * UI 自动清掉卡片并标记 closed。未提供时退化到 DEFAULT_PENDING_LIFECYCLE_TIMEOUT_MS。
   * 注意：这和 responseTarget.timeoutMs（socket 写回超时）是完全不同的两个时间。
   */
  pendingLifetimeMs?: number;
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
  meta?: Record<string, unknown>;
  updatedAt: number;
  lastUserMessageAt?: number;
  activityItems: ActivityItem[];
  activities: string[];
  pendingById: Map<string, PendingActionRuntimeState>;
  externalApproval?: ExternalApprovalState;
  /** 最近关闭的 action（新 upsert 同 id 时会移除），供控制器去重 */
  closedLedger: Map<string, PendingCloseReason>;
  terminalContext?: TerminalContext;
  outcome?: SessionOutcome;
  actionLog?: ActionLogEntry[];
};

function terminalContextFromEvent(
  event: SessionEvent,
): TerminalContext | undefined {
  const raw = event.meta?.terminal;
  if (!raw) return undefined;
  return isTerminalContext(raw) ? raw : undefined;
}

function mergeTerminalContext(
  previous: TerminalContext | undefined,
  next: TerminalContext | undefined,
): TerminalContext | undefined {
  if (!next) return previous;
  if (!previous) return next;
  // Later events overwrite field-by-field only when the new event actually
  // carries a value, so a hook that drops some env vars (e.g. tmux pane
  // disappearing mid-session) does not clobber the last good snapshot.
  const merged: TerminalContext = { ...previous };
  for (const key of ["app", "tty", "terminalSessionId", "tmuxPane", "tmuxSocket", "windowTitle"] as const) {
    if (next[key]) {
      merged[key] = next[key];
    }
  }
  return merged;
}

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

  if (event.externalApproval) {
    items.push(
      createActivityItem(
        {
          kind: "note",
          source: "system",
          title: "Approval required",
          body: event.externalApproval.title,
          tone: "waiting",
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
    ...(internal.terminalContext ? { terminalContext: internal.terminalContext } : {}),
    ...(internal.outcome ? { outcome: internal.outcome } : {}),
    ...(internal.actionLog && internal.actionLog.length > 0 ? { actionLog: internal.actionLog } : {}),
  };
  if (internal.pendingById.size === 0) {
    return internal.externalApproval ? { ...base, externalApproval: internal.externalApproval } : base;
  }
  return {
    ...base,
    pendingActions: [...internal.pendingById.values()].map((s) => s.action),
    ...(internal.externalApproval ? { externalApproval: internal.externalApproval } : {}),
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

function resolveNextExternalApproval(
  prev: InternalSessionRecord | undefined,
  event: SessionEvent,
  preservePreviousStatus: boolean,
): ExternalApprovalState | undefined {
  if (event.externalApproval !== undefined) {
    return event.externalApproval === null ? undefined : event.externalApproval;
  }

  if (preservePreviousStatus) {
    return prev?.externalApproval;
  }

  if (eventCarriesToolProgress(event) || event.pendingClosed) {
    return undefined;
  }

  return event.status === "waiting" ? prev?.externalApproval : undefined;
}

function eventCarriesToolProgress(event: SessionEvent): boolean {
  if (event.activityItems?.some((item) => item.kind === "tool")) {
    return true;
  }

  const hookEventName = firstMetaString(event.meta, "hook_event_name");
  return (
    hookEventName === "PostToolUse" ||
    hookEventName === "PostToolUseFailure" ||
    hookEventName === "PostToolBatch"
  );
}

function isJetBrainsTool(tool: string): boolean {
  return tool === "jetbrains" || tool === "goland" || tool === "pycharm";
}

function isLowSignalSystemItem(item: ActivityItem): boolean {
  const body = item.body.trim();
  if (!body) {
    return true;
  }
  return (
    body === "Completed" ||
    body === "Running" ||
    body === "Waiting" ||
    body === "Done" ||
    body === "Idle" ||
    body === "Offline" ||
    body === "Error" ||
    body === "Working" ||
    body === "CodeBuddy request started" ||
    body === "CodeBuddy request finished" ||
    body === "Claude session started" ||
    body === "Claude request finished" ||
    body === "Claude session ended"
  );
}

function isMeaningfulAssistantBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) {
    return false;
  }
  return trimmed !== "正在整理回复" && trimmed !== "正在整理回复...";
}

function hasOnlyLifecycleOrPlaceholderContent(session: InternalSessionRecord): boolean {
  if (session.activityItems.length === 0) {
    return true;
  }

  return session.activityItems.every((item) => {
    if (item.kind === "system" || item.kind === "note") {
      if (item.source !== "system") return false;
      if ((item.meta as Record<string, unknown>)?.inferred === true) return true;
      return isLowSignalSystemItem(item);
    }
    return (
      item.kind === "message" &&
      item.source === "assistant" &&
      !isMeaningfulAssistantBody(item.body)
    );
  });
}

function shouldHideNoiseSession(session: InternalSessionRecord): boolean {
  const isJetBrains = isJetBrainsTool(session.tool);
  const isCodeBuddy = session.tool === "codebuddy";
  if (!isJetBrains && !isCodeBuddy) {
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
  const hasLifecycleOnly = hasOnlyLifecycleOrPlaceholderContent(session);

  if (isJetBrains) {
    return !hasUserMessage && !hasAssistantContent && !hasToolResult && hasLifecycleOnly;
  }

  return (
    session.pendingById.size === 0 &&
    statusPriority(session.status) >= statusPriority("idle") &&
    !hasUserMessage &&
    !hasAssistantContent &&
    !hasToolResult &&
    hasLifecycleOnly
  );
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

function isCursorGenerationSession(session: InternalSessionRecord): boolean {
  return firstMetaString(session.meta, "cursor_session_id_source") === "generation";
}

function cursorSessionCwd(session: InternalSessionRecord): string | undefined {
  return firstMetaString(session.meta, "cwd");
}

function isCodexSubexecutionMeta(meta: Record<string, unknown> | undefined): boolean {
  const threadSource = firstMetaString(meta, "codex_thread_source")?.toLowerCase();
  const subagentKind = firstMetaString(meta, "codex_subagent_kind");
  const source = firstMetaString(meta, "source")?.toLowerCase();
  return (
    threadSource === "subagent" ||
    Boolean(subagentKind) ||
    source?.startsWith("subagent:") === true
  );
}

function codexSessionCwd(session: InternalSessionRecord | undefined): string | undefined {
  return firstMetaString(session?.meta, "cwd");
}

function codexEventCwd(
  event: SessionEvent,
  existing: InternalSessionRecord | undefined,
): string | undefined {
  return firstMetaString(event.meta, "cwd") ?? codexSessionCwd(existing);
}

function codexEventIsSubexecution(
  event: SessionEvent,
  existing: InternalSessionRecord | undefined,
): boolean {
  return isCodexSubexecutionMeta(event.meta) || isCodexSubexecutionMeta(existing?.meta);
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

type ResolvedSessionTarget = {
  sessionId: string;
  seed?: InternalSessionRecord;
  absorbedSessionId?: string;
  aliasSessionId?: string;
};

function sortCodexMergeCandidates(timestamp: number) {
  return (left: InternalSessionRecord, right: InternalSessionRecord): number => {
    const leftDelta = Math.abs(left.updatedAt - timestamp);
    const rightDelta = Math.abs(right.updatedAt - timestamp);
    if (leftDelta !== rightDelta) {
      return leftDelta - rightDelta;
    }
    return right.updatedAt - left.updatedAt;
  };
}

function resolveSessionTarget(
  sessions: Map<string, InternalSessionRecord>,
  event: SessionEvent,
  codexSubexecutionParents?: Map<string, string>,
): ResolvedSessionTarget {
  // Merge Codex guardian subagent sessions into parent user sessions
  if (event.tool === "codex") {
    const aliasedParentId = codexSubexecutionParents?.get(event.sessionId);
    const eventThreadSource = firstMetaString(event.meta, "codex_thread_source")?.toLowerCase();
    if (aliasedParentId && eventThreadSource !== "user") {
      const parent = sessions.get(aliasedParentId);
      if (parent) {
        return { sessionId: parent.id, seed: parent, aliasSessionId: event.sessionId };
      }
      codexSubexecutionParents?.delete(event.sessionId);
    }

    const existing = sessions.get(event.sessionId);
    const isSubexecution = codexEventIsSubexecution(event, existing);
    const cwd = codexEventCwd(event, existing);
    if (isSubexecution && cwd) {
      // Subagent event → find most recent user session with same cwd within window
      const userCandidate = [...sessions.values()]
        .filter(
          (session) =>
            session.tool === "codex" &&
            session.id !== event.sessionId &&
            codexSessionCwd(session) === cwd &&
            !isCodexSubexecutionMeta(session.meta) &&
            Math.abs(session.updatedAt - event.timestamp) <= CODEX_SUBAGENT_MERGE_WINDOW_MS,
        )
        .sort(sortCodexMergeCandidates(event.timestamp))[0];
      if (userCandidate) {
        return {
          sessionId: userCandidate.id,
          seed: userCandidate,
          aliasSessionId: event.sessionId,
        };
      }
      return { sessionId: event.sessionId };
    }

    // User event → absorb any existing subagent-only session from same cwd
    if (!isSubexecution && cwd && !sessions.has(event.sessionId)) {
      const subagentCandidate = [...sessions.values()]
        .filter(
          (session) =>
            session.tool === "codex" &&
            session.id !== event.sessionId &&
            codexSessionCwd(session) === cwd &&
            isCodexSubexecutionMeta(session.meta) &&
            Math.abs(session.updatedAt - event.timestamp) <= CODEX_SUBAGENT_MERGE_WINDOW_MS,
        )
        .sort(sortCodexMergeCandidates(event.timestamp))[0];
      if (subagentCandidate) {
        return {
          sessionId: event.sessionId,
          seed: subagentCandidate,
          absorbedSessionId: subagentCandidate.id,
          aliasSessionId: subagentCandidate.id,
        };
      }
    }

    return { sessionId: event.sessionId };
  }

  if (event.tool !== "cursor") {
    return { sessionId: event.sessionId };
  }

  const cwd = firstMetaString(event.meta, "cwd");
  const identitySource = firstMetaString(event.meta, "cursor_session_id_source");
  if (!cwd) {
    return { sessionId: event.sessionId };
  }

  const stableCandidates = [...sessions.values()]
    .filter(
      (session) =>
        session.tool === "cursor" &&
        session.id !== event.sessionId &&
        cursorSessionCwd(session) === cwd &&
        !isCursorGenerationSession(session) &&
        Math.abs(session.updatedAt - event.timestamp) <= CURSOR_SESSION_MERGE_WINDOW_MS,
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const generationCandidates = [...sessions.values()]
    .filter(
      (session) =>
        session.tool === "cursor" &&
        session.id !== event.sessionId &&
        cursorSessionCwd(session) === cwd &&
        isCursorGenerationSession(session) &&
        Math.abs(session.updatedAt - event.timestamp) <= CURSOR_SESSION_MERGE_WINDOW_MS,
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);

  if (identitySource === "generation") {
    const stableCandidate = stableCandidates[0];
    if (stableCandidate) {
      return { sessionId: stableCandidate.id, seed: stableCandidate };
    }
    return { sessionId: event.sessionId };
  }

  if (!sessions.has(event.sessionId)) {
    const generationCandidate = generationCandidates[0];
    if (generationCandidate) {
      return {
        sessionId: event.sessionId,
        seed: generationCandidate,
        absorbedSessionId: generationCandidate.id,
      };
    }
  }

  return { sessionId: event.sessionId };
}

export type SessionStatusChange = {
  sessionId: string;
  tool: string;
  prevStatus: SessionStatus | undefined;
  nextStatus: SessionStatus;
  title?: string;
  task?: string;
  lastUserMessage?: string;
};

export type PendingActionCreated = {
  sessionId: string;
  tool: string;
  pendingCount: number;
  title?: string;
  task?: string;
};

type SessionStoreOptions = {
  onStatusChange?: (change: SessionStatusChange) => void;
  onPendingActionCreated?: (params: PendingActionCreated) => void;
};

const CODEX_IDENTITY_META_KEYS = [
  "cwd",
  "codex_thread_source",
  "codex_subagent_kind",
  "source",
  "model_provider",
] as const;

function mergeSessionMeta(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
  options?: {
    preserveCodexParentIdentity?: boolean;
    promoteCodexUserFromSubexecution?: boolean;
  },
): Record<string, unknown> | undefined {
  if (!previous) {
    return next;
  }
  if (!next) {
    return previous;
  }

  const merged: Record<string, unknown> = { ...previous, ...next };

  if (options?.preserveCodexParentIdentity) {
    for (const key of CODEX_IDENTITY_META_KEYS) {
      if (previous[key] !== undefined) {
        merged[key] = previous[key];
      } else if (key !== "cwd" && key !== "model_provider") {
        delete merged[key];
      }
    }
  }

  if (options?.promoteCodexUserFromSubexecution) {
    if (next.codex_thread_source === undefined && previous.codex_thread_source === "subagent") {
      delete merged.codex_thread_source;
    }
    if (next.codex_subagent_kind === undefined) {
      delete merged.codex_subagent_kind;
    }
    const source = firstMetaString(merged, "source")?.toLowerCase();
    if (next.source === undefined && source?.startsWith("subagent:")) {
      delete merged.source;
    }
  }

  return merged;
}

export function createSessionStore(options?: SessionStoreOptions) {
  const sessions = new Map<string, InternalSessionRecord>();
  const codexSubexecutionParents = new Map<string, string>();

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

  function inferOutcomeFromStatus(session: InternalSessionRecord): SessionOutcome | null {
    const items = session.activityItems ?? [];
    if (items.length === 0) return null;
    switch (session.status) {
      case "completed": {
        const userMsgs = items.filter((i) => i.kind === "message" && i.source === "user").length;
        const assistantMsgs = items.filter((i) => i.kind === "message" && i.source !== "user").length;
        if (userMsgs > 0 && assistantMsgs > 0) return "success";
        if (userMsgs === 0 && assistantMsgs === 0) return "unclear";
        return "success";
      }
      case "error":
        return "abandoned";
      case "idle":
      case "offline": {
        if (items.length === 0) return "unclear";
        const lastActivity = Math.max(...items.map((i) => i.timestamp));
        const idleMs = Date.now() - lastActivity;
        return idleMs > 30 * 60 * 1000 ? "abandoned" : "unclear";
      }
      default:
        return null;
    }
  }

  return {
    applyEvent(event: SessionEvent) {
      if (!isSessionStatus(event.status)) {
        return;
      }
      const resolvedTarget = resolveSessionTarget(sessions, event, codexSubexecutionParents);
      const sessionId = resolvedTarget.sessionId;
      const prev = sessions.get(sessionId) ?? resolvedTarget.seed;
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
          event.pendingLifetimeMs ??
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
      const nextExternalApproval = resolveNextExternalApproval(
        prev,
        event,
        preservePreviousStatus,
      );
      const nextUpdatedAt = Math.max(prev?.updatedAt ?? Number.NEGATIVE_INFINITY, event.timestamp);

      const prevPendingSize = prev?.pendingById.size ?? 0;
      const nextTerminalContext = mergeTerminalContext(
        prev?.terminalContext,
        terminalContextFromEvent(event),
      );
      const mergingCodexSubexecutionIntoParent =
        event.tool === "codex" &&
        resolvedTarget.aliasSessionId === event.sessionId &&
        resolvedTarget.sessionId !== event.sessionId &&
        prev !== undefined &&
        !isCodexSubexecutionMeta(prev.meta);
      const promotingCodexUserFromSubexecution =
        event.tool === "codex" && resolvedTarget.absorbedSessionId !== undefined;
      const internal: InternalSessionRecord = {
        id: sessionId,
        tool: event.tool,
        status: preservePreviousStatus && prev ? prev.status : event.status,
        title:
          preservePreviousStatus && prev?.title
            ? prev.title
            : (event.title ?? prev?.title),
        task: preservePreviousStatus ? prev?.task : event.task,
        meta: mergeSessionMeta(prev?.meta, event.meta, {
          preserveCodexParentIdentity: mergingCodexSubexecutionIntoParent,
          promoteCodexUserFromSubexecution: promotingCodexUserFromSubexecution,
        }),
        updatedAt: nextUpdatedAt,
        lastUserMessageAt: nextLastUserMessageAt,
        activityItems: nextActivityItems,
        activities: toLegacyActivities(nextActivityItems),
        pendingById: nextPendingById,
        externalApproval: nextExternalApproval,
        closedLedger: nextClosedLedger,
        ...(nextTerminalContext ? { terminalContext: nextTerminalContext } : {}),
        ...(prev?.outcome ? { outcome: prev.outcome } : {}),
      };
      sessions.set(sessionId, internal);
      // Auto-infer outcome when session reaches a terminal status
      if (!internal.outcome && prev?.status !== internal.status) {
        const inferred = inferOutcomeFromStatus(internal);
        if (inferred) {
          const now = Date.now();
          const activityItem: ActivityItem = {
            id: `${sessionId}:${now}:outcome:${inferred}`,
            kind: "system",
            source: "system",
            title: "Outcome",
            body: `Auto-inferred: ${inferred}`,
            timestamp: now,
            meta: { outcome: inferred, inferred: true },
          };
          internal.outcome = inferred;
          internal.activityItems = prependActivityItem(internal.activityItems, activityItem);
          internal.activities = toLegacyActivities(internal.activityItems);
          sessions.set(sessionId, internal);
        }
      }
      if (
        event.tool === "codex" &&
        resolvedTarget.aliasSessionId &&
        resolvedTarget.aliasSessionId !== sessionId
      ) {
        codexSubexecutionParents.set(resolvedTarget.aliasSessionId, sessionId);
      }
      if (resolvedTarget.absorbedSessionId && resolvedTarget.absorbedSessionId !== sessionId) {
        sessions.delete(resolvedTarget.absorbedSessionId);
      }

      const prevStatus = prev?.status;
      if (options?.onStatusChange && prevStatus !== internal.status) {
        options.onStatusChange({
          sessionId: internal.id,
          tool: internal.tool,
          prevStatus,
          nextStatus: internal.status,
          title: internal.title,
          task: internal.task,
          lastUserMessage: latestUserMessageBody(internal),
        });
      }

      if (
        options?.onPendingActionCreated &&
        prevPendingSize === 0 &&
        internal.pendingById.size > 0
      ) {
        options.onPendingActionCreated({
          sessionId: internal.id,
          tool: internal.tool,
          pendingCount: internal.pendingById.size,
          title: internal.title,
          task: internal.task,
        });
      }
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

    seedFromHistory(record: {
      id: string;
      tool: string;
      status: string;
      title: string | null;
      latestTask: string | null;
      updatedAt: number;
      lastUserMessageAt: number | null;
    }) {
      if (sessions.has(record.id)) {
        return;
      }
      const restoredStatus: SessionStatus =
        record.status === "running" || record.status === "waiting"
          ? "idle"
          : isSessionStatus(record.status)
            ? record.status
            : "completed";
      const internal: InternalSessionRecord = {
        id: record.id,
        tool: record.tool,
        status: restoredStatus,
        title: record.title ?? undefined,
        task: record.latestTask ?? undefined,
        meta: undefined,
        updatedAt: record.updatedAt,
        lastUserMessageAt: record.lastUserMessageAt ?? undefined,
        activityItems: [],
        activities: [],
        pendingById: new Map(),
        externalApproval: undefined,
        closedLedger: new Map(),
      };
      sessions.set(record.id, internal);
    },

    getSessions(): SessionRecord[] {
      const allSessions = [...sessions.values()];
      return allSessions
        .filter((session) => !shouldHideNoiseSession(session))
        .filter((session) => !shouldHideCodeBuddyDuplicateShell(session, allSessions))
        .sort((a, b) => {
          const aUserTs = a.lastUserMessageAt ?? a.updatedAt;
          const bUserTs = b.lastUserMessageAt ?? b.updatedAt;
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

    setOutcome(sessionId: string, outcome: SessionOutcome): boolean {
      const internal = sessions.get(sessionId);
      if (!internal) {
        return false;
      }
      const now = Date.now();
      const activityItem: ActivityItem = {
        id: `${sessionId}:${now}:outcome:${outcome}`,
        kind: "system",
        source: "system",
        title: "Outcome",
        body: `Marked as ${outcome}`,
        timestamp: now,
        meta: { outcome },
      };
      const nextActivityItems = prependActivityItem(internal.activityItems, activityItem);
      sessions.set(sessionId, {
        ...internal,
        outcome,
        updatedAt: now,
        activityItems: nextActivityItems,
        activities: toLegacyActivities(nextActivityItems),
      });
      return true;
    },

    addActionLogEntry(sessionId: string, entry: ActionLogEntry): boolean {
      const internal = sessions.get(sessionId);
      if (!internal) return false;
      const log = internal.actionLog ? [...internal.actionLog, entry] : [entry];
      sessions.set(sessionId, { ...internal, actionLog: log });
      return true;
    },

    closeSession(sessionId: string): boolean {
      if (!sessions.has(sessionId)) {
        return false;
      }
      sessions.delete(sessionId);
      return true;
    },
  };
}
