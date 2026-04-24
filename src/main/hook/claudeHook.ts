import type { ExternalApprovalState, JumpTargetAgent } from "../../shared/sessionTypes";
import { runBlockingHookFromRaw } from "./blockingHookBridge";
import { jumpTargetFieldsFromEnv } from "./terminalMeta";

export type ClaudeHookToolTag = Extract<
  JumpTargetAgent,
  "claude" | "qoder" | "qwen" | "factory"
>;

const AGENT_DISPLAY_LABELS: Record<ClaudeHookToolTag, string> = {
  claude: "Claude",
  qoder: "Qoder",
  qwen: "Qwen",
  factory: "Factory",
};

const AGENT_APPROVAL_TITLES: Record<ClaudeHookToolTag, string> = {
  claude: "Approval required in Claude Code",
  qoder: "Approval required in Qoder",
  qwen: "Approval required in Qwen",
  factory: "Approval required in Factory",
};

function firstString(payload: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function maybeBuildClaudeExternalApproval(
  payload: Record<string, unknown>,
  sessionId: string,
  timestamp: number,
  cwd: string | undefined,
  env: NodeJS.ProcessEnv,
  toolTag: ClaudeHookToolTag,
): ExternalApprovalState | undefined {
  const message = firstString(payload, ["message", "notification", "prompt"]);
  if (!message) {
    return undefined;
  }
  if (!(/\b(permission|approval|approve|allow)\b/i.test(message) || /权限|授权|审批|批准|允许/.test(message))) {
    return undefined;
  }

  const terminalFields = jumpTargetFieldsFromEnv(env);
  return {
    kind: "approval_required",
    title: AGENT_APPROVAL_TITLES[toolTag],
    message,
    sourceTool: toolTag,
    updatedAt: timestamp,
    jumpTarget: {
      agent: toolTag,
      appName: terminalFields.appName ?? "Terminal",
      ...(cwd ? { workspacePath: cwd } : {}),
      sessionId,
      ...(terminalFields.tty ? { tty: terminalFields.tty } : {}),
      ...(terminalFields.terminalSessionId
        ? { terminalSessionId: terminalFields.terminalSessionId }
        : {}),
      ...(terminalFields.tmuxPane ? { tmuxPane: terminalFields.tmuxPane } : {}),
      ...(terminalFields.tmuxSocket ? { tmuxSocket: terminalFields.tmuxSocket } : {}),
      fallbackBehavior: "activate_app",
    },
  };
}

function parseClaudeHookPayload(trimmed: string): Record<string, unknown> {
  if (!trimmed) {
    throw new Error("claudeHook: empty payload");
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload must be a JSON object");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`claudeHook: invalid JSON: ${message}`);
  }
}

function buildUserPromptEvent(
  payload: Record<string, unknown>,
  sessionId: string,
  timestamp: number,
  cwd: string | undefined,
  hookEventName: string,
  toolTag: ClaudeHookToolTag,
): string {
  const prompt =
    firstString(payload, ["prompt", "user_prompt", "message"]) ??
    "User prompt";

  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: toolTag,
    status: "running",
    task: prompt,
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `${toolTag}-hook:${sessionId}:${timestamp}:user`,
        kind: "message",
        source: "user",
        title: "User",
        body: prompt,
        timestamp,
      },
    ],
  });
}

function buildSessionStartEvent(
  sessionId: string,
  timestamp: number,
  cwd: string | undefined,
  hookEventName: string,
  toolTag: ClaudeHookToolTag,
): string {
  const label = AGENT_DISPLAY_LABELS[toolTag];
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: toolTag,
    status: "running",
    task: `${label} session started`,
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `${toolTag}-hook:${sessionId}:${timestamp}:start`,
        kind: "system",
        source: "system",
        title: "Session started",
        body: `${label} session started`,
        timestamp,
      },
    ],
  });
}

function buildStopEvent(
  payload: Record<string, unknown>,
  sessionId: string,
  timestamp: number,
  cwd: string | undefined,
  hookEventName: string,
  toolTag: ClaudeHookToolTag,
): string {
  const stopReason = firstString(payload, ["stop_reason", "reason"]) ?? "end_turn";
  const label = AGENT_DISPLAY_LABELS[toolTag];
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: toolTag,
    status: "completed",
    task: "completed",
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      stop_reason: stopReason,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `${toolTag}-hook:${sessionId}:${timestamp}:stop`,
        kind: "system",
        source: "system",
        title: "Session ended",
        body: `${label} request finished`,
        timestamp,
        tone: "completed",
      },
    ],
  });
}

