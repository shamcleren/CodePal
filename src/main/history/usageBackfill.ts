import fs from "node:fs";
import path from "node:path";
import type { TokenUsageWrite, UsageImportStatus } from "../../shared/usageTypes";
import type { createHistoryStore } from "./historyStore";

type HistoryStoreForBackfill = Pick<
  ReturnType<typeof createHistoryStore>,
  "writeTokenUsage" | "writeUsageSessionSummary" | "setUsageImportStatus"
>;

type ParsedSessionSummary = {
  sessionId: string;
  agent: string;
  title: string;
  timestamp: number;
};

type RunUsageBackfillOptions = {
  historyStore: HistoryStoreForBackfill;
  claudeProjectsPath: string;
  codexSessionsPath: string;
  now?: () => number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function timestampValue(value: unknown, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstTextLine(value: string | undefined): string | undefined {
  const line = value
    ?.split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line || line.startsWith("<command-name>")) {
    return undefined;
  }
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function textFromContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const pieces = value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      const record = asRecord(item);
      return typeof record?.text === "string" ? record.text : "";
    })
    .filter(Boolean);
  return pieces.join("\n");
}

function keepFirstSummary(
  summaries: Map<string, ParsedSessionSummary>,
  summary: ParsedSessionSummary | null,
) {
  if (!summary) {
    return;
  }
  const existing = summaries.get(summary.sessionId);
  if (!existing || summary.timestamp < existing.timestamp) {
    summaries.set(summary.sessionId, summary);
  }
}

function listJsonlFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pathname = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(pathname);
      } else if (entry.isFile() && pathname.endsWith(".jsonl")) {
        files.push(pathname);
      }
    }
  }
  return files.sort();
}

function sessionIdFromCodexPath(filePath: string): string {
  const basename = path.basename(filePath, ".jsonl");
  const match = basename.match(/([0-9a-f]{8,}(?:-[0-9a-f]{4,}){3,})$/i);
  return match?.[1] ?? basename;
}

function linesFromFile(filePath: string): string[] {
  try {
    return fs.readFileSync(filePath, "utf8").split("\n");
  } catch {
    return [];
  }
}

function claudeUsageFromLine(
  line: string,
  filePath: string,
  lineIndex: number,
  fallbackNow: number,
): TokenUsageWrite | null {
  const entry = parseJsonLine(line);
  if (!entry || entry.type !== "assistant") {
    return null;
  }
  const message = asRecord(entry.message);
  const usage = asRecord(message?.usage);
  if (!usage) {
    return null;
  }
  const sessionId =
    (typeof entry.sessionId === "string" && entry.sessionId.trim()) ||
    path.basename(filePath, ".jsonl");
  if (!sessionId) {
    return null;
  }
  const messageId =
    (typeof message?.id === "string" && message.id.trim()) ||
    (typeof entry.uuid === "string" && entry.uuid.trim());
  const timestamp = timestampValue(entry.timestamp, fallbackNow);

  return {
    sessionId,
    agent: "claude",
    model: typeof message?.model === "string" ? message.model : undefined,
    timestamp,
    inputTokens: numberValue(usage.input_tokens),
    outputTokens: numberValue(usage.output_tokens),
    cacheReadTokens: numberValue(usage.cache_read_input_tokens),
    cacheCreationTokens: numberValue(usage.cache_creation_input_tokens),
    sourceKind: "claude-jsonl",
    sourceKey: messageId
      ? `claude:${messageId}`
      : `claude:${path.resolve(filePath)}:${lineIndex}`,
  };
}

function claudeSummaryFromLine(
  line: string,
  filePath: string,
  fallbackNow: number,
): ParsedSessionSummary | null {
  const entry = parseJsonLine(line);
  if (!entry || entry.type !== "user") {
    return null;
  }
  const sessionId =
    (typeof entry.sessionId === "string" && entry.sessionId.trim()) ||
    path.basename(filePath, ".jsonl");
  if (!sessionId) {
    return null;
  }
  const message = asRecord(entry.message);
  const title = firstTextLine(textFromContent(message?.content));
  if (!title) {
    return null;
  }
  return {
    sessionId,
    agent: "claude",
    title,
    timestamp: timestampValue(entry.timestamp, fallbackNow),
  };
}

