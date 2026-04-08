import fs from "node:fs";
import path from "node:path";
import type { SessionEvent } from "../session/sessionStore";
import { ACTIVE_SESSION_STALENESS_MS } from "../session/sessionStore";
import { normalizeCodexLogEvent } from "../../adapters/codex/normalizeCodexLogEvent";
import { isSessionStatus } from "../../shared/sessionTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";
import { createAdaptivePollScheduler } from "../session/createAdaptivePollScheduler";

type CodexSessionWatcherOptions = {
  sessionsRoot: string;
  onEvent: (event: SessionEvent) => void;
  onUsageSnapshot?: (snapshot: UsageSnapshot) => void;
  pollIntervalMs?: number;
  initialBootstrapLookbackMs?: number;
};

type FileCursor = {
  offset: number;
  remainder: string;
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
    .slice(0, 5)
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pickRateLimit(snapshot: Record<string, unknown>): UsageSnapshot["rateLimit"] | undefined {
  const primary =
    snapshot.primary && typeof snapshot.primary === "object"
      ? (snapshot.primary as Record<string, unknown>)
      : undefined;
  const secondary =
    snapshot.secondary && typeof snapshot.secondary === "object"
      ? (snapshot.secondary as Record<string, unknown>)
      : undefined;
  if (!primary && !secondary) return undefined;
  const windows = [
    primary
      ? {
          key: "primary",
          label:
            typeof primary.window_minutes === "number" && primary.window_minutes === 300
              ? "5 小时"
              : `${String(primary.window_minutes ?? "")}m`,
          usedPercent: numberValue(primary.used_percent),
          resetAt: numberValue(primary.resets_at),
          windowLabel:
            typeof primary.window_minutes === "number" ? `${primary.window_minutes}m` : undefined,
          planType: typeof snapshot.plan_type === "string" ? snapshot.plan_type : undefined,
        }
      : null,
    secondary
      ? {
          key: "secondary",
          label:
            typeof secondary.window_minutes === "number" && secondary.window_minutes === 10080
              ? "7 天"
              : `${String(secondary.window_minutes ?? "")}m`,
          usedPercent: numberValue(secondary.used_percent),
          resetAt: numberValue(secondary.resets_at),
          windowLabel:
            typeof secondary.window_minutes === "number" ? `${secondary.window_minutes}m` : undefined,
          planType: typeof snapshot.plan_type === "string" ? snapshot.plan_type : undefined,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  return {
    usedPercent: primary ? numberValue(primary.used_percent) : undefined,
    resetAt: primary ? numberValue(primary.resets_at) : undefined,
    windowLabel:
      primary && typeof primary.window_minutes === "number" ? `${primary.window_minutes}m` : undefined,
    planType: typeof snapshot.plan_type === "string" ? snapshot.plan_type : undefined,
    windows,
  };
}

function usageSnapshotFromLine(line: string, sourcePath: string): UsageSnapshot | null {
  const entry = parseLine(line);
  if (!entry || entry.type !== "event_msg") {
    return null;
  }
  const payload =
    entry.payload && typeof entry.payload === "object"
      ? (entry.payload as Record<string, unknown>)
      : null;
  if (!payload || payload.type !== "token_count") {
    return null;
  }
  const sessionId = sessionIdFromPath(sourcePath);
  if (!sessionId) {
    return null;
  }
  const info = payload.info && typeof payload.info === "object" ? (payload.info as Record<string, unknown>) : {};
  const totalUsage =
    info.total_token_usage && typeof info.total_token_usage === "object"
      ? (info.total_token_usage as Record<string, unknown>)
      : {};
  const lastUsage =
    info.last_token_usage && typeof info.last_token_usage === "object"
      ? (info.last_token_usage as Record<string, unknown>)
      : {};
  const preferredUsage = Object.keys(lastUsage).length > 0 ? lastUsage : totalUsage;
  const modelContextWindow = numberValue(info.model_context_window);
  const totalTokens = numberValue(preferredUsage.total_tokens);
  const rateLimits =
    payload.rate_limits && typeof payload.rate_limits === "object"
      ? (payload.rate_limits as Record<string, unknown>)
      : {};
  return {
    agent: "codex",
    sessionId,
    source: "session-derived",
    updatedAt: typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Date.now(),
    tokens: {
      input: numberValue(preferredUsage.input_tokens),
      output: numberValue(preferredUsage.output_tokens),
      total: totalTokens,
      cachedInput: numberValue(preferredUsage.cached_input_tokens),
      reasoningOutput: numberValue(preferredUsage.reasoning_output_tokens),
    },
    context:
      totalTokens !== undefined && modelContextWindow !== undefined
        ? {
            used: totalTokens,
            max: modelContextWindow,
            percent: (totalTokens / modelContextWindow) * 100,
          }
        : modelContextWindow !== undefined
          ? { max: modelContextWindow }
          : undefined,
    rateLimit: pickRateLimit(rateLimits),
    meta:
      Object.keys(totalUsage).length > 0
        ? {
            totalTokenUsage: totalUsage,
          }
        : undefined,
  };
}

function sessionIdFromPath(sourcePath: string): string | null {
  const basename = path.basename(sourcePath);
  const match = basename.match(/([0-9a-f]{8,}(?:-[0-9a-f]{4,}){3,})\.jsonl$/i);
  return match?.[1] ?? null;
}

export function createCodexSessionWatcher(options: CodexSessionWatcherOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const initialBootstrapLookbackMs =
    options.initialBootstrapLookbackMs ?? ACTIVE_SESSION_STALENESS_MS;
  const cursors = new Map<string, FileCursor>();
  const debug = process.env.CODEPAL_DEBUG_CODEX === "1";
  const scheduler = createAdaptivePollScheduler({
    poll: () => api.pollOnce(),
    fastIntervalMs: pollIntervalMs,
    maxIntervalMs: pollIntervalMs * 4,
    onError: (error) => {
      console.error("[CodePal Codex] poll failed:", (error as Error).message);
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
      const usageSnapshot = usageSnapshotFromLine(trimmed, filePath);
      if (usageSnapshot) {
        options.onUsageSnapshot?.(usageSnapshot);
      }
      const normalized = normalizeCodexLogEvent(trimmed, filePath);
      if (!normalized || !isSessionStatus(normalized.status)) continue;
      if (debug) {
        console.log(
          "[CodePal Codex] event",
          normalized.sessionId,
          normalized.status,
          normalized.task ?? "",
        );
      }
      options.onEvent({
        type: normalized.type,
        sessionId: normalized.sessionId,
        tool: normalized.tool,
        status: normalized.status,
        task: normalized.task,
        timestamp: normalized.timestamp,
        ...(normalized.meta !== undefined ? { meta: normalized.meta } : {}),
        ...(normalized.activityItems !== undefined ? { activityItems: normalized.activityItems } : {}),
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
      const files = listJsonlFiles(options.sessionsRoot);
      if (debug) {
        console.log("[CodePal Codex] polling root", options.sessionsRoot, "files", files);
      }
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