function buildNotificationEvent(
  payload: Record<string, unknown>,
  sessionId: string,
  timestamp: number,
  cwd: string | undefined,
  hookEventName: string,
  env: NodeJS.ProcessEnv,
  toolTag: ClaudeHookToolTag,
): string {
  const label = AGENT_DISPLAY_LABELS[toolTag];
  const message = firstString(payload, ["message", "notification", "prompt"]) ?? `${label} notification`;
  const externalApproval = maybeBuildClaudeExternalApproval(payload, sessionId, timestamp, cwd, env, toolTag);
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: toolTag,
    status: "waiting",
    task: message,
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      notification_type: `${toolTag}_notification`,
      ...(cwd ? { cwd } : {}),
    },
    ...(externalApproval ? { externalApproval } : {}),
    activityItems: [
      {
        id: `${toolTag}-hook:${sessionId}:${timestamp}:notification`,
        kind: "note",
        source: "system",
        title: "Notification",
        body: message,
        timestamp,
        tone: "waiting",
      },
    ],
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function summarizeToolInput(toolName: string, toolInput: unknown): string {
  if (!toolInput || typeof toolInput !== "object") return toolName;
  const input = toolInput as Record<string, unknown>;

  if (toolName === "Bash" && typeof input.command === "string") {
    return truncate(input.command, 200);
  }
  if ((toolName === "Edit" || toolName === "Write" || toolName === "Read" || toolName === "MultiEdit") && typeof input.file_path === "string") {
    return input.file_path;
  }
  if (toolName === "Glob" && typeof input.pattern === "string") {
    return input.pattern;
  }
  if (toolName === "Grep" && typeof input.pattern === "string") {
    return input.pattern;
  }
  // Fallback: compact JSON, truncated.
  try {
    return truncate(JSON.stringify(input), 200);
  } catch {
    return toolName;
  }
}

function buildPreToolUseOutbound(
  payload: Record<string, unknown>,
  sessionId: string,
  timestamp: number,
  cwd: string | undefined,
  hookEventName: string,
  toolTag: ClaudeHookToolTag,
): { outbound: string; actionId: string } {
  const toolName = firstString(payload, ["tool_name", "toolName"]) ?? "tool";
  const toolInput = payload.tool_input ?? payload.toolInput;
  const summary = summarizeToolInput(toolName, toolInput);
  const actionId = `${toolTag}-pretooluse:${sessionId}:${timestamp}`;
  const title = `${AGENT_DISPLAY_LABELS[toolTag]} wants to run ${toolName}: ${summary}`;

  const outbound = {
    type: "status_change",
    sessionId,
    tool: toolTag,
    status: "waiting",
    task: title,
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      tool_name: toolName,
      ...(cwd ? { cwd } : {}),
    },
    pendingAction: {
      id: actionId,
      type: "approval" as const,
      title,
      options: ["Allow", "Deny"],
    },
    activityItems: [
      {
        id: `${toolTag}-hook:${sessionId}:${timestamp}:pretooluse`,
        kind: "note",
        source: "system",
        title: "Approval required",
        body: title,
        timestamp,
        tone: "waiting",
      },
    ],
  };

  return { outbound: JSON.stringify(outbound), actionId };
}

/**
 * Given the action_response line returned by the blocking bridge, format the
 * stdout payload Claude Code expects for a PreToolUse hook decision.
 *
 * Claude Code hook schema (PreToolUse):
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "PreToolUse",
 *       "permissionDecision": "allow" | "deny" | "ask",
 *       "permissionDecisionReason": "..."
 *     }
 *   }
 */
export function formatClaudePreToolUseResponse(responseLine: string): string | undefined {
  let decision: "allow" | "deny" | undefined;
  try {
    const parsed = JSON.parse(responseLine) as Record<string, unknown>;
    const response = parsed.response as Record<string, unknown> | undefined;
    if (response && response.kind === "approval" && (response.decision === "allow" || response.decision === "deny")) {
      decision = response.decision;
    }
  } catch {
    // Malformed response — fall through to native flow
  }

  if (!decision) {
    // Cannot determine a clear user decision — return undefined so the caller
    // writes nothing to stdout and Claude falls back to its native permission flow.
    return undefined;
  }

  const reason = decision === "allow" ? "User approved in CodePal" : "User denied in CodePal";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  });
}

function buildSessionEndEvent(
  sessionId: string,
  timestamp: number,
  cwd: string | undefined,
  hookEventName: string,
  toolTag: ClaudeHookToolTag,
): string {
  const label = AGENT_DISPLAY_LABELS[toolTag];
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: toolTag,
    status: "idle",
    task: "session ended",
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `${toolTag}-hook:${sessionId}:${timestamp}:session-end`,
        kind: "system",
        source: "system",
        title: "Session ended",
        body: `${label} session ended`,
        timestamp,
        tone: "idle",
      },
    ],
  });
}

