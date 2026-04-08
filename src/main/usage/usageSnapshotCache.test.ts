import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUsageSnapshotCache } from "./usageSnapshotCache";

describe("createUsageSnapshotCache", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("persists and restores the last claude rate-limit snapshot", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-usage-cache-"));
    const filePath = path.join(tmpDir, "usage-cache.json");
    const cache = createUsageSnapshotCache({
      filePath,
      now: () => 1_775_100_000_000,
    });

    cache.saveClaudeRateLimitSnapshot({
      agent: "claude",
      sessionId: "claude-session-1",
      source: "statusline-derived",
      updatedAt: 1_775_000_000_000,
      title: "Claude quota",
      rateLimit: {
        usedPercent: 22,
        resetAt: 1_775_200_000,
        windows: [
          { key: "primary", label: "5h", usedPercent: 22, resetAt: 1_775_200_000 },
          { key: "secondary", label: "7d", usedPercent: 61, resetAt: 1_775_600_000 },
        ],
      },
    });

    expect(cache.loadClaudeRateLimitSnapshot()).toEqual({
      agent: "claude",
      sessionId: "claude-session-1",
      source: "statusline-derived",
      updatedAt: 1_775_000_000_000,
      title: "Claude quota",
      rateLimit: {
        usedPercent: 22,
        resetAt: 1_775_200_000,
        windows: [
          { key: "primary", label: "5h", usedPercent: 22, resetAt: 1_775_200_000 },
          { key: "secondary", label: "7d", usedPercent: 61, resetAt: 1_775_600_000 },
        ],
      },
    });
  });

  it("ignores missing or invalid cache files", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-usage-cache-"));
    const filePath = path.join(tmpDir, "usage-cache.json");
    const cache = createUsageSnapshotCache({ filePath });

    expect(cache.loadClaudeRateLimitSnapshot()).toBeNull();

    fs.writeFileSync(filePath, "{not-json", "utf8");

    expect(cache.loadClaudeRateLimitSnapshot()).toBeNull();
  });

  it("does not persist non-claude snapshots", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-usage-cache-"));
    const filePath = path.join(tmpDir, "usage-cache.json");
    const cache = createUsageSnapshotCache({ filePath });

    cache.saveClaudeRateLimitSnapshot({
      agent: "cursor",
      sessionId: "cursor-1",
      source: "provider-derived",
      updatedAt: 1,
      rateLimit: { usedPercent: 12 },
    });

    expect(cache.loadClaudeRateLimitSnapshot()).toBeNull();
  });

  it("drops cached claude quota when all rate-limit windows are expired", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-usage-cache-"));
    const filePath = path.join(tmpDir, "usage-cache.json");
    const cache = createUsageSnapshotCache({
      filePath,
      now: () => 1_775_700_000_000,
    });

    cache.saveClaudeRateLimitSnapshot({
      agent: "claude",
      sessionId: "claude-session-1",
      source: "statusline-derived",
      updatedAt: 1_775_000_000_000,
      rateLimit: {
        usedPercent: 22,
        resetAt: 1_775_200_000,
        windows: [
          { key: "primary", label: "5h", usedPercent: 22, resetAt: 1_775_200_000 },
          { key: "secondary", label: "7d", usedPercent: 61, resetAt: 1_775_600_000 },
        ],
      },
    });

    expect(cache.loadClaudeRateLimitSnapshot()).toBeNull();
  });

  it("keeps cached claude quota while at least one window is still active", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-usage-cache-"));
    const filePath = path.join(tmpDir, "usage-cache.json");
    const cache = createUsageSnapshotCache({
      filePath,
      now: () => 1_775_300_000_000,
    });

    cache.saveClaudeRateLimitSnapshot({
      agent: "claude",
      sessionId: "claude-session-1",
      source: "statusline-derived",
      updatedAt: 1_775_000_000_000,
      rateLimit: {
        usedPercent: 22,
        resetAt: 1_775_200_000,
        windows: [
          { key: "primary", label: "5h", usedPercent: 22, resetAt: 1_775_200_000 },
          { key: "secondary", label: "7d", usedPercent: 61, resetAt: 1_775_600_000 },
        ],
      },
    });

    expect(cache.loadClaudeRateLimitSnapshot()).toMatchObject({
      agent: "claude",
      sessionId: "claude-session-1",
    });
  });
});
