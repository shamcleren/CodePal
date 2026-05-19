import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ActivityItem } from "../../shared/sessionTypes";
import { createHistoryStore } from "./historyStore";

function makeActivityItem(
  overrides: Partial<ActivityItem> & Pick<ActivityItem, "id" | "timestamp" | "body">,
): ActivityItem {
  return {
    kind: "message",
    source: "assistant",
    title: "Assistant",
    ...overrides,
  };
}

describe("createHistoryStore", () => {
  let tmpDir: string | null = null;
  let store: ReturnType<typeof createHistoryStore> | null = null;

  afterEach(() => {
    store?.close();
    store = null;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("initializes schema and reports empty diagnostics", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");

    store = createHistoryStore({ dbPath, now: () => 1_000 });

    const diagnostics = store.getDiagnostics();

    expect(fs.existsSync(dbPath)).toBe(true);
    expect(diagnostics).toMatchObject({
      enabled: true,
      dbPath,
      estimatedSessionCount: 0,
      estimatedActivityCount: 0,
      lastCleanupAt: null,
    });
    expect(diagnostics.dbSizeBytes).toBeGreaterThan(0);
  });

  it("migrates legacy token usage columns before creating the source key index", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        tool TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT,
        latest_task TEXT,
        updated_at INTEGER NOT NULL,
        last_user_message_at INTEGER,
        has_pending_actions INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        model TEXT,
        timestamp INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);
    legacyDb.close();

    store = createHistoryStore({ dbPath });
    store.writeTokenUsage({
      sessionId: "legacy-session",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: 1_000,
      inputTokens: 11,
      outputTokens: 5,
      sourceKind: "codex-history",
      sourceKey: "legacy-row-1",
    });
    store.writeTokenUsage({
      sessionId: "legacy-session",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: 1_100,
      inputTokens: 13,
      outputTokens: 7,
      sourceKind: "codex-history",
      sourceKey: "legacy-row-1",
    });

    expect(store.getTokenUsageByAgent(0, 2_000, "codex")).toMatchObject([
      {
        agent: "codex",
        inputTokens: 13,
        outputTokens: 7,
        totalTokens: 20,
        requestCount: 1,
      },
    ]);
  });

  it("persists activity history and reads newest-first pages with idempotent item inserts", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeSessionEvent({
      session: {
        id: "s1",
        tool: "codex",
        status: "running",
        title: "Session one",
        latestTask: "answer the user",
        updatedAt: 100,
        lastUserMessageAt: 95,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({
          id: "a1",
          timestamp: 100,
          source: "user",
          title: "User",
          body: "hello",
        }),
        makeActivityItem({
          id: "a2",
          timestamp: 110,
          body: "world",
        }),
      ],
      debugEvent: {
        timestamp: 110,
        tool: "codex",
        status: "running",
        eventType: "agent_message",
        rawSubset: { sessionId: "s1", marker: "latest" },
      },
    });

    store.writeSessionEvent({
      session: {
        id: "s1",
        tool: "codex",
        status: "completed",
        updatedAt: 120,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({
          id: "a2",
          timestamp: 110,
          body: "world duplicate",
        }),
        makeActivityItem({
          id: "a3",
          timestamp: 120,
          body: "done",
        }),
      ],
    });

    const firstPage = store.getSessionHistoryPage({ sessionId: "s1", limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["a3", "a2"]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = store.getSessionHistoryPage({
      sessionId: "s1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.items.map((item) => item.id)).toEqual(["a1"]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();

    const diagnostics = store.getDiagnostics();
    expect(diagnostics.estimatedSessionCount).toBe(1);
    expect(diagnostics.estimatedActivityCount).toBe(3);
  });

  it("preserves reused activity item ids across different sessions", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeSessionEvent({
      session: {
        id: "s1",
        tool: "codex",
        status: "running",
        updatedAt: 100,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({
          id: "shared-item",
          timestamp: 100,
          body: "session one",
        }),
      ],
    });

    store.writeSessionEvent({
      session: {
        id: "s2",
        tool: "cursor",
        status: "running",
        updatedAt: 200,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({
          id: "shared-item",
          timestamp: 200,
          body: "session two",
        }),
      ],
    });

    expect(store.getSessionHistoryPage({ sessionId: "s1", limit: 10 }).items).toMatchObject([
      { id: "shared-item", body: "session one" },
    ]);
    expect(store.getSessionHistoryPage({ sessionId: "s2", limit: 10 }).items).toMatchObject([
      { id: "shared-item", body: "session two" },
    ]);
    expect(store.getDiagnostics().estimatedActivityCount).toBe(2);
  });

  it("uses total SQLite sidefile size in diagnostics", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeSessionEvent({
      session: {
        id: "s1",
        tool: "cursor",
        status: "running",
        updatedAt: 100,
        hasPendingActions: true,
      },
      activityItems: [makeActivityItem({ id: "a1", timestamp: 100, body: "hello" })],
    });

    const expectedSize = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].reduce((total, filePath) => {
      try {
        return total + fs.statSync(filePath).size;
      } catch {
        return total;
      }
    }, 0);

    expect(store.getDiagnostics().dbSizeBytes).toBe(expectedSize);
  });

  it("uses insertion order rather than text id order for same-timestamp paging", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeSessionEvent({
      session: {
        id: "s1",
        tool: "codex",
        status: "running",
        updatedAt: 100,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({ id: "z-first", timestamp: 100, body: "first inserted" }),
        makeActivityItem({ id: "a-second", timestamp: 100, body: "second inserted" }),
        makeActivityItem({ id: "m-third", timestamp: 100, body: "third inserted" }),
      ],
    });

    const firstPage = store.getSessionHistoryPage({ sessionId: "s1", limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["m-third", "a-second"]);

    const secondPage = store.getSessionHistoryPage({
      sessionId: "s1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.items.map((item) => item.id)).toEqual(["z-first"]);
  });

  it("keeps same-timestamp paging stable after cleanup vacuum", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    const now = () => 5 * 24 * 60 * 60 * 1000;
    store = createHistoryStore({ dbPath, now });

    store.writeSessionEvent({
      session: {
        id: "old",
        tool: "codex",
        status: "completed",
        updatedAt: now() - 5 * 24 * 60 * 60 * 1000,
        hasPendingActions: false,
      },
      activityItems: [makeActivityItem({ id: "old-1", timestamp: now() - 5 * 24 * 60 * 60 * 1000, body: "old" })],
    });

    store.writeSessionEvent({
      session: {
        id: "s1",
        tool: "codex",
        status: "running",
        updatedAt: now() - 1_000,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({ id: "z-first", timestamp: now() - 1_000, body: "first inserted" }),
        makeActivityItem({ id: "a-second", timestamp: now() - 1_000, body: "second inserted" }),
        makeActivityItem({ id: "m-third", timestamp: now() - 1_000, body: "third inserted" }),
      ],
    });

    const firstPage = store.getSessionHistoryPage({ sessionId: "s1", limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["m-third", "a-second"]);

    store.runCleanup({ detailRetention: "2d", analyticsRetention: "forever" });

    const secondPage = store.getSessionHistoryPage({
      sessionId: "s1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.items.map((item) => item.id)).toEqual(["z-first"]);
  });

  it("clears all persisted history", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeSessionEvent({
      session: {
        id: "s1",
        tool: "cursor",
        status: "running",
        updatedAt: 100,
        hasPendingActions: true,
      },
      activityItems: [makeActivityItem({ id: "a1", timestamp: 100, body: "hello" })],
    });

    const cleared = store.clearAll();

    expect(cleared.estimatedSessionCount).toBe(0);
    expect(cleared.estimatedActivityCount).toBe(0);
    expect(store.getSessionHistoryPage({ sessionId: "s1", limit: 10 })).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("removes old history during cleanup and records the cleanup timestamp", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    const now = () => 10 * 24 * 60 * 60 * 1000;
    store = createHistoryStore({ dbPath, now });

    store.writeSessionEvent({
      session: {
        id: "old",
        tool: "codex",
        status: "completed",
        updatedAt: now() - 5 * 24 * 60 * 60 * 1000,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({
          id: "old-1",
          timestamp: now() - 5 * 24 * 60 * 60 * 1000,
          body: "old item",
        }),
      ],
    });

    store.writeSessionEvent({
      session: {
        id: "fresh",
        tool: "codex",
        status: "running",
        updatedAt: now() - 1_000,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({
          id: "fresh-1",
          timestamp: now() - 1_000,
          body: "fresh item",
        }),
      ],
    });

    const result = store.runCleanup({ detailRetention: "2d", analyticsRetention: "forever" });

    expect(result.lastCleanupAt).toBe(now());
    expect(result.estimatedSessionCount).toBe(1);
    expect(result.estimatedActivityCount).toBe(1);
    expect(store.getSessionHistoryPage({ sessionId: "old", limit: 10 }).items).toEqual([]);
    expect(store.getSessionHistoryPage({ sessionId: "fresh", limit: 10 }).items).toMatchObject([
      { id: "fresh-1" },
    ]);
  });

  it("deduplicates token usage by source key and keeps the latest parsed values", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeTokenUsage({
      sessionId: "historical-claude",
      agent: "claude",
      model: "claude-sonnet-4-5-20250929",
      timestamp: 100,
      inputTokens: 100,
      outputTokens: 50,
      sourceKind: "claude-jsonl",
      sourceKey: "claude:message:msg_1",
    });
    store.writeTokenUsage({
      sessionId: "historical-claude",
      agent: "claude",
      model: "claude-sonnet-4-5-20250929",
      timestamp: 100,
      inputTokens: 120,
      outputTokens: 60,
      sourceKind: "claude-jsonl",
      sourceKey: "claude:message:msg_1",
    });

    expect(store.getTokenUsageByModel(0, 1_000)).toEqual([
      expect.objectContaining({
        model: "claude-sonnet-4-5-20250929",
        agent: "claude",
        inputTokens: 120,
        outputTokens: 60,
        totalTokens: 180,
        requestCount: 1,
      }),
    ]);
  });

  it("keeps analytics history when detailed session history expires", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    const now = () => 10 * 24 * 60 * 60 * 1000;
    store = createHistoryStore({ dbPath, now });

    store.writeSessionEvent({
      session: {
        id: "old",
        tool: "codex",
        status: "completed",
        updatedAt: now() - 5 * 24 * 60 * 60 * 1000,
        hasPendingActions: false,
      },
      activityItems: [
        makeActivityItem({
          id: "old-1",
          timestamp: now() - 5 * 24 * 60 * 60 * 1000,
          body: "old item",
        }),
      ],
    });
    store.writeTokenUsage({
      sessionId: "old",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: now() - 5 * 24 * 60 * 60 * 1000,
      inputTokens: 200,
      outputTokens: 100,
      sourceKind: "codex-jsonl",
      sourceKey: "codex:old:1",
    });

    store.runCleanup({ detailRetention: "2d", analyticsRetention: "forever" });

    expect(store.getSessionHistoryPage({ sessionId: "old", limit: 10 }).items).toEqual([]);
    expect(store.getTokenUsageByModel(0, now() + 1)).toEqual([
      expect.objectContaining({
        model: "gpt-5.5",
        agent: "codex",
        totalTokens: 300,
        requestCount: 1,
      }),
    ]);

    store.runCleanup({ detailRetention: "2d", analyticsRetention: "2d" });

    expect(store.getTokenUsageByModel(0, now() + 1)).toEqual([]);
  });

  it("summarizes token usage by agent and by top sessions", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeTokenUsage({
      sessionId: "s1",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: 100,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 25,
      sourceKind: "codex-jsonl",
      sourceKey: "codex:s1:1",
    });
    store.writeTokenUsage({
      sessionId: "s2",
      agent: "claude",
      model: "claude-sonnet-4-5-20250929",
      timestamp: 200,
      inputTokens: 500,
      outputTokens: 200,
      sourceKind: "claude-jsonl",
      sourceKey: "claude:s2:1",
    });

    expect(store.getTokenUsageByAgent(0, 1_000)).toEqual([
      expect.objectContaining({ agent: "claude", totalTokens: 700, requestCount: 1 }),
      expect.objectContaining({ agent: "codex", totalTokens: 175, requestCount: 1 }),
    ]);
    expect(store.getTopTokenUsageSessions(0, 1_000, undefined, 5)).toEqual([
      expect.objectContaining({ sessionId: "s2", agent: "claude", totalTokens: 700 }),
      expect.objectContaining({ sessionId: "s1", agent: "codex", totalTokens: 175 }),
    ]);
  });

  describe("getRecentSessions", () => {
    it("returns sessions updated within maxAgeMs", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      const now = () => 100_000_000;
      store = createHistoryStore({ dbPath, now });

      store.writeSessionEvent({
        session: {
          id: "s1",
          tool: "cursor",
          status: "completed",
          title: "Fix bug",
          latestTask: "debug task",
          updatedAt: now() - 3_600_000, // 1 hour ago
          lastUserMessageAt: now() - 3_700_000,
          hasPendingActions: false,
        },
        activityItems: [],
      });
      store.writeSessionEvent({
        session: {
          id: "s2",
          tool: "claude",
          status: "running",
          title: "Refactor",
          updatedAt: now() - 90_000_000, // 25 hours ago
          lastUserMessageAt: now() - 90_100_000,
          hasPendingActions: false,
        },
        activityItems: [],
      });

      const recent = store.getRecentSessions({
        maxAgeMs: 24 * 60 * 60 * 1000,
        limit: 100,
      });

      expect(recent).toHaveLength(1);
      expect(recent[0]).toMatchObject({
        id: "s1",
        tool: "cursor",
        status: "completed",
        title: "Fix bug",
        latestTask: "debug task",
        lastUserMessageAt: now() - 3_700_000,
      });
    });

    it("excludes lifecycle-only sessions without a user message", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      const now = () => 100_000_000;
      store = createHistoryStore({ dbPath, now });

      store.writeSessionEvent({
        session: {
          id: "lifecycle-only",
          tool: "claude",
          status: "completed",
          title: "session ended",
          latestTask: "session ended",
          updatedAt: now() - 1_000,
          hasPendingActions: false,
        },
        activityItems: [],
      });
      store.writeSessionEvent({
        session: {
          id: "real-session",
          tool: "claude",
          status: "completed",
          title: "Explain plan",
          latestTask: "Explain plan",
          updatedAt: now() - 2_000,
          lastUserMessageAt: now() - 3_000,
          hasPendingActions: false,
        },
        activityItems: [],
      });

      const recent = store.getRecentSessions({ maxAgeMs: 86_400_000, limit: 100 });

      expect(recent.map((session) => session.id)).toEqual(["real-session"]);
    });

    it("respects limit and returns most recent first", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      const now = () => 100_000_000;
      store = createHistoryStore({ dbPath, now });

      for (let i = 0; i < 5; i++) {
        store.writeSessionEvent({
          session: {
            id: `s${i}`,
            tool: "cursor",
            status: "completed",
            updatedAt: now() - i * 1000,
            lastUserMessageAt: now() - i * 1000 - 500,
            hasPendingActions: false,
          },
          activityItems: [],
        });
      }

      const recent = store.getRecentSessions({ maxAgeMs: 86_400_000, limit: 3 });
      expect(recent).toHaveLength(3);
      expect(recent[0].id).toBe("s0");
    });

    it("returns empty array when no sessions exist", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      store = createHistoryStore({ dbPath });

      const recent = store.getRecentSessions({ maxAgeMs: 86_400_000, limit: 100 });
      expect(recent).toEqual([]);
    });
  });

  describe("getSessionStats", () => {
    it("returns session counts grouped by tool and status", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      store = createHistoryStore({ dbPath });

      store.writeSessionEvent({
        session: { id: "s1", tool: "claude", status: "completed", updatedAt: 100, hasPendingActions: false },
        activityItems: [],
      });
      store.writeSessionEvent({
        session: { id: "s2", tool: "claude", status: "completed", updatedAt: 200, hasPendingActions: false },
        activityItems: [],
      });
      store.writeSessionEvent({
        session: { id: "s3", tool: "claude", status: "running", updatedAt: 300, hasPendingActions: false },
        activityItems: [],
      });
      store.writeSessionEvent({
        session: { id: "s4", tool: "codex", status: "completed", updatedAt: 400, hasPendingActions: false },
        activityItems: [],
      });

      const stats = store.getSessionStats(0, 1000);

      expect(stats).toEqual(
        expect.arrayContaining([
          { agent: "claude", status: "completed", count: 2 },
          { agent: "claude", status: "running", count: 1 },
          { agent: "codex", status: "completed", count: 1 },
        ]),
      );
      expect(stats).toHaveLength(3);
    });

    it("filters by time range", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      store = createHistoryStore({ dbPath });

      store.writeSessionEvent({
        session: { id: "old", tool: "claude", status: "completed", updatedAt: 50, hasPendingActions: false },
        activityItems: [],
      });
      store.writeSessionEvent({
        session: { id: "new", tool: "claude", status: "running", updatedAt: 300, hasPendingActions: false },
        activityItems: [],
      });

      const stats = store.getSessionStats(100, 1000);

      expect(stats).toEqual([{ agent: "claude", status: "running", count: 1 }]);
    });

    it("returns empty array when no sessions exist", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      store = createHistoryStore({ dbPath });

      expect(store.getSessionStats(0, 1000)).toEqual([]);
    });
  });

  it("exposes close so callers can tear down and reopen cleanly", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeSessionEvent({
      session: {
        id: "s1",
        tool: "codex",
        status: "completed",
        updatedAt: 100,
        hasPendingActions: false,
      },
      activityItems: [makeActivityItem({ id: "a1", timestamp: 100, body: "hello" })],
    });

    store.close();
    store = createHistoryStore({ dbPath });

    expect(store.getSessionHistoryPage({ sessionId: "s1", limit: 10 }).items).toMatchObject([
      { id: "a1", body: "hello" },
    ]);
  });
});
