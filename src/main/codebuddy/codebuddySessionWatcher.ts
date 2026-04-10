import fs from "node:fs";
import path from "node:path";
import { normalizeCodeBuddyLogEvent } from "../../adapters/codebuddy/normalizeCodeBuddyLogEvent";
import {
  extractConversationId,
  normalizeCodeBuddyUiMessage,
} from "../../adapters/codebuddy/normalizeCodeBuddyUiMessage";
import { isSessionStatus, type ActivityItem } from "../../shared/sessionTypes";
import { ACTIVE_SESSION_STALENESS_MS, type SessionEvent } from "../session/sessionStore";
import { createAdaptivePollScheduler } from "../session/createAdaptivePollScheduler";

type CodeBuddySessionWatcherOptions = {
  projectsRoot: string;
  appTasksRoot?: string;
  appHistoryRoot?: string;
  onEvent: (event: SessionEvent) => void;
  pollIntervalMs?: number;
  initialBootstrapLookbackMs?: number;
};

type FileCursor = {
  offset: number;
  remainder: string;
};

type UiFileCursor = {
  itemCount: number;
};

type HistoryFileCursor = {
  messageIds: Set<string>;
  completedRequestIds: Set<string>;
};

type SessionToolState = {
  toolNamesByCallId: Map<string, string>;
};

type CodeBuddyHistoryMessageIndexEntry = {
  id?: unknown;
  role?: unknown;
};

type CodeBuddyHistoryRequestIndexEntry = {
  id?: unknown;
  state?: unknown;
  startedAt?: unknown;
  messages?: unknown;
};

function listJsonlFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const pathname = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(pathname);
      } else if (entry.isFile() && pathname.endsWith(".jsonl")) {
        files.push(pathname);
      }
    }
  }

  return files
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 10)
    .sort();
}

function listUiMessageFiles(root: string): string[] {
  if (!root || !fs.existsSync(root)) return [];

  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const pathname = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(pathname);
      } else if (entry.isFile() && entry.name === "ui_messages.json") {
        files.push(pathname);
      }
    }
  }

  return files
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 10)
    .sort();
}

function listHistoryIndexFiles(root: string): string[] {
  if (!root || !fs.existsSync(root)) return [];

  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const pathname = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(pathname);
        continue;
      }
      if (
        entry.isFile() &&
        entry.name === "index.json" &&
        pathname.includes(`${path.sep}history${path.sep}`) &&
        fs.existsSync(path.join(path.dirname(pathname), "messages"))
      ) {
        files.push(pathname);
      }
    }
  }

  return files
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 20)
    .sort();
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractTextFromContentBlocks(
  value: unknown,
  allowedTypes: readonly string[],
): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parts = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const type = typeof item.type === "string" ? item.type : "";
      if (!allowedTypes.includes(type)) {
        return "";
      }
      return typeof item.text === "string" ? item.text.trim() : "";
    })
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n\n");
}

