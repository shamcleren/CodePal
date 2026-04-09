import path from "node:path";
import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseTimestamp(raw: unknown): number {
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  return Date.now();
}

function firstLine(text: string | undefined, fallback?: string): string | undefined {
  if (typeof text !== "string") return fallback;
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\r?\n/, 1)[0]?.trim() || fallback;
}

function fullText(text: string | undefined, fallback?: string): string | undefined {
  if (typeof text !== "string") return fallback;
  const trimmed = text.trim();
  return trimmed || fallback;
}

function sessionIdFromPath(sourcePath: string): string | null {
  const basename = path.basename(sourcePath);
  const match = basename.match(
    /([0-9a-f]{8,}(?:-[0-9a-f]{4,}){3,})\.jsonl$/i,
  );
  return match?.[1] ?? null;
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractTextSegments(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => item.type === "text")
    .map((item) => fullText(typeof item.text === "string" ? item.text : undefined))
    .filter((item): item is string => Boolean(item));
}

function firstToolUseSegment(content: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }
  return content
    .map((item) => asRecord(item))
    .find((item) => item?.type === "tool_use");
}

function firstToolResultSegment(content: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }
  return content
    .map((item) => asRecord(item))
    .find((item) => item?.type === "tool_result");
}

function buildMeta(entry: Record<string, unknown>, sourcePath: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    event_type: typeof entry.type === "string" ? entry.type : "unknown",
    source_path: sourcePath,
  };
  if (typeof entry.cwd === "string" && entry.cwd.trim()) {
    meta.cwd = entry.cwd.trim();
  }
  if (typeof entry.gitBranch === "string" && entry.gitBranch.trim()) {
    meta.git_branch = entry.gitBranch.trim();
  }
  if (typeof entry.version === "string" && entry.version.trim()) {
    meta.version = entry.version.trim();
  }
  const message = asRecord(entry.message);
  if (typeof message?.role === "string" && message.role.trim()) {
    meta.role = message.role.trim();
  }
  if (typeof message?.model === "string" && message.model.trim()) {
    meta.model = message.model.trim();
  }
  const progress = asRecord(entry.data);
  if (typeof progress?.type === "string" && progress.type.trim()) {
    meta.progress_type = progress.type.trim();
  }
  if (typeof progress?.hookEvent === "string" && progress.hookEvent.trim()) {
    meta.hook_event = progress.hookEvent.trim();
  }
  if (typeof progress?.hookName === "string" && progress.hookName.trim()) {
    meta.hook_name = progress.hookName.trim();
  }
  return meta;
}

function userMessageText(entry: Record<string, unknown>): string | undefined {
  const message = asRecord(entry.message);
  const content = message?.content;
  if (typeof content === "string") {
    return fullText(content);
  }
  return undefined;
}

function isClaudeControlUserMessage(entry: Record<string, unknown>, text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }
  if (entry.isMeta === true || entry.isCompactSummary === true || entry.isVisibleInTranscriptOnly === true) {
    return true;
  }
  return (
    trimmed.startsWith("<local-command-caveat>") ||
    trimmed.startsWith("<command-name>") ||
    trimmed.startsWith("<command-message>") ||
    trimmed.startsWith("<command-args>") ||
    trimmed.startsWith("<local-command-stdout>") ||
    trimmed === "[Request interrupted by user for tool use]" ||
    trimmed.startsWith("This session is being continued from a previous conversation that ran out of context.")
  );
}

function isRejectedToolResult(toolResult: Record<string, unknown>, entry: Record<string, unknown>): boolean {
  const content =
    fullText(typeof toolResult.content === "string" ? toolResult.content : undefined) ?? "";
  return (
    toolResult.is_error === true &&
    (content.startsWith("The user doesn't want to proceed with this tool use.") ||
      fullText(typeof entry.toolUseResult === "string" ? entry.toolUseResult : undefined) ===
        "User rejected tool use")
  );
}