export function buildClaudeEventLine(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
  toolTag: ClaudeHookToolTag = "claude",
): string {
  const payload = parseClaudeHookPayload(rawStdin.trim());
  const sessionId = firstString(payload, ["session_id", "sessionId"]);
  if (!sessionId) {
    throw new Error("claudeHook: missing session_id");
  }

  const hookEventName = firstString(payload, ["hook_event_name", "event_name"]) ?? "unknown";
  const projectDirEnvVar = `${toolTag.toUpperCase()}_PROJECT_DIR`;
  const cwd =
    firstString(payload, ["cwd"]) ??
    env[projectDirEnvVar]?.trim() ??
    env.CLAUDE_PROJECT_DIR?.trim();
  const timestamp = Date.now();

  switch (hookEventName) {
    case "UserPromptSubmit":
      return buildUserPromptEvent(payload, sessionId, timestamp, cwd, hookEventName, toolTag);
    case "SessionStart":
      return buildSessionStartEvent(sessionId, timestamp, cwd, hookEventName, toolTag);
    case "Stop":
    case "SubagentStop":
      return buildStopEvent(payload, sessionId, timestamp, cwd, hookEventName, toolTag);
    case "SessionEnd":
      return buildSessionEndEvent(sessionId, timestamp, cwd, hookEventName, toolTag);
    case "Notification":
      return buildNotificationEvent(payload, sessionId, timestamp, cwd, hookEventName, env, toolTag);
    default:
      return JSON.stringify({
        type: "status_change",
        sessionId,
        tool: toolTag,
        status: "running",
        task: hookEventName,
        timestamp,
        meta: {
          hook_event_name: hookEventName,
          ...(cwd ? { cwd } : {}),
        },
      });
  }
}

export async function runClaudeHookPipeline(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
  toolTag: ClaudeHookToolTag = "claude",
): Promise<string> {
  return buildClaudeEventLine(rawStdin, env, toolTag);
}

/**
 * Detect whether the incoming Claude hook payload is a PreToolUse event.
 * PreToolUse needs the blocking round-trip so CodePal can prompt the user
 * and respond with an allow/deny decision on stdout before Claude proceeds.
 */
export function isClaudePreToolUsePayload(rawStdin: string): boolean {
  try {
    const parsed = JSON.parse(rawStdin.trim()) as Record<string, unknown>;
    const eventName =
      (typeof parsed.hook_event_name === "string" && parsed.hook_event_name) ||
      (typeof parsed.event_name === "string" && parsed.event_name) ||
      "";
    return eventName === "PreToolUse";
  } catch {
    return false;
  }
}

/**
 * Blocking pipeline for Claude Code PreToolUse: sends a pendingAction event
 * to CodePal, waits for the user's allow/deny decision, and returns the
 * Claude-CLI-formatted stdout JSON. Returns `undefined` if the blocking
 * bridge did not produce a response (timeout or internal error — caller
 * should not write anything, letting Claude Code fall back to its default
 * permission flow).
 */
export async function runClaudePreToolUsePipeline(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
  toolTag: ClaudeHookToolTag = "claude",
): Promise<string | undefined> {
  try {
    const trimmed = rawStdin.trim();
    const payload = parseClaudeHookPayload(trimmed);
    const sessionId = firstString(payload, ["session_id", "sessionId"]);
    if (!sessionId) {
      console.warn("[CodePal] PreToolUse: missing session_id, falling back to native flow");
      return undefined;
    }

    const hookEventName = firstString(payload, ["hook_event_name", "event_name"]) ?? "PreToolUse";
    const projectDirEnvVar = `${toolTag.toUpperCase()}_PROJECT_DIR`;
    const cwd =
      firstString(payload, ["cwd"]) ??
      env[projectDirEnvVar]?.trim() ??
      env.CLAUDE_PROJECT_DIR?.trim();
    const timestamp = Date.now();

    const { outbound } = buildPreToolUseOutbound(payload, sessionId, timestamp, cwd, hookEventName, toolTag);
    const responseLine = await runBlockingHookFromRaw(outbound, env);
    if (!responseLine) {
      return undefined;
    }
    return formatClaudePreToolUseResponse(responseLine);
  } catch (error) {
    // Design principle: CodePal must never block Claude's native flow.
    // On any internal error, degrade gracefully — return undefined so
    // nothing is written to stdout and Claude falls back to its own
    // permission prompt.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[CodePal] PreToolUse pipeline error, falling back to native flow: ${message}`);
    return undefined;
  }
}
