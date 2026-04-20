import type { ExternalApprovalState } from "../../shared/sessionTypes";
import { runBlockingHookFromRaw } from "./blockingHookBridge";

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
): ExternalApprovalState | undefined {
  const message = firstString(payload, ["message", "notification", "prompt"]);
  if (!message) {
    return undefined;
  }
  if (!(/\b(permission|approval|approve|allow)\b/i.test(message) || /权限|授权|审批|批准|允许/.test(message))) {
    return undefined;
  }

  return {
    kind: "approval_required",
    title: "Approval required in Claude Code",
    message,
    sourceTool: "claude",
    updatedAt: timestamp,
    jumpTarget: {
      agent: "claude",
      appName: "Terminal",
      ...(cwd ? { workspacePath: cwd } : {}),
      sessionId,
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
): string {
  const prompt =
    firstString(payload, ["prompt", "user_prompt", "message"]) ??
    "User prompt";

  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: "claude",
    status: "running",
    task: prompt,
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `claude-hook:${sessionId}:${timestamp}:user`,
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
): string {
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: "claude",
    status: "running",
    task: "Claude session started",
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `claude-hook:${sessionId}:${timestamp}:start`,
        kind: "system",
        source: "system",
        title: "Session started",
        body: "Claude session started",
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
): string {
  const stopReason = firstString(payload, ["stop_reason", "reason"]) ?? "end_turn";
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: "claude",
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
        id: `claude-hook:${sessionId}:${timestamp}:stop`,
        kind: "system",
        source: "system",
        title: "Session ended",
        body: "Claude request finished",
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
): string {
  const message = firstString(payload, ["message", "notification", "prompt"]) ?? "Claude notification";
  const externalApproval = maybeBuildClaudeExternalApproval(payload, sessionId, timestamp, cwd);
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: "claude",
    status: "waiting",
    task: message,
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      notification_type: "claude_notification",
      ...(cwd ? { cwd } : {}),
    },
    ...(externalApproval ? { externalApproval } : {}),
    activityItems: [
      {
        id: `claude-hook:${sessionId}:${timestamp}:notification`,
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
): { outbound: string; actionId: string } {
  const toolName = firstString(payload, ["tool_name", "toolName"]) ?? "tool";
  const toolInput = payload.tool_input ?? payload.toolInput;
  const summary = summarizeToolInput(toolName, toolInput);
  const actionId = `claude-pretooluse:${sessionId}:${timestamp}`;
  const title = `Claude wants to run ${toolName}: ${summary}`;

  const outbound = {
    type: "status_change",
    sessionId,
    tool: "claude",
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
        id: `claude-hook:${sessionId}:${timestamp}:pretooluse`,
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
export function formatClaudePreToolUseResponse(responseLine: string): string {
  let decision: "allow" | "deny" = "deny";
  let reason = "User denied in CodePal";
  try {
    const parsed = JSON.parse(responseLine) as Record<string, unknown>;
    const response = parsed.response as Record<string, unknown> | undefined;
    if (response && response.kind === "approval" && (response.decision === "allow" || response.decision === "deny")) {
      decision = response.decision;
      reason = decision === "allow" ? "User approved in CodePal" : "User denied in CodePal";
    }
  } catch {
    // fall through — default to deny with generic reason
  }

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
): string {
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: "claude",
    status: "idle",
    task: "session ended",
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `claude-hook:${sessionId}:${timestamp}:session-end`,
        kind: "system",
        source: "system",
        title: "Session ended",
        body: "Claude session ended",
        timestamp,
        tone: "idle",
      },
    ],
  });
}

export function buildClaudeEventLine(rawStdin: string, env: NodeJS.ProcessEnv): string {
  const payload = parseClaudeHookPayload(rawStdin.trim());
  const sessionId = firstString(payload, ["session_id", "sessionId"]);
  if (!sessionId) {
    throw new Error("claudeHook: missing session_id");
  }

  const hookEventName = firstString(payload, ["hook_event_name", "event_name"]) ?? "unknown";
  const cwd = firstString(payload, ["cwd"]) ?? env.CLAUDE_PROJECT_DIR?.trim();
  const timestamp = Date.now();

  switch (hookEventName) {
    case "UserPromptSubmit":
      return buildUserPromptEvent(payload, sessionId, timestamp, cwd, hookEventName);
    case "SessionStart":
      return buildSessionStartEvent(sessionId, timestamp, cwd, hookEventName);
    case "Stop":
    case "SubagentStop":
      return buildStopEvent(payload, sessionId, timestamp, cwd, hookEventName);
    case "SessionEnd":
      return buildSessionEndEvent(sessionId, timestamp, cwd, hookEventName);
    case "Notification":
      return buildNotificationEvent(payload, sessionId, timestamp, cwd, hookEventName);
    default:
      return JSON.stringify({
        type: "status_change",
        sessionId,
        tool: "claude",
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
): Promise<string> {
  return buildClaudeEventLine(rawStdin, env);
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
): Promise<string | undefined> {
  const trimmed = rawStdin.trim();
  const payload = parseClaudeHookPayload(trimmed);
  const sessionId = firstString(payload, ["session_id", "sessionId"]);
  if (!sessionId) {
    throw new Error("claudeHook: missing session_id");
  }

  const hookEventName = firstString(payload, ["hook_event_name", "event_name"]) ?? "PreToolUse";
  const cwd = firstString(payload, ["cwd"]) ?? env.CLAUDE_PROJECT_DIR?.trim();
  const timestamp = Date.now();

  const { outbound } = buildPreToolUseOutbound(payload, sessionId, timestamp, cwd, hookEventName);
  const responseLine = await runBlockingHookFromRaw(outbound, env);
  if (!responseLine) {
    return undefined;
  }
  return formatClaudePreToolUseResponse(responseLine);
}