export function normalizeClaudeInternalLogEvent(
  line: string,
  sourcePath: string,
): StatusChangeUpstreamEvent | null {
  const entry = parseLine(line);
  if (!entry) return null;

  const sessionId =
    (typeof entry.sessionId === "string" && entry.sessionId.trim()) ||
    sessionIdFromPath(sourcePath);
  if (!sessionId) return null;

  const timestamp = parseTimestamp(entry.timestamp);
  const entryType = typeof entry.type === "string" ? entry.type : "";
  const message = asRecord(entry.message);
  const progress = asRecord(entry.data);
  const meta = buildMeta(entry, sourcePath);

  if (entryType === "progress" && progress?.type === "hook_progress") {
    const hookEvent =
      typeof progress.hookEvent === "string" ? progress.hookEvent.trim() : "";
    if (hookEvent === "Stop" || hookEvent === "SubagentStop") {
      const title = "Claude Internal request finished";
      return {
        type: "status_change",
        sessionId,
        tool: "claude-internal",
        status: "completed",
        task: title,
        timestamp,
        meta,
        activityItems: [
          {
            id: `claude-internal:${timestamp}:hook-stop`,
            kind: "system",
            source: "system",
            title,
            body: title,
            timestamp,
            tone: "completed",
          },
        ],
      };
    }
    if (hookEvent === "SessionEnd") {
      const title = "Claude Internal session ended";
      return {
        type: "status_change",
        sessionId,
        tool: "claude-internal",
        status: "idle",
        task: title,
        timestamp,
        meta,
        activityItems: [
          {
            id: `claude-internal:${timestamp}:session-end`,
            kind: "system",
            source: "system",
            title,
            body: title,
            timestamp,
            tone: "idle",
          },
        ],
      };
    }
    return null;
  }

  if (entryType === "user") {
    const toolResult = firstToolResultSegment(message?.content);
    if (toolResult) {
      const body =
        stringifyValue(toolResult.content) ??
        fullText(typeof entry.toolUseResult === "string" ? entry.toolUseResult : undefined) ??
        "Tool result";
      const callId =
        typeof toolResult.tool_use_id === "string" ? toolResult.tool_use_id.trim() : undefined;
      const rejected = isRejectedToolResult(toolResult, entry);
      return {
        type: "status_change",
        sessionId,
        tool: "claude-internal",
        status: rejected ? "idle" : "running",
        task: firstLine(body, rejected ? "Tool use rejected" : "Tool result"),
        timestamp,
        meta: {
          ...meta,
          ...(callId ? { callId } : {}),
        },
        activityItems: [
          {
            id: `claude-internal:${timestamp}:tool-result`,
            kind: "tool",
            source: "tool",
            title: "Tool result",
            body,
            timestamp,
            toolName: "Tool result",
            toolPhase: "result",
            ...(rejected ? { tone: "idle" as const } : {}),
            ...(callId ? { meta: { callId } } : {}),
          },
        ],
      };
    }

    const text = userMessageText(entry);
    if (!text || isClaudeControlUserMessage(entry, text)) return null;
    return {
      type: "status_change",
      sessionId,
      tool: "claude-internal",
      status: "running",
      task: firstLine(text),
      timestamp,
      meta,
      activityItems: [
        {
          id: `claude-internal:${timestamp}:user-message`,
          kind: "message",
          source: "user",
          title: "User",
          body: text,
          timestamp,
        },
      ],
    };
  }

  if (entryType !== "assistant") {
    return null;
  }

  const content = message?.content;
  const textSegments = extractTextSegments(content);
  const textBody = textSegments.join("\n\n").trim();
  if (textBody) {
    return {
      type: "status_change",
      sessionId,
      tool: "claude-internal",
      status: message?.stop_reason === "end_turn" ? "completed" : "running",
      task: firstLine(textBody),
      timestamp,
      meta,
      activityItems: [
        {
          id: `claude-internal:${timestamp}:assistant-message`,
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: textBody,
          timestamp,
        },
      ],
    };
  }

  const toolUse = firstToolUseSegment(content);
  if (toolUse) {
    const toolName =
      fullText(typeof toolUse.name === "string" ? toolUse.name : undefined) ?? "Tool";
    const body = stringifyValue(toolUse.input) ?? toolName;
    const callId =
      typeof toolUse.id === "string" && toolUse.id.trim() ? toolUse.id.trim() : undefined;
    return {
      type: "status_change",
      sessionId,
      tool: "claude-internal",
      status: "running",
      task: toolName,
      timestamp,
      meta: {
        ...meta,
        tool_name: toolName,
        ...(callId ? { callId } : {}),
      },
      activityItems: [
        {
          id: `claude-internal:${timestamp}:tool-call`,
          kind: "tool",
          source: "tool",
          title: toolName,
          body,
          timestamp,
          toolName,
          toolPhase: "call",
          ...(callId ? { meta: { callId } } : {}),
        },
      ],
    };
  }

  return null;
}
