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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function parseTimestamp(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : Date.now();
}

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

function sessionIdFromPath(sourcePath: string): string | null {
  const basename = path.basename(sourcePath, ".jsonl").trim();
  return basename || null;
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

function contentItems(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function extractTextSegments(content: unknown, segmentType: string): string[] {
  return contentItems(content)
    .filter((item) => item.type === segmentType)
    .map((item) => fullText(typeof item.text === "string" ? item.text : undefined))
    .filter((item): item is string => Boolean(item));
}

function buildMeta(entry: Record<string, unknown>, sourcePath: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    event_type: typeof entry.type === "string" ? entry.type : "unknown",
    source_path: sourcePath,
  };
  if (typeof entry.role === "string" && entry.role.trim()) {
    meta.role = entry.role.trim();
  }
  const providerData = asRecord(entry.providerData);
  if (typeof providerData?.agent === "string" && providerData.agent.trim()) {
    meta.agent = providerData.agent.trim();
  }
  if (typeof entry.name === "string" && entry.name.trim()) {
    meta.tool_name = entry.name.trim();
  }
  if (typeof entry.callId === "string" && entry.callId.trim()) {
    meta.callId = entry.callId.trim();
  }
  return meta;
}

function messageEvent(
  entry: Record<string, unknown>,
  sessionId: string,
  sourcePath: string,
): StatusChangeUpstreamEvent | null {
  const role = typeof entry.role === "string" ? entry.role.trim() : "";
  const timestamp = parseTimestamp(entry.timestamp);
  const meta = buildMeta(entry, sourcePath);

  if (role === "user") {
    const body = extractTextSegments(entry.content, "input_text").join("\n\n").trim();
    if (!body) {
      return null;
    }
    return {
      type: "status_change",
      sessionId,
      tool: "codebuddy",
      status: "running",
      task: firstLine(body),
      timestamp,
      meta,
      activityItems: [
        {
          id: `codebuddy:${timestamp}:user-message`,
          kind: "message",
          source: "user",
          title: "User",
          body,
          timestamp,
        },
      ],
    };
  }

  if (role !== "assistant") {
    return null;
  }

  const body = extractTextSegments(entry.content, "output_text").join("\n\n").trim();
  if (!body) {
    return null;
  }

  return {
    type: "status_change",
    sessionId,
    tool: "codebuddy",
    status: entry.status === "completed" ? "completed" : "running",
    task: firstLine(body),
    timestamp,
    meta,
    activityItems: [
      {
        id: `codebuddy:${timestamp}:assistant-message`,
        kind: "message",
        source: "assistant",
        title: "Assistant",
        body,
        timestamp,
      },
    ],
  };
}

function toolCallEvent(
  entry: Record<string, unknown>,
  sessionId: string,
  sourcePath: string,
): StatusChangeUpstreamEvent {
  const timestamp = parseTimestamp(entry.timestamp);
  const toolName = fullText(typeof entry.name === "string" ? entry.name : undefined, "Tool") ?? "Tool";
  const providerData = asRecord(entry.providerData);
  const callId =
    typeof entry.callId === "string" && entry.callId.trim() ? entry.callId.trim() : undefined;
  const body =
    fullText(
      typeof providerData?.argumentsDisplayText === "string"
        ? providerData.argumentsDisplayText
        : undefined,
    ) ??
    stringifyValue(entry.arguments) ??
    toolName;

  return {
    type: "status_change",
    sessionId,
    tool: "codebuddy",
    status: "running",
    task: toolName,
    timestamp,
    meta: buildMeta(entry, sourcePath),
    activityItems: [
      {
        id: `codebuddy:${timestamp}:tool-call`,
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

function toolResultBody(entry: Record<string, unknown>): string {
  const output = asRecord(entry.output);
  const providerData = asRecord(entry.providerData);
  const toolResult = asRecord(providerData?.toolResult);
  return (
    fullText(typeof output?.text === "string" ? output.text : undefined) ??
    fullText(typeof toolResult?.content === "string" ? toolResult.content : undefined) ??
    stringifyValue(entry.output) ??
    fullText(typeof entry.status === "string" ? entry.status : undefined, "Tool result") ??
    "Tool result"
  );
}

function toolResultEvent(
  entry: Record<string, unknown>,
  sessionId: string,
  sourcePath: string,
): StatusChangeUpstreamEvent {
  const timestamp = parseTimestamp(entry.timestamp);
  const toolName = fullText(typeof entry.name === "string" ? entry.name : undefined, "Tool") ?? "Tool";
  const callId =
    typeof entry.callId === "string" && entry.callId.trim() ? entry.callId.trim() : undefined;
  const body = toolResultBody(entry);

  return {
    type: "status_change",
    sessionId,
    tool: "codebuddy",
    status: entry.status === "completed" ? "running" : "error",
    task: firstLine(body, toolName),
    timestamp,
    meta: buildMeta(entry, sourcePath),
    activityItems: [
      {
        id: `codebuddy:${timestamp}:tool-result`,
        kind: "tool",
        source: "tool",
        title: toolName,
        body,
        timestamp,
        toolName,
        toolPhase: "result",
        ...(callId ? { meta: { callId } } : {}),
      },
    ],
  };
}

export function normalizeCodeBuddyLogEvent(
  line: string,
  sourcePath: string,
): StatusChangeUpstreamEvent | null {
  const entry = parseLine(line);
  if (!entry) {
    return null;
  }

  const sessionId = sessionIdFromPath(sourcePath);
  if (!sessionId) {
    return null;
  }

  const entryType = typeof entry.type === "string" ? entry.type : "";
  if (entryType === "message") {
    return messageEvent(entry, sessionId, sourcePath);
  }
  if (entryType === "function_call") {
    return toolCallEvent(entry, sessionId, sourcePath);
  }
  if (entryType === "function_call_result") {
    return toolResultEvent(entry, sessionId, sourcePath);
  }
  return null;
}
