import fs from "node:fs";
import path from "node:path";
import type { UsageSnapshot } from "../../shared/usageTypes";

type UsageSnapshotCacheOptions = {
  filePath: string;
  now?: () => number;
};

type UsageSnapshotCacheFile = {
  claudeRateLimitSnapshot?: UsageSnapshot;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUsageSnapshot(value: unknown): value is UsageSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.agent === "string" &&
    typeof value.source === "string" &&
    typeof value.updatedAt === "number" &&
    (value.sessionId === undefined || typeof value.sessionId === "string")
  );
}

function isExpiredRateLimitSnapshot(snapshot: UsageSnapshot, nowMs: number): boolean {
  const rateLimit = snapshot.rateLimit;
  if (!rateLimit) {
    return true;
  }

  const windowResetAts =
    rateLimit.windows
      ?.map((window) => window.resetAt)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? [];

  if (windowResetAts.length > 0) {
    return windowResetAts.every((resetAt) => resetAt * 1000 <= nowMs);
  }

  if (typeof rateLimit.resetAt === "number" && Number.isFinite(rateLimit.resetAt)) {
    return rateLimit.resetAt * 1000 <= nowMs;
  }

  return false;
}

export function createUsageSnapshotCache(options: UsageSnapshotCacheOptions) {
  const now = options.now ?? (() => Date.now());

  function loadFile(): UsageSnapshotCacheFile {
    try {
      const raw = fs.readFileSync(options.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return isRecord(parsed) ? (parsed as UsageSnapshotCacheFile) : {};
    } catch {
      return {};
    }
  }

  function saveFile(next: UsageSnapshotCacheFile) {
    fs.mkdirSync(path.dirname(options.filePath), { recursive: true });
    fs.writeFileSync(options.filePath, JSON.stringify(next, null, 2), "utf8");
  }

  function loadClaudeRateLimitSnapshot(): UsageSnapshot | null {
    const snapshot = loadFile().claudeRateLimitSnapshot;
    if (!isUsageSnapshot(snapshot)) {
      return null;
    }
    if (snapshot.agent !== "claude" || !snapshot.rateLimit) {
      return null;
    }
    if (isExpiredRateLimitSnapshot(snapshot, now())) {
      return null;
    }
    return snapshot;
  }

  function saveClaudeRateLimitSnapshot(snapshot: UsageSnapshot) {
    if (snapshot.agent !== "claude" || !snapshot.rateLimit) {
      return;
    }

    saveFile({
      ...loadFile(),
      claudeRateLimitSnapshot: snapshot,
    });
  }

  return {
    loadClaudeRateLimitSnapshot,
    saveClaudeRateLimitSnapshot,
  };
}
