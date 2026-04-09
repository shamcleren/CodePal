function firstString(payload: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function parseClaudeInternalHookPayload(trimmed: string): Record<string, unknown> {
  if (!trimmed) {
    throw new Error("claudeInternalHook: empty payload");
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload must be a JSON object");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`claudeInternalHook: invalid JSON: ${message}`);
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
    tool: "claude-internal",
    status: "running",
    task: prompt,
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `claude-internal-hook:${sessionId}:${timestamp}:user`,
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
    tool: "claude-internal",
    status: "running",
    task: "Claude Internal session started",
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `claude-internal-hook:${sessionId}:${timestamp}:start`,
        kind: "system",
        source: "system",
        title: "Session started",
        body: "Claude Internal session started",
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
    tool: "claude-internal",
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
        id: `claude-internal-hook:${sessionId}:${timestamp}:stop`,
        kind: "system",
        source: "system",
        title: "Session ended",
        body: "Claude Internal request finished",
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
  const message = firstString(payload, ["message", "notification", "prompt"]) ?? "Claude Internal notification";
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: "claude-internal",
    status: "waiting",
    task: message,
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      notification_type: "claude_internal_notification",
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `claude-internal-hook:${sessionId}:${timestamp}:notification`,
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

function buildSessionEndEvent(
  sessionId: string,
  timestamp: number,
  cwd: string | undefined,
  hookEventName: string,
): string {
  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: "claude-internal",
    status: "idle",
    task: "session ended",
    timestamp,
    meta: {
      hook_event_name: hookEventName,
      ...(cwd ? { cwd } : {}),
    },
    activityItems: [
      {
        id: `claude-internal-hook:${sessionId}:${timestamp}:session-end`,
        kind: "system",
        source: "system",
        title: "Session ended",
        body: "Claude Internal session ended",
        timestamp,
        tone: "idle",
      },
    ],
  });
}

export function buildClaudeInternalEventLine(rawStdin: string, env: NodeJS.ProcessEnv): string {
  const payload = parseClaudeInternalHookPayload(rawStdin.trim());
  const sessionId = firstString(payload, ["session_id", "sessionId"]);
  if (!sessionId) {
    throw new Error("claudeInternalHook: missing session_id");
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
        tool: "claude-internal",
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

export async function runClaudeInternalHookPipeline(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return buildClaudeInternalEventLine(rawStdin, env);
}
