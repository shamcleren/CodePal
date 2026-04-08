import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";

type CodeBuddyUiMessage = Record<string, unknown>;

type NormalizeCodeBuddyUiMessageContext = {
  sourcePath: string;
  taskId: string;
  sessionId: string;
};

function fullText(text: string | undefined, fallback?: string): string | undefined {
  if (typeof text !== "string") {
    return fallback;
  }
  const trimmed = text.trim();
  return trimmed || fallback;
}

function firstLine(text: string | undefined, fallback?: string): string | undefined {
  const normalized = fullText(text, fallback);
  return normalized?.split(/\r?\n/, 1)[0]?.trim() || fallback;
}

function stringifyValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return fullText(value);
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

function firstNestedText(
  value: unknown,
  preferredKeys: readonly string[],
  depth = 0,
): string | undefined {
  if (depth > 3 || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return fullText(value);
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

function parseTimestamp(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : Date.now();
}

function parseJsonText(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function buildMeta(
  entry: CodeBuddyUiMessage,
  context: NormalizeCodeBuddyUiMessageContext,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    event_type: typeof entry.type === "string" ? entry.type : "unknown",
    event_source: "codebuddy_ui_messages",
    source_path: context.sourcePath,
    task_id: context.taskId,
  };
  if (typeof entry.say === "string" && entry.say.trim()) {
    meta.say = entry.say.trim();
  }
  if (typeof entry.ask === "string" && entry.ask.trim()) {
    meta.ask = entry.ask.trim();
  }
  const conversationId = extractConversationId(entry);
  if (conversationId) {
    meta.conversation_id = conversationId;
  }
  return meta;
}

function toolBody(payload: Record<string, unknown>): string {
  return (
    firstNestedText(payload, [
      "response",
      "tool_result",
      "tool_output",
      "file_path",
      "path",
      "uri",
      "url",
      "content",
      "output",
      "result",
      "message",
      "status",
      "summary",
      "text",
    ]) ??
    stringifyValue(payload) ??
    "Tool result"
  );
}

export function extractConversationId(entry: CodeBuddyUiMessage): string | undefined {
  const parsedText = parseJsonText(entry.text);
  const direct =
    (typeof parsedText?.conversationId === "string" && parsedText.conversationId.trim()) ||
    (typeof parsedText?.conversation_id === "string" && parsedText.conversation_id.trim());
  return direct || undefined;
}

export function normalizeCodeBuddyUiMessage(
  entry: CodeBuddyUiMessage,
  context: NormalizeCodeBuddyUiMessageContext,
): StatusChangeUpstreamEvent | null {
  const timestamp = parseTimestamp(entry.ts);
  const type = typeof entry.type === "string" ? entry.type.trim() : "";
  const say = typeof entry.say === "string" ? entry.say.trim() : "";
  const ask = typeof entry.ask === "string" ? entry.ask.trim() : "";
  const text = fullText(typeof entry.text === "string" ? entry.text : undefined);
  const conversationHistoryIndex =
    typeof entry.conversationHistoryIndex === "number" ? entry.conversationHistoryIndex : undefined;
  const partial = entry.partial === true;
  const meta = buildMeta(entry, context);

  if (type === "say" && say === "text" && text) {
    const isUserPrompt = conversationHistoryIndex === -1;
    if (partial) {
      return null;
    }
    return {
      type: "status_change",
      sessionId: context.sessionId,
      tool: "codebuddy",
      status: "running",
      task: firstLine(text),
      timestamp,
      meta,
      activityItems: [
        {
          id: `codebuddy-ui:${context.taskId}:${timestamp}:${isUserPrompt ? "user" : "assistant"}`,
          kind: "message",
          source: isUserPrompt ? "user" : "assistant",
          title: isUserPrompt ? "User" : "Assistant",
          body: text,
          timestamp,
        },
      ],
    };
  }

  if (type === "say" && say === "user_feedback" && text) {
    return {
      type: "status_change",
      sessionId: context.sessionId,
      tool: "codebuddy",
      status: "running",
      task: firstLine(text),
      timestamp,
      meta,
      activityItems: [
        {
          id: `codebuddy-ui:${context.taskId}:${timestamp}:user-feedback`,
          kind: "message",
          source: "user",
          title: "User",
          body: text,
          timestamp,
        },
      ],
    };
  }

  if (type === "say" && say === "tool" && text) {
    const payload = parseJsonText(text);
    const toolName =
      fullText(typeof payload?.tool === "string" ? payload.tool : undefined, "Tool") ?? "Tool";
    return {
      type: "status_change",
      sessionId: context.sessionId,
      tool: "codebuddy",
      status: "running",
      task: toolName,
      timestamp,
      meta: {
        ...meta,
        ...(toolName ? { tool_name: toolName } : {}),
      },
      activityItems: [
        {
          id: `codebuddy-ui:${context.taskId}:${timestamp}:tool`,
          kind: "tool",
          source: "tool",
          title: toolName,
          body: payload ? toolBody(payload) : text,
          timestamp,
          toolName,
          toolPhase: "result",
        },
      ],
    };
  }

  if (type === "ask" && ask === "followup") {
    return {
      type: "status_change",
      sessionId: context.sessionId,
      tool: "codebuddy",
      status: "completed",
      task: firstLine(text, "CodeBuddy response finished"),
      timestamp,
      meta,
      activityItems: text
        ? [
            {
              id: `codebuddy-ui:${context.taskId}:${timestamp}:followup`,
              kind: "note",
              source: "system",
              title: "Follow-up",
              body: text,
              timestamp,
              tone: "completed",
            },
          ]
        : undefined,
    };
  }

  return null;
}
