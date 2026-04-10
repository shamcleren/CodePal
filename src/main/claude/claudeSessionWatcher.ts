import fs from "node:fs";
import path from "node:path";
import { normalizeClaudeLogEvent } from "../../adapters/claude/normalizeClaudeLogEvent";
import type { SessionEvent } from "../session/sessionStore";
import { ACTIVE_SESSION_STALENESS_MS } from "../session/sessionStore";
import { isSessionStatus, type ActivityItem } from "../../shared/sessionTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";
import { createAdaptivePollScheduler } from "../session/createAdaptivePollScheduler";

type ClaudeSessionWatcherOptions = {
  projectsRoot: string;
  onEvent: (event: SessionEvent) => void;
  onUsageSnapshot?: (snapshot: UsageSnapshot) => void;
  pollIntervalMs?: number;
  initialBootstrapLookbackMs?: number;
};

type FileCursor = {
  offset: number;
  remainder: string;
};

type SessionToolState = {
  toolNamesByCallId: Map<string, string>;
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractUsageSnapshot(
  line: string,
  sourcePath: string,
): UsageSnapshot | null {
  const entry = parseLine(line);
  if (!entry || entry.type !== "assistant") {
    return null;
  }
  const sessionId =
    (typeof entry.sessionId === "string" && entry.sessionId.trim()) ||
    path.basename(sourcePath, ".jsonl");
  if (!sessionId) {
    return null;
  }

  const message = asRecord(entry.message);
  const usage = asRecord(message?.usage);
  if (!usage) {
    return null;
  }

  const input = numberValue(usage.input_tokens);
  const output = numberValue(usage.output_tokens);
  const cachedInput = numberValue(usage.cache_read_input_tokens);
  const total =
    input !== undefined || output !== undefined || cachedInput !== undefined
      ? (input ?? 0) + (output ?? 0) + (cachedInput ?? 0)
      : undefined;

  return {
    agent: "claude",
    sessionId,
    source: "session-derived",
    updatedAt:
      typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Date.now(),
    ...(typeof message?.model === "string" ? { title: message.model } : {}),
    tokens: {
      input,
      output,
      total,
      cachedInput,
    },
    meta: {
      ...(typeof message?.model === "string" ? { model: message.model } : {}),
    },
  };
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
    task: event.task === "Tool result" ? toolName : event.task,
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

export function createClaudeSessionWatcher(options: ClaudeSessionWatcherOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const initialBootstrapLookbackMs =
    options.initialBootstrapLookbackMs ?? ACTIVE_SESSION_STALENESS_MS;
  const cursors = new Map<string, FileCursor>();
  const stateBySessionId = new Map<string, SessionToolState>();
  const scheduler = createAdaptivePollScheduler({
    poll: () => api.pollOnce(),
    fastIntervalMs: pollIntervalMs,
    maxIntervalMs: pollIntervalMs * 4,
    onError: (error) => {
      console.error("[CodePal Claude] poll failed:", (error as Error).message);
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
          typeof entry?.timestamp === "string" ? Date.parse(entry.timestamp) : NaN;
        if (Number.isFinite(parsedTimestamp) && parsedTimestamp < initialCutoffMs) {
          continue;
        }
      }

      const usageSnapshot = extractUsageSnapshot(trimmed, filePath);
      if (usageSnapshot) {
        options.onUsageSnapshot?.(usageSnapshot);
      }

      const normalized = normalizeClaudeLogEvent(trimmed, filePath);
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