function extractUserQuery(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function readCodeBuddyHistoryMessage(
  filePath: string,
): { role: "user" | "assistant"; body: string; timestamp: number } | null {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const role = parsed.role === "assistant" ? "assistant" : parsed.role === "user" ? "user" : null;
  if (!role) {
    return null;
  }

  const parsedMessage = parseJsonObject(
    typeof parsed.message === "string" ? parsed.message : undefined,
  );
  const parsedExtra = parseJsonObject(typeof parsed.extra === "string" ? parsed.extra : undefined);
  const timestamp = fs.statSync(filePath).mtimeMs;

  let body =
    role === "user"
      ? extractTextFromContentBlocks(parsedExtra?.sourceContentBlocks, ["text"]) ??
        extractTextFromContentBlocks(parsedExtra?.inputPhrase, ["normal"]) ??
        extractUserQuery(extractTextFromContentBlocks(parsedMessage?.content, ["text"])) ??
        extractTextFromContentBlocks(parsedMessage?.content, ["text"])
      : extractTextFromContentBlocks(parsedMessage?.content, ["text"]) ??
        extractTextFromContentBlocks(parsedMessage?.content, ["reasoning"]);

  body = body?.trim();
  if (!body) {
    return null;
  }

  return { role, body, timestamp };
}

function stateForSession(
  stateBySessionId: Map<string, SessionToolState>,
  sessionId: string,
): SessionToolState {
  const existing = stateBySessionId.get(sessionId);
  if (existing) {
    return existing;
  }
  const created: SessionToolState = {
    toolNamesByCallId: new Map<string, string>(),
  };
  stateBySessionId.set(sessionId, created);
  return created;
}

function firstCallId(items: ActivityItem[] | undefined): string | undefined {
  const raw = items?.[0]?.meta?.callId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function rewriteToolResultNames(
  event: SessionEvent,
  toolNamesByCallId: Map<string, string>,
): SessionEvent {
  const callId = firstCallId(event.activityItems);
  if (!callId) {
    return event;
  }
  const toolName = toolNamesByCallId.get(callId);
  if (!toolName) {
    return event;
  }
  return {
    ...event,
    activityItems: event.activityItems?.map((item) =>
      item.kind === "tool" && item.toolPhase === "result"
        ? {
            ...item,
            title: toolName,
            toolName,
          }
        : item,
    ),
  };
}

export function createCodeBuddySessionWatcher(options: CodeBuddySessionWatcherOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const initialBootstrapLookbackMs =
    options.initialBootstrapLookbackMs ?? ACTIVE_SESSION_STALENESS_MS;
  const cursors = new Map<string, FileCursor>();
  const uiCursors = new Map<string, UiFileCursor>();
  const historyCursors = new Map<string, HistoryFileCursor>();
  const uiSessionIds = new Map<string, string>();
  const stateBySessionId = new Map<string, SessionToolState>();
  const scheduler = createAdaptivePollScheduler({
    poll: () => api.pollOnce(),
    fastIntervalMs: pollIntervalMs,
    maxIntervalMs: pollIntervalMs * 4,
    onError: (error) => {
      console.error("[CodePal CodeBuddy] poll failed:", (error as Error).message);
    },
  });
  let didInitialBootstrap = false;

  async function pollFile(filePath: string, initialCutoffMs: number | null): Promise<boolean> {
    const stat = fs.statSync(filePath);
    const existing = cursors.get(filePath) ?? { offset: 0, remainder: "" };
    const offset = stat.size < existing.offset ? 0 : existing.offset;
    const content = fs.readFileSync(filePath).subarray(offset).toString("utf8");

    let nextOffset = stat.size;
    const text = `${existing.remainder}${content}`;
    const lines = text.split("\n");
    const remainder = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (initialCutoffMs !== null) {
        const entry = parseLine(trimmed);
        const parsedTimestamp =
          typeof entry?.timestamp === "number" ? entry.timestamp : Number.NaN;
        if (Number.isFinite(parsedTimestamp) && parsedTimestamp < initialCutoffMs) {
          continue;
        }
      }

      const normalized = normalizeCodeBuddyLogEvent(trimmed, filePath);
      if (!normalized || !isSessionStatus(normalized.status)) {
        continue;
      }

      const sessionState = stateForSession(stateBySessionId, normalized.sessionId);
      const toolCall = normalized.activityItems?.find(
        (item) => item.kind === "tool" && item.toolPhase === "call",
      );
      const callId =
        typeof toolCall?.meta?.callId === "string" ? toolCall.meta.callId.trim() : undefined;
      if (callId && toolCall.toolName) {
        sessionState.toolNamesByCallId.set(callId, toolCall.toolName);
      }

      const rewritten = rewriteToolResultNames(normalized, sessionState.toolNamesByCallId);

      options.onEvent({
        type: rewritten.type,
        sessionId: rewritten.sessionId,
        tool: rewritten.tool,
        status: rewritten.status,
        task: rewritten.task,
        timestamp: rewritten.timestamp,
        ...(rewritten.meta !== undefined ? { meta: rewritten.meta } : {}),
        ...(rewritten.activityItems !== undefined
          ? { activityItems: rewritten.activityItems }
          : {}),
      });
    }

    if (remainder) {
      nextOffset -= Buffer.byteLength(remainder, "utf8");
    }
    cursors.set(filePath, { offset: nextOffset, remainder });
    return offset !== nextOffset || remainder !== existing.remainder;
  }

  async function pollUiFile(filePath: string, initialCutoffMs: number | null): Promise<boolean> {
    const raw = fs.readFileSync(filePath, "utf8");
    let entries: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(raw) as unknown;
      entries = Array.isArray(parsed)
        ? parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        : [];
    } catch {
      return;
    }

    const taskId = path.basename(path.dirname(filePath));
    const conversationId = entries.map(extractConversationId).find((value) => Boolean(value));
    const existingSessionId = uiSessionIds.get(filePath);
    const sessionId =
      existingSessionId ??
      conversationId ??
      `codebuddy-ui:${taskId}`;
    if (!existingSessionId) {
      uiSessionIds.set(filePath, sessionId);
    }
    const cursor = uiCursors.get(filePath);
    const startIndex =
      !cursor || entries.length < cursor.itemCount ? 0 : cursor.itemCount;

    for (let index = startIndex; index < entries.length; index += 1) {
      const entry = entries[index];
      const parsedTimestamp =
        typeof entry.ts === "number" && Number.isFinite(entry.ts) ? entry.ts : Number.NaN;
      if (initialCutoffMs !== null && Number.isFinite(parsedTimestamp) && parsedTimestamp < initialCutoffMs) {
        continue;
      }

      const normalized = normalizeCodeBuddyUiMessage(entry, {
        sourcePath: filePath,
        taskId,
        sessionId,
      });
      if (!normalized || !isSessionStatus(normalized.status)) {
        continue;
      }

      options.onEvent({
        type: normalized.type,
        sessionId: normalized.sessionId,
        tool: normalized.tool,
        status: normalized.status,
        task: normalized.task,
        timestamp: normalized.timestamp,
        ...(normalized.meta !== undefined ? { meta: normalized.meta } : {}),
        ...(normalized.activityItems !== undefined
          ? { activityItems: normalized.activityItems }
          : {}),
      });
    }

    uiCursors.set(filePath, { itemCount: entries.length });
    return entries.length !== (cursor?.itemCount ?? 0);
  }

  async function pollHistoryIndexFile(
    filePath: string,
    initialCutoffMs: number | null,
  ): Promise<boolean> {
    const raw = fs.readFileSync(filePath, "utf8");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const conversationDir = path.dirname(filePath);
    const messagesDir = path.join(conversationDir, "messages");
    if (!fs.existsSync(messagesDir)) {
      return;
    }

    const sessionId = path.basename(conversationDir);
    const cursor =
      historyCursors.get(filePath) ??
      {
        messageIds: new Set<string>(),
        completedRequestIds: new Set<string>(),
      };
    const previousMessageCount = cursor.messageIds.size;
    const previousCompletedRequestCount = cursor.completedRequestIds.size;

    const messageEntries = Array.isArray(parsed.messages)
      ? parsed.messages.filter(
          (entry): entry is CodeBuddyHistoryMessageIndexEntry =>
            Boolean(entry && typeof entry === "object"),
        )
      : [];

    const messageDetails = new Map<
      string,
      { role: "user" | "assistant"; body: string; timestamp: number }
    >();
    let latestUserTask: string | undefined;

    for (const messageEntry of messageEntries) {
      const messageId =
        typeof messageEntry.id === "string" && messageEntry.id.trim()
          ? messageEntry.id.trim()
          : null;
      if (!messageId || cursor.messageIds.has(messageId)) {
        continue;
      }
      const messagePath = path.join(messagesDir, `${messageId}.json`);
      if (!fs.existsSync(messagePath)) {
        continue;
      }
      const message = readCodeBuddyHistoryMessage(messagePath);
      if (!message) {
        continue;
      }
      if (initialCutoffMs !== null && message.timestamp < initialCutoffMs) {
        cursor.messageIds.add(messageId);
        continue;
      }

      messageDetails.set(messageId, message);
      cursor.messageIds.add(messageId);

      if (message.role === "user") {
        latestUserTask = message.body;
        continue;
      }

      options.onEvent({
        type: "update",
        sessionId,
        tool: "codebuddy",
        status: "running",
        task: latestUserTask,
        timestamp: message.timestamp,
        meta: {
          event_source: "codebuddy_ide_history",
          source_path: messagePath,
        },
        activityItems: [
          {
            id: `codebuddy-history:${sessionId}:${messageId}`,
            kind: "message",
            source: "assistant",
            title: "Assistant",
            body: message.body,
            timestamp: message.timestamp,
            tone: "completed",
          },
        ],
      });
    }

    const requestEntries = Array.isArray(parsed.requests)
      ? parsed.requests.filter(
          (entry): entry is CodeBuddyHistoryRequestIndexEntry =>
            Boolean(entry && typeof entry === "object"),
        )
      : [];
    for (const requestEntry of requestEntries) {
      const requestId =
        typeof requestEntry.id === "string" && requestEntry.id.trim()
          ? requestEntry.id.trim()
          : null;
      if (!requestId || cursor.completedRequestIds.has(requestId)) {
        continue;
      }
      if (requestEntry.state !== "complete") {
        continue;
      }
      const relatedMessageIds = Array.isArray(requestEntry.messages)
        ? requestEntry.messages.filter((value): value is string => typeof value === "string")
        : [];
      const latestMessageTimestamp = relatedMessageIds
        .map((messageId) => messageDetails.get(messageId)?.timestamp)
        .filter((value): value is number => typeof value === "number")
        .sort((a, b) => b - a)[0];
      const startedAt =
        typeof requestEntry.startedAt === "number" && Number.isFinite(requestEntry.startedAt)
          ? requestEntry.startedAt
          : 0;
      const timestamp = Math.max(startedAt, latestMessageTimestamp ?? 0);
      if (initialCutoffMs !== null && timestamp < initialCutoffMs) {
        cursor.completedRequestIds.add(requestId);
        continue;
      }

      cursor.completedRequestIds.add(requestId);
      options.onEvent({
        type: "update",
        sessionId,
        tool: "codebuddy",
        status: "completed",
        timestamp,
        meta: {
          event_source: "codebuddy_ide_history",
          source_path: filePath,
          request_id: requestId,
        },
      });
    }

    historyCursors.set(filePath, cursor);
    return (
      cursor.messageIds.size !== previousMessageCount ||
      cursor.completedRequestIds.size !== previousCompletedRequestCount
    );
  }

  const api = {
    async pollOnce() {
      const initialCutoffMs = didInitialBootstrap
        ? null
        : Number.isFinite(initialBootstrapLookbackMs)
          ? Date.now() - initialBootstrapLookbackMs
          : null;
      const files = listJsonlFiles(options.projectsRoot);
      let hadActivity = false;
      for (const filePath of files) {
        hadActivity = (await pollFile(filePath, initialCutoffMs)) || hadActivity;
      }
      const uiFiles = listUiMessageFiles(options.appTasksRoot ?? "");
      for (const filePath of uiFiles) {
        hadActivity = (await pollUiFile(filePath, initialCutoffMs)) || hadActivity;
      }
      const historyFiles = listHistoryIndexFiles(options.appHistoryRoot ?? "");
      for (const filePath of historyFiles) {
        hadActivity = (await pollHistoryIndexFile(filePath, initialCutoffMs)) || hadActivity;
      }
      didInitialBootstrap = true;
      return hadActivity;
    },
    start() {
      scheduler.start();
    },
    stop() {
      scheduler.stop();
    },
  };

  return api;
}
