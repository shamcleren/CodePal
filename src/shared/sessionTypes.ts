export type SessionStatus =
  | "running"
  | "waiting"
  | "completed"
  | "error"
  | "idle"
  | "offline";

export const SESSION_STATUSES: readonly SessionStatus[] = [
  "running",
  "waiting",
  "completed",
  "error",
  "idle",
  "offline",
] as const;

export function isSessionStatus(value: string): value is SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(value);
}

export type PendingActionType = "approval" | "single_choice" | "multi_choice";
export type JumpTargetAgent =
  | "cursor"
  | "codex"
  | "claude"
  | "codebuddy"
  | "goland"
  | "pycharm";

export type ActivityKind = "message" | "tool" | "note" | "system";
export type ActivitySource = "user" | "assistant" | "agent" | "tool" | "system";
export type ActivityTone =
  | "running"
  | "completed"
  | "waiting"
  | "idle"
  | "error"
  | "system";
export type ActivityToolPhase = "call" | "result";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  source: ActivitySource;
  title: string;
  body: string;
  timestamp: number;
  tone?: ActivityTone;
  toolName?: string;
  toolPhase?: ActivityToolPhase;
  meta?: Record<string, unknown>;
}

export function isActivityItem(value: unknown): value is ActivityItem {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string") return false;
  if (
    o.kind !== "message" &&
    o.kind !== "tool" &&
    o.kind !== "note" &&
    o.kind !== "system"
  ) {
    return false;
  }
  if (
    o.source !== "user" &&
    o.source !== "assistant" &&
    o.source !== "agent" &&
    o.source !== "tool" &&
    o.source !== "system"
  ) {
    return false;
  }
  if (typeof o.title !== "string" || typeof o.body !== "string") return false;
  if (typeof o.timestamp !== "number") return false;
  if (
    "tone" in o &&
    o.tone !== undefined &&
    o.tone !== "running" &&
    o.tone !== "completed" &&
    o.tone !== "waiting" &&
    o.tone !== "idle" &&
    o.tone !== "error" &&
    o.tone !== "system"
  ) {
    return false;
  }
  if (
    "toolPhase" in o &&
    o.toolPhase !== undefined &&
    o.toolPhase !== "call" &&
    o.toolPhase !== "result"
  ) {
    return false;
  }
  if ("toolName" in o && o.toolName !== undefined && typeof o.toolName !== "string") {
    return false;
  }
  if ("meta" in o && o.meta !== undefined && typeof o.meta !== "object") {
    return false;
  }
  return true;
}

export const PENDING_ACTION_TYPES: readonly PendingActionType[] = [
  "approval",
  "single_choice",
  "multi_choice",
] as const;

export interface PendingAction {
  id: string;
  type: PendingActionType;
  title: string;
  options: string[];
}

export interface SessionJumpTarget {
  agent: JumpTargetAgent;
  appName?: string;
  workspacePath?: string;
  sessionId?: string;
  conversationId?: string;
  windowHint?: string;
  fallbackBehavior: "activate_app";
}

export interface ExternalApprovalState {
  kind: "approval_required";
  title: string;
  message: string;
  sourceTool: JumpTargetAgent;
  updatedAt: number;
  jumpTarget?: SessionJumpTarget;
}

export function isPendingAction(value: unknown): value is PendingAction {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return false;
  if (typeof o.type !== "string") return false;
  if (!(PENDING_ACTION_TYPES as readonly string[]).includes(o.type)) return false;
  if (!Array.isArray(o.options) || !o.options.every((x) => typeof x === "string")) {
    return false;
  }
  return true;
}

export function isSessionJumpTarget(value: unknown): value is SessionJumpTarget {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (
    o.agent !== "cursor" &&
    o.agent !== "codex" &&
    o.agent !== "claude" &&
    o.agent !== "codebuddy" &&
    o.agent !== "goland" &&
    o.agent !== "pycharm"
  ) {
    return false;
  }
  if (o.fallbackBehavior !== "activate_app") {
    return false;
  }
  if ("appName" in o && o.appName !== undefined && typeof o.appName !== "string") {
    return false;
  }
  if ("workspacePath" in o && o.workspacePath !== undefined && typeof o.workspacePath !== "string") {
    return false;
  }
  if ("sessionId" in o && o.sessionId !== undefined && typeof o.sessionId !== "string") {
    return false;
  }
  if ("conversationId" in o && o.conversationId !== undefined && typeof o.conversationId !== "string") {
    return false;
  }
  if ("windowHint" in o && o.windowHint !== undefined && typeof o.windowHint !== "string") {
    return false;
  }
  return true;
}

export function isExternalApprovalState(value: unknown): value is ExternalApprovalState {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (o.kind !== "approval_required") return false;
  if (
    typeof o.title !== "string" ||
    typeof o.message !== "string" ||
    typeof o.updatedAt !== "number"
  ) {
    return false;
  }
  if (
    o.sourceTool !== "cursor" &&
    o.sourceTool !== "codex" &&
    o.sourceTool !== "claude" &&
    o.sourceTool !== "codebuddy" &&
    o.sourceTool !== "goland" &&
    o.sourceTool !== "pycharm"
  ) {
    return false;
  }
  if ("jumpTarget" in o && o.jumpTarget !== undefined && !isSessionJumpTarget(o.jumpTarget)) {
    return false;
  }
  return true;
}

/** 外部 action_response 回写路由目标（bridge / hook 侧可选携带） */
export interface UnixSocketResponseTarget {
  mode: "socket";
  socketPath: string;
  timeoutMs?: number;
}

export interface TcpResponseTarget {
  mode: "socket";
  host: string;
  port: number;
  timeoutMs?: number;
}

export type ResponseTarget = UnixSocketResponseTarget | TcpResponseTarget;

export function isResponseTarget(value: unknown): value is ResponseTarget {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (o.mode !== "socket") return false;
  const hasSocketPath = typeof o.socketPath === "string";
  const hasTcpAddress =
    typeof o.host === "string" &&
    o.host.trim().length > 0 &&
    typeof o.port === "number" &&
    Number.isFinite(o.port) &&
    o.port > 0;
  if (!hasSocketPath && !hasTcpAddress) return false;
  if ("timeoutMs" in o && o.timeoutMs !== undefined && typeof o.timeoutMs !== "number") {
    return false;
  }
  return true;
}

export type PendingCloseReason =
  | "consumed_local"
  | "consumed_remote"
  | "expired"
  | "cancelled";

export const PENDING_CLOSE_REASONS: readonly PendingCloseReason[] = [
  "consumed_local",
  "consumed_remote",
  "expired",
  "cancelled",
] as const;

export interface PendingClosed {
  actionId: string;
  reason: PendingCloseReason;
}

export function isPendingClosed(value: unknown): value is PendingClosed {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.actionId !== "string") return false;
  if (typeof o.reason !== "string") return false;
  if (!(PENDING_CLOSE_REASONS as readonly string[]).includes(o.reason)) return false;
  return true;
}

export interface SessionRecord {
  id: string;
  tool: string;
  status: SessionStatus;
  title?: string;
  task?: string;
  updatedAt: number;
  lastUserMessageAt?: number;
  activityItems?: ActivityItem[];
  activities?: string[];
  pendingActions?: PendingAction[];
  externalApproval?: ExternalApprovalState;
}
