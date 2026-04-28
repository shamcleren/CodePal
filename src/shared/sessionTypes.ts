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
  | "qoder"
  | "qwen"
  | "factory"
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

/**
 * Terminal metadata captured by the hook wrapper. Populated only when the
 * surrounding shell actually exposes the relevant env signals; every field is
 * optional so consumers must degrade gracefully (e.g. `canReply` returns false
 * when neither tmuxPane nor a Ghostty session id is present).
 */
export interface TerminalContext {
  /** Normalized app identifier: "iTerm.app" / "ghostty" / "Terminal" / "kitty" / "wezterm" / "warp" / "zellij" / "vscode" / "tmux" / "unknown" */
  app?: string;
  /** Controlling TTY device path, e.g. "/dev/ttys001" */
  tty?: string;
  /** iTerm2 / Ghostty / kitty terminal session id */
  terminalSessionId?: string;
  /** tmux pane target (e.g. "%42" or "session:window.pane") */
  tmuxPane?: string;
  /** tmux socket path (leading component of $TMUX before the comma) */
  tmuxSocket?: string;
  /** WezTerm pane id (numeric string from $WEZTERM_PANE) — used by `wezterm cli` */
  weztermPane?: string;
  /** kitty OS-window id (from $KITTY_WINDOW_ID) — used by `kitten @ ... --match id:<id>` */
  kittyWindow?: string;
  /** Raw terminal title, if known */
  windowTitle?: string;
}

export function isTerminalContext(value: unknown): value is TerminalContext {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  for (const key of ["app", "tty", "terminalSessionId", "tmuxPane", "tmuxSocket", "weztermPane", "kittyWindow", "windowTitle"]) {
    if (key in o && o[key] !== undefined && typeof o[key] !== "string") {
      return false;
    }
  }
  return true;
}

export interface SessionJumpTarget {
  agent: JumpTargetAgent;
  appName?: string;
  workspacePath?: string;
  sessionId?: string;
  conversationId?: string;
  windowHint?: string;
  /** Controlling TTY of the originating terminal (for Terminal.app / iTerm2 tab lookup) */
  tty?: string;
  /** iTerm2 / Ghostty session id (for AppleScript `tell session id ...`) */
  terminalSessionId?: string;
  /** tmux pane target (e.g. "%42") for `tmux switch-client -t` */
  tmuxPane?: string;
  /** tmux socket path when the source tmux runs on a non-default socket */
  tmuxSocket?: string;
  /** WezTerm pane id (numeric, from $WEZTERM_PANE) for `wezterm cli activate-pane` */
  weztermPane?: string;
  /** kitty OS-window id (from $KITTY_WINDOW_ID) for `kitten @ focus-window --match id:<id>` */
  kittyWindow?: string;
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
  for (const key of ["tty", "terminalSessionId", "tmuxPane", "tmuxSocket", "weztermPane", "kittyWindow"]) {
    if (key in o && o[key] !== undefined && typeof o[key] !== "string") {
      return false;
    }
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
  /** Terminal-side metadata captured at hook time; absent when the wrapper could not observe a terminal */
  terminalContext?: TerminalContext;
}

/**
 * Capability predicate for send-message. True when the session's terminal
 * context gives us a concrete channel to deliver text into the agent's stdin:
 *   - tmux: any pane target (we can `tmux send-keys -l` against it)
 *   - WezTerm: any pane id (we can `wezterm cli send-text --pane-id` against it)
 *   - kitty: any window id (we can `kitten @ send-text --match id:<id>` against it,
 *     provided the user has `allow_remote_control` enabled in kitty.conf)
 *   - iTerm2: app identified AND a terminal session id is known (per-session
 *     `tell session id "..." to write text "..."` AppleScript surface)
 *   - Ghostty: app identified AND a terminal session id is known (System Events
 *     keystroke fallback — best effort)
 * Other terminals (Terminal.app / Warp) have no reliable text injection path
 * in v1.1.x — callers should hide the input UI rather than render a disabled
 * control.
 */
export function canReply(session: Pick<SessionRecord, "terminalContext">): boolean {
  const ctx = session.terminalContext;
  if (!ctx) return false;
  if (ctx.tmuxPane && ctx.tmuxPane.length > 0) return true;
  if (ctx.weztermPane && ctx.weztermPane.length > 0) return true;
  if (ctx.kittyWindow && ctx.kittyWindow.length > 0) return true;
  if (ctx.app === "iTerm.app" && ctx.terminalSessionId && ctx.terminalSessionId.length > 0) {
    return true;
  }
  if (ctx.app === "ghostty" && ctx.terminalSessionId && ctx.terminalSessionId.length > 0) {
    return true;
  }
  return false;
}
