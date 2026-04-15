import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";
import type { ActivityItem, ExternalApprovalState } from "../../shared/sessionTypes";

function firstString(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function firstNestedText(
  value: unknown,
  preferredKeys: readonly string[],
  depth = 0,
): string | undefined {
  if (depth > 2 || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstNestedText(item, preferredKeys, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const nested = firstNestedText(record[key], preferredKeys, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function stringifyValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function statusFromHook(payload: Record<string, unknown>): string {
  const notificationType = firstString(payload, ["notification_type"]);
  if (notificationType === "permission_prompt") return "waiting";
  if (notificationType === "idle_prompt") return "idle";

  const hookEventName = firstString(payload, ["hook_event_name"]);
  switch (hookEventName) {
    case "Notification":
      return "waiting";
    case "SessionStart":
    case "UserPromptSubmit":
    case "PreToolUse":
    case "PostToolUse":
    case "PreCompact":
    case "WorktreeCreate":
    case "WorktreeRemove":
    case "unstable_Checkpoint":
      return "running";
    case "Stop":
    case "SubagentStop":
      return "idle";
    case "SessionEnd":
      return "offline";
    default:
      return "offline";
  }
}

function pickStatus(payload: Record<string, unknown>): string {
  const explicit = firstString(payload, ["status", "state", "agent_status"]);
  return explicit ?? statusFromHook(payload);
}

function pickTask(payload: Record<string, unknown>): string | undefined {
  return firstString(payload, [
    "task",
    "current_task",
    "message",
    "prompt",
    "tool_name",
    "reason",
    "source",
  ]);
}

function pickSessionId(payload: Record<string, unknown>): string | null {
  const direct = firstString(payload, [
    "session_id",
    "sessionId",
    "conversation_id",
    "conversationId",
  ]);
  return direct ?? null;
}

function pickTimestamp(payload: Record<string, unknown>): number {
  const raw = payload.timestamp ?? payload.ts;
  return typeof raw === "number" ? raw : Date.now();
}

function pickMeta(
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metaEntries: [string, string][] = [];

  const hookEventName = firstString(payload, ["hook_event_name"]);
  if (hookEventName) metaEntries.push(["hook_event_name", hookEventName]);

  const cwd = firstString(payload, ["cwd"]);
  if (cwd) metaEntries.push(["cwd", cwd]);

  const notificationType = firstString(payload, ["notification_type"]);
  if (notificationType) metaEntries.push(["notification_type", notificationType]);

  const toolName = firstString(payload, ["tool_name"]);
  if (toolName) metaEntries.push(["tool_name", toolName]);

  const reason = firstString(payload, ["reason"]);
  if (reason) metaEntries.push(["reason", reason]);

  const source = firstString(payload, ["source"]);
  if (source && source !== "codebuddy") metaEntries.push(["source", source]);

  if (metaEntries.length === 0) return undefined;
  return Object.fromEntries(metaEntries);
}

function pickToolInvocationBody(payload: Record<string, unknown>): string | undefined {
  return (
    firstString(payload, ["command", "command_line", "tool_input"]) ??
    firstNestedText(payload.tool_input, [
      "file_path",
      "path",
      "uri",
      "url",
      "command",
      "query",
      "prompt",
    ])
  );
}

function pickToolResultBody(payload: Record<string, unknown>): string | undefined {
  const resultSource =
    payload.tool_output ??
    payload.tool_result ??
    payload.result ??
    payload.output ??
    payload.response;

  return (
    firstNestedText(resultSource, [
      "result",
      "output",
      "file_path",
      "path",
      "uri",
      "url",
      "message",
      "status",
      "summary",
      "text",
      "content",
    ]) ?? stringifyValue(resultSource)
  );
}

function buildActivityItems(
  payload: Record<string, unknown>,
  status: string,
  task: string | undefined,
): ActivityItem[] | undefined {
  const timestamp = pickTimestamp(payload);
  const hookEventName = firstString(payload, ["hook_event_name"]);
  const notificationType = firstString(payload, ["notification_type"]);
  const toolName = firstString(payload, ["tool_name"]);

  if (hookEventName === "UserPromptSubmit" && task) {
    return [
      {
        id: `codebuddy:${timestamp}:user-message`,
        kind: "message",
        source: "user",
        title: "User",
        body: task,
        timestamp,
      },
    ];
  }

  if (hookEventName === "PreToolUse" && toolName) {
    return [
      {
        id: `codebuddy:${timestamp}:tool:${toolName}`,
        kind: "tool",
        source: "tool",
        title: toolName,
        body: pickToolInvocationBody(payload) ?? task ?? toolName,
        timestamp,
        toolName,
        toolPhase: "call",
      },
    ];
  }

  if (hookEventName === "PostToolUse" && toolName) {
    return [
      {
        id: `codebuddy:${timestamp}:tool-result:${toolName}`,
        kind: "tool",
        source: "tool",
        title: toolName,
        body: pickToolResultBody(payload) ?? task ?? toolName,
        timestamp,
        toolName,
        toolPhase: "result",
      },
    ];
  }

  if (hookEventName === "Notification") {
    return [
      {
        id: `codebuddy:${timestamp}:notification`,
        kind: "note",
        source: "system",
        title: "Notification",
        body: task ?? notificationType ?? "Waiting",
        timestamp,
        tone: "waiting",
        meta: notificationType ? { notificationType } : undefined,
      },
    ];
  }

  if (hookEventName === "SessionStart" || hookEventName === "SessionEnd" || hookEventName === "Stop") {
    return [
      {
        id: `codebuddy:${timestamp}:${hookEventName?.toLowerCase() ?? "session"}`,
        kind: "system",
        source: "system",
        title: hookEventName ?? "Session",
        body: task ?? hookEventName ?? status,
        timestamp,
        tone: status === "offline" ? "system" : undefined,
      },
    ];
  }

  if (task) {
    return [
      {
        id: `codebuddy:${timestamp}:status`,
        kind: "note",
        source: "system",
        title: status.charAt(0).toUpperCase() + status.slice(1),
        body: task,
        timestamp,
        tone:
          status === "running" ||
          status === "completed" ||
          status === "waiting" ||
          status === "idle" ||
          status === "error"
            ? status
            : "system",
      },
    ];
  }

  return undefined;
}

function buildExternalApproval(
  payload: Record<string, unknown>,
  sessionId: string,
  timestamp: number,
): ExternalApprovalState | undefined {
  const notificationType = firstString(payload, ["notification_type"]);
  const message = firstString(payload, ["message", "prompt", "task"]);

  if (
    notificationType !== "permission_prompt" &&
    !(message && (/\b(permission|approval|approve|allow)\b/i.test(message) || /权限|授权|审批|批准|允许/.test(message)))
  ) {
    return undefined;
  }

  const cwd = firstString(payload, ["cwd"]);
  const conversationId = firstString(payload, ["conversation_id", "conversationId"]);
  const appName = firstString(payload, ["host_app", "app_name", "client"]) ?? "CodeBuddy";

  return {
    kind: "approval_required",
    title: "Approval required in CodeBuddy",
    message: message ?? "CodeBuddy needs your approval",
    sourceTool: "codebuddy",
    updatedAt: timestamp,
    jumpTarget: {
      agent: "codebuddy",
      appName,
      ...(cwd ? { workspacePath: cwd } : {}),
      sessionId,
      ...(conversationId ? { conversationId } : {}),
      fallbackBehavior: "activate_app",
    },
  };
}

export function normalizeCodeBuddyEvent(
  payload: Record<string, unknown>,
): StatusChangeUpstreamEvent | null {
  const sessionId = pickSessionId(payload);
  if (!sessionId) {
    return null;
  }

  const status = pickStatus(payload);
  const task = pickTask(payload);
  const timestamp = pickTimestamp(payload);
  const activityItems = buildActivityItems(payload, status, task);
  const externalApproval = buildExternalApproval(payload, sessionId, timestamp);
  return {
    type: "status_change",
    sessionId,
    tool: "codebuddy",
    status,
    task,
    timestamp,
    meta: pickMeta(payload),
    ...(activityItems ? { activityItems } : {}),
    ...(externalApproval ? { externalApproval } : {}),
  };
}