function codexUsageFromLine(
  line: string,
  filePath: string,
  model: string | undefined,
  fallbackNow: number,
): TokenUsageWrite | null {
  const entry = parseJsonLine(line);
  if (!entry || entry.type !== "event_msg") {
    return null;
  }
  const payload = asRecord(entry.payload) ?? asRecord(entry.msg);
  if (!payload || payload.type !== "token_count") {
    return null;
  }
  const info = asRecord(payload.info) ?? {};
  const totalUsage = asRecord(info.total_token_usage) ?? {};
  const lastUsage = asRecord(info.last_token_usage) ?? {};
  const usage = Object.keys(lastUsage).length > 0 ? lastUsage : totalUsage;
  if (Object.keys(usage).length === 0) {
    return null;
  }
  const sessionId = sessionIdFromCodexPath(filePath);
  const timestamp = timestampValue(entry.timestamp, fallbackNow);
  const inputTokens = numberValue(usage.input_tokens);
  const outputTokens = numberValue(usage.output_tokens);
  const cacheReadTokens = numberValue(usage.cached_input_tokens);
  const reasoningTokens = numberValue(usage.reasoning_output_tokens);

  return {
    sessionId,
    agent: "codex",
    model,
    timestamp,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    reasoningTokens,
    sourceKind: "codex-jsonl",
    sourceKey: `codex:${sessionId}:${timestamp}:${inputTokens ?? 0}:${outputTokens ?? 0}:${cacheReadTokens ?? 0}:${reasoningTokens ?? 0}`,
  };
}

function codexSummaryFromLine(
  line: string,
  filePath: string,
  fallbackNow: number,
): ParsedSessionSummary | null {
  const entry = parseJsonLine(line);
  if (!entry || entry.type !== "event_msg") {
    return null;
  }
  const payload = asRecord(entry.payload) ?? asRecord(entry.msg);
  if (!payload || payload.type !== "user_message") {
    return null;
  }
  const title = firstTextLine(typeof payload.message === "string" ? payload.message : undefined);
  if (!title) {
    return null;
  }
  return {
    sessionId: sessionIdFromCodexPath(filePath),
    agent: "codex",
    title,
    timestamp: timestampValue(entry.timestamp, fallbackNow),
  };
}

function importClaudeUsage(
  historyStore: Pick<HistoryStoreForBackfill, "writeTokenUsage" | "writeUsageSessionSummary">,
  root: string,
  fallbackNow: number,
): number {
  let rows = 0;
  const summaries = new Map<string, ParsedSessionSummary>();
  for (const filePath of listJsonlFiles(root)) {
    linesFromFile(filePath).forEach((line, index) => {
      const trimmed = line.trim();
      keepFirstSummary(summaries, claudeSummaryFromLine(trimmed, filePath, fallbackNow));
      const entry = claudeUsageFromLine(trimmed, filePath, index, fallbackNow);
      if (!entry) {
        return;
      }
      historyStore.writeTokenUsage(entry);
      rows += 1;
    });
  }
  for (const summary of summaries.values()) {
    historyStore.writeUsageSessionSummary(summary);
  }
  return rows;
}

function importCodexUsage(
  historyStore: Pick<HistoryStoreForBackfill, "writeTokenUsage" | "writeUsageSessionSummary">,
  root: string,
  fallbackNow: number,
): number {
  let rows = 0;
  const summaries = new Map<string, ParsedSessionSummary>();
  for (const filePath of listJsonlFiles(root)) {
    let model: string | undefined;
    linesFromFile(filePath).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      const parsed = parseJsonLine(trimmed);
      if (parsed?.type === "turn_context") {
        const payload = asRecord(parsed.payload);
        if (typeof payload?.model === "string" && payload.model.trim()) {
          model = payload.model.trim();
        }
      }
      keepFirstSummary(summaries, codexSummaryFromLine(trimmed, filePath, fallbackNow));
      const entry = codexUsageFromLine(trimmed, filePath, model, fallbackNow);
      if (!entry) {
        return;
      }
      historyStore.writeTokenUsage(entry);
      rows += 1;
    });
  }
  for (const summary of summaries.values()) {
    historyStore.writeUsageSessionSummary(summary);
  }
  return rows;
}

export function runUsageBackfill(options: RunUsageBackfillOptions): UsageImportStatus {
  const completedAt = options.now?.() ?? Date.now();
  try {
    const claudeRowsImported = importClaudeUsage(
      options.historyStore,
      options.claudeProjectsPath,
      completedAt,
    );
    const codexRowsImported = importCodexUsage(
      options.historyStore,
      options.codexSessionsPath,
      completedAt,
    );
    const status: UsageImportStatus = {
      completedAt,
      claudeRowsImported,
      codexRowsImported,
      lastError: null,
    };
    options.historyStore.setUsageImportStatus(status);
    return status;
  } catch (error) {
    const status: UsageImportStatus = {
      completedAt,
      claudeRowsImported: 0,
      codexRowsImported: 0,
      lastError: error instanceof Error ? error.message : String(error),
    };
    options.historyStore.setUsageImportStatus(status);
    return status;
  }
}
