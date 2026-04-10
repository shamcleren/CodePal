import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";
import {
  type ActivityItem,
  isPendingAction,
  isPendingClosed,
  isResponseTarget,
  type PendingAction,
} from "../../shared/sessionTypes";

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

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstNestedText(
  value: unknown,
  preferredKeys: readonly string[],
  depth = 0,
): string | undefined {
  if (depth > 2 || value === null || value === undefined) {
    return undefined;
  }

  const direct = trimmedString(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstNestedText(item, preferredKeys, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const nested = firstNestedText(record[key], preferredKeys, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function pickCursorSessionId(payload: Record<string, unknown>): string | null {
  for (const key of ["session_id", "sessionId", "conversation_id", "conversationId", "generation_id", "generationId"]) {
    const raw = payload[key];
    if (raw === undefined || raw === null) continue;
    const s = String(raw).trim();
    if (s.length > 0) {
      return s;
    }
  }
  return null;
}

function statusFromHook(payload: Record<string, unknown>): string {
  const notificationType = firstString(payload, ["notification_type"]);
  if (notificationType === "permission_prompt") return "waiting";
  if (notificationType === "idle_prompt") return "idle";

  const hookEventName = firstString(payload, ["hook_event_name"]);
  switch (hookEventName) {
    case "SessionStart":
    case "UserPromptSubmit":
    case "beforeSubmitPrompt":
    case "PreToolUse":
    case "beforeReadFile":
    case "beforeMCPExecution":
    case "beforeShellExecution":
    case "PostToolUse":
    case "afterAgentResponse":
    case "afterAgentThought":
    case "afterFileEdit":
    case "afterMCPExecution":
    case "afterShellExecution":
      return "running";
    case "Notification":
      return "waiting";
    case "Stop":
    case "SessionEnd":
      return "offline";
    case "StatusChange":
      return String(payload.status);
    default:
      return "running";
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
    "text",
    "tool_name",
    "reason",
    "composer_mode",
  ]);
}

function pickTimestamp(payload: Record<string, unknown>): number {
  const raw = payload.timestamp ?? payload.ts;
  return typeof raw === "number" ? raw : Date.now();
}

type UnsupportedActionMeta = {
  type: string;
  title?: string;
};

function normalizePendingAction(
  payload: Record<string, unknown>,
): { pendingAction: PendingAction | null | undefined; unsupported?: UnsupportedActionMeta } {
  if (!("pendingAction" in payload)) {
    return { pendingAction: undefined };
  }

  const raw = payload.pendingAction;
  if (raw === null) {
    return { pendingAction: null };
  }
  if (isPendingAction(raw)) {
    return { pendingAction: raw };
  }
  if (!raw || typeof raw !== "object") {
    return { pendingAction: null };
  }

  const record = raw as Record<string, unknown>;
  const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : "unknown";
  const title =
    typeof record.title === "string" && record.title.trim() ? record.title.trim() : undefined;
  return {
    pendingAction: null,
    unsupported: { type, title },
  };
}

function pickMeta(
  payload: Record<string, unknown>,
  unsupported?: UnsupportedActionMeta,
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
  if (source && source !== "cursor") metaEntries.push(["source", source]);

  if (unsupported) {
    metaEntries.push(["unsupported_action_type", unsupported.type]);
    if (unsupported.title) {
      metaEntries.push(["unsupported_action_title", unsupported.title]);
    }
  }

  if (metaEntries.length === 0) return undefined;
  return Object.fromEntries(metaEntries);
}

function activityTimestamp(payload: Record<string, unknown>): number {
  return pickTimestamp(payload);
}

function pickToolInvocationBody(payload: Record<string, unknown>): string | undefined {
  return (
    firstString(payload, ["command", "command_line", "tool_input"]) ??
    firstNestedText(payload.tool_input, ["file_path", "path", "uri", "url", "command", "query", "prompt"])
  );
}

function pickToolResultBody(payload: Record<string, unknown>): string | undefined {
  return (
    firstString(payload, ["output", "content", "result"]) ??
    firstNestedText(payload.result, [
      "output",
      "text",
      "content",
      "message",
      "summary",
      "result",
      "response",
      "stdout",
      "stderr",
    ]) ??
    firstNestedText(payload.tool_result, [
      "output",
      "text",
      "content",
      "message",
      "summary",
      "result",
      "response",
      "stdout",
      "stderr",
    ]) ??
    firstNestedText(payload.response, [
      "output",
      "text",
      "content",
      "message",
      "summary",
      "result",
      "response",
      "stdout",
      "stderr",
    ]) ??
    firstString(payload, ["stdout", "stderr"])
  );
}

function pickEditedFileBody(payload: Record<string, unknown>): string | undefined {
  const filePath =
    firstString(payload, ["file_path", "path"]) ??
    firstNestedText(payload.tool_input, ["file_path", "path"]) ??
    firstNestedText(payload.result, ["file_path", "path"]) ??
    firstNestedText(payload.response, ["file_path", "path"]);
  return filePath ? `Edited ${filePath}` : undefined;
}

function buildCursorActivityItems(
  payload: Record<string, unknown>,
  status: string,
  task: string | undefined,
  unsupported?: UnsupportedActionMeta,
): ActivityItem[] | undefined {
  const timestamp = activityTimestamp(payload);
  const hookEventName = firstString(payload, ["hook_event_name"]);
  const notificationType = firstString(payload, ["notification_type"]);
  const toolName = firstString(payload, ["tool_name"]);
  const commandText = pickToolInvocationBody(payload);
  const resultText = pickToolResultBody(payload);

  if (unsupported) {
    return [
      {
        id: `cursor:${timestamp}:unsupported:${unsupported.type}`,
        kind: "system",
        source: "system",
        title: "Unsupported Cursor action",
        body: task ?? `Unsupported Cursor action: ${unsupported.type}`,
        timestamp,
        tone: "waiting",
      },
    ];
  }

  if (hookEventName === "PreToolUse" && toolName) {
    return [
      {
        id: `cursor:${timestamp}:tool:${toolName}`,
        kind: "tool",
        source: "tool",
        title: toolName,
        body: commandText ?? toolName,
        timestamp,
        toolName,
        toolPhase: "call",
      },
    ];
  }

  if (
    (hookEventName === "beforeShellExecution" ||
      hookEventName === "beforeMCPExecution" ||
      hookEventName === "beforeReadFile") &&
    toolName
  ) {
    return [
      {
        id: `cursor:${timestamp}:${hookEventName}:${toolName}`,
        kind: "tool",
        source: "tool",
        title: toolName,
        body: commandText ?? task ?? toolName,
        timestamp,
        toolName,
        toolPhase: "call",
      },
    ];
  }

  if (
    hookEventName === "afterShellExecution" ||
    hookEventName === "afterMCPExecution" ||
    hookEventName === "PostToolUse"
  ) {
    const resolvedToolName = toolName ?? "Tool";
    const fallbackTask = task && task !== resolvedToolName ? task : undefined;
    return [
      {
        id: `cursor:${timestamp}:${hookEventName}:${resolvedToolName}`,
        kind: "tool",
        source: "tool",
        title: resolvedToolName,
        body: resultText ?? fallbackTask ?? commandText ?? resolvedToolName,
        timestamp,
        toolName: resolvedToolName,
        toolPhase: "result",
      },
    ];
  }

  if (hookEventName === "Notification") {
    return [
      {
        id: `cursor:${timestamp}:notification`,
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

  if (hookEventName === "beforeSubmitPrompt" || hookEventName === "UserPromptSubmit") {
    if (!task) return undefined;
    return [
      {
        id: `cursor:${timestamp}:user-message`,
        kind: "message",
        source: "user",
        title: "User",
        body: task,
        timestamp,
      },
    ];
  }

  if (hookEventName === "afterAgentResponse") {
    if (!task) return undefined;
    return [
      {
        id: `cursor:${timestamp}:assistant-message`,
        kind: "message",
        source: "assistant",
        title: "Assistant",
        body: task,
        timestamp,
      },
    ];
  }

  if (hookEventName === "afterAgentThought") {
    if (!task) return undefined;
    return [
      {
        id: `cursor:${timestamp}:agent-thought`,
        kind: "note",
        source: "system",
        title: "Agent Thought",
        body: task,
        timestamp,
        tone: "running",
      },
    ];
  }

  if (hookEventName === "afterFileEdit") {
    return [
      {
        id: `cursor:${timestamp}:file-edit`,
        kind: "system",
        source: "system",
        title: "File Edit",
        body: task ?? pickEditedFileBody(payload) ?? "File edited",
        timestamp,
      },
    ];
  }

  if (hookEventName === "SessionStart" || hookEventName === "SessionEnd" || hookEventName === "Stop") {
    return [
      {
        id: `cursor:${timestamp}:${hookEventName?.toLowerCase() ?? "session"}`,
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
        id: `cursor:${timestamp}:status`,
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

export function normalizeCursorEvent(
  payload: Record<string, unknown>,
): StatusChangeUpstreamEvent | null {
  const sessionId = pickCursorSessionId(payload);
  if (!sessionId) return null;

  const hookEventName = firstString(payload, ["hook_event_name"]);
  if (hookEventName === "afterAgentThought") {
    return null;
  }
  const composerMode = firstString(payload, ["composer_mode"]);
  if (hookEventName === "SessionStart" && composerMode === "agent") {
    return null;
  }

  const { pendingAction, unsupported } = normalizePendingAction(payload);
  const pendingClosed = isPendingClosed(payload.pendingClosed) ? payload.pendingClosed : undefined;
  const responseTarget = isResponseTarget(payload.responseTarget) ? payload.responseTarget : undefined;
  const task = unsupported ? `Unsupported Cursor action: ${unsupported.type}` : pickTask(payload);
  const status = pickStatus(payload);
  const activityItems = buildCursorActivityItems(payload, status, task, unsupported);

  return {
    type: "status_change",
    sessionId,
    tool: "cursor",
    status,
    task,
    timestamp: pickTimestamp(payload),
    meta: pickMeta(payload, unsupported),
    ...(activityItems ? { activityItems } : {}),
    ...(pendingAction !== undefined ? { pendingAction } : {}),
    ...(responseTarget !== undefined ? { responseTarget } : {}),
    ...(pendingClosed !== undefined ? { pendingClosed } : {}),
  };
}
