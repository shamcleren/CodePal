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

  it("estimates historical token cost from model_pricing_history effective dates", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath, now: () => 1_000 });

    store.replaceModelPricingHistory([
      {
        modelId: "claude-opus-4-8",
        displayName: "Claude Opus 4.8",
        effectiveFrom: Date.parse("2026-05-28T00:00:00.000Z"),
        inputPerMillion: "5",
        outputPerMillion: "25",
        cacheReadPerMillion: "0.50",
        cacheCreationPerMillion: "6.25",
        changeKind: "new_model",
      },
      {
        modelId: "claude-sonnet-4-6",
        displayName: "Claude Sonnet 4.6",
        effectiveFrom: 0,
        inputPerMillion: "3",
        outputPerMillion: "15",
        cacheReadPerMillion: "0.30",
        cacheCreationPerMillion: "3.75",
        changeKind: "initial",
      },
    ]);

    store.writeTokenUsage({
      sessionId: "session-before",
      agent: "claude",
      model: "claude-opus-4-8",
      timestamp: Date.parse("2026-05-01T00:00:00.000Z"),
      inputTokens: 1_000_000,
      outputTokens: 0,
      sourceKind: "test",
      sourceKey: "before-opus-48",
    });
    store.writeTokenUsage({
      sessionId: "session-after",
      agent: "claude",
      model: "claude-opus-4-8",
      timestamp: Date.parse("2026-06-01T00:00:00.000Z"),
      inputTokens: 1_000_000,
      outputTokens: 0,
      sourceKind: "test",
      sourceKey: "after-opus-48",
    });
    store.writeTokenUsage({
      sessionId: "session-sonnet",
      agent: "claude",
      model: "claude-sonnet-4-6",
      timestamp: Date.parse("2026-04-01T00:00:00.000Z"),
      inputTokens: 1_000_000,
      outputTokens: 0,
      sourceKind: "test",
      sourceKey: "sonnet",
    });

    const byModel = store.getTokenUsageByModel(0, Date.parse("2027-01-01T00:00:00.000Z"));
    const opus = byModel.find((row) => row.model === "claude-opus-4-8");
    const sonnet = byModel.find((row) => row.model === "claude-sonnet-4-6");
    expect(opus?.estimatedCost).toBe(5);
    expect(sonnet?.estimatedCost).toBe(3);

    const trend = store.getTokenUsageTrend(
      0,
      Date.parse("2027-01-01T00:00:00.000Z"),
      "day",
    );
    const totalTrendCost = trend.reduce((sum, point) => sum + (point.estimatedCost ?? 0), 0);
    expect(totalTrendCost).toBe(8);
  });

  it("omits non-current models from pricing change events", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath, now: () => 1_000 });

    store.replaceModelPricing([
      {
        modelId: "claude-fable-5",
        displayName: "Claude Fable 5",
        inputPerMillion: "10",
        outputPerMillion: "50",
        cacheReadPerMillion: "1",
        cacheCreationPerMillion: "12.50",
        isCurrent: true,
      },
      {
        modelId: "dirty-history-model",
        displayName: "Dirty History Model",
        inputPerMillion: "1",
        outputPerMillion: "2",
        cacheReadPerMillion: "0.10",
        cacheCreationPerMillion: "0",
        isCurrent: false,
      },
    ]);
    store.replaceModelPricingHistory([
      {
        modelId: "claude-fable-5",
        displayName: "Claude Fable 5",
        effectiveFrom: Date.parse("2026-06-10T00:00:00.000Z"),
        inputPerMillion: "10",
        outputPerMillion: "50",
        cacheReadPerMillion: "1",
        cacheCreationPerMillion: "12.50",
        changeKind: "new_model",
        isCurrent: true,
      },
      {
        modelId: "dirty-history-model",
        displayName: "Dirty History Model",
        effectiveFrom: Date.parse("2026-06-10T00:00:00.000Z"),
        inputPerMillion: "1",
        outputPerMillion: "2",
        cacheReadPerMillion: "0.10",
        cacheCreationPerMillion: "0",
        changeKind: "new_model",
        isCurrent: false,
      },
    ]);

    const events = store.getPricingChangeEvents(
      Date.parse("2026-06-01T00:00:00.000Z"),
      Date.parse("2026-06-30T00:00:00.000Z"),
    );

    expect(events.map((event) => event.modelId)).toEqual(["claude-fable-5"]);
  });

  it("seeds Claude Opus 4.8 pricing, including fast mode", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");

    store = createHistoryStore({ dbPath, now: () => 1_000 });

    expect(store.getModelPricing()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelId: "claude-opus-4-8",
          inputPerMillion: "5",
          outputPerMillion: "25",
          cacheReadPerMillion: "0.50",
          cacheCreationPerMillion: "6.25",
        }),
        expect.objectContaining({
          modelId: "claude-opus-4-8-fast",
          inputPerMillion: "10",
          outputPerMillion: "50",
          cacheReadPerMillion: "1",
          cacheCreationPerMillion: "12.5",
        }),
      ]),
    );
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

  it("keeps unkeyed token usage writes distinct", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeTokenUsage({
      sessionId: "codebuddy-session",
      agent: "codebuddy",
      model: "mimo-v2.5-pro",
      timestamp: 100,
      inputTokens: 100,
      outputTokens: 50,
    });
    store.writeTokenUsage({
      sessionId: "codebuddy-session",
      agent: "codebuddy",
      model: "mimo-v2.5-pro",
      timestamp: 200,
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(store.getTokenUsageByAgent(0, 1_000, "codebuddy")).toEqual([
      expect.objectContaining({
        agent: "codebuddy",
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        requestCount: 2,
      }),
    ]);
  });

  it("removes legacy token usage rows duplicated by backfilled source-key rows", () => {
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
        source_kind TEXT,
        source_key TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      INSERT INTO sessions (id, tool, status, updated_at)
      VALUES ('codex-session', 'codex', 'completed', 1000);

      INSERT INTO token_usage (
        session_id, agent, model, timestamp, input_tokens, output_tokens,
        cache_read_tokens, reasoning_tokens, source_kind, source_key
      )
      VALUES
        ('codex-session', 'codex', 'gpt-5.5', 1000, 300, 40, 120, 8, NULL, NULL),
        ('codex-session', 'codex', 'gpt-5.5', 1300, 300, 40, 120, 8, 'codex-jsonl', 'codex:codex-session:stable');
    `);
    legacyDb.close();

    store = createHistoryStore({ dbPath });

    expect(store.getTokenUsageByModel(0, 2_000)).toEqual([
      expect.objectContaining({
        agent: "codex",
        model: "gpt-5.5",
        inputTokens: 180,
        outputTokens: 40,
        cacheReadTokens: 120,
        totalTokens: 340,
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

  it("summarizes token usage by project with unknown projects last", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeTokenUsage({
      sessionId: "s-codepal",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: 100,
      inputTokens: 100,
      outputTokens: 50,
      projectPath: "/Users/demo/code/CodePal",
      projectName: "CodePal",
      sourceKind: "test",
      sourceKey: "project-1",
    });
    store.writeTokenUsage({
      sessionId: "s-codepal-2",
      agent: "claude",
      model: "sonnet",
      timestamp: 200,
      inputTokens: 200,
      outputTokens: 100,
      projectPath: "/Users/demo/code/CodePal",
      projectName: "CodePal",
      sourceKind: "test",
      sourceKey: "project-2",
    });
    store.writeTokenUsage({
      sessionId: "s-gateway",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: 300,
      inputTokens: 1_000,
      outputTokens: 100,
      projectPath: "/Users/demo/code/gateway",
      projectName: "gateway",
      sourceKind: "test",
      sourceKey: "project-3",
    });
    store.writeTokenUsage({
      sessionId: "s-unknown",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: 400,
      inputTokens: 5_000,
      outputTokens: 100,
      sourceKind: "test",
      sourceKey: "project-unknown",
    });

    expect(store.getTokenUsageByProject(0, 1_000)).toEqual([
      expect.objectContaining({
        projectPath: "/Users/demo/code/gateway",
        projectName: "gateway",
        totalTokens: 1_100,
        requestCount: 1,
      }),
      expect.objectContaining({
        projectPath: "/Users/demo/code/CodePal",
        projectName: "CodePal",
        totalTokens: 450,
        requestCount: 2,
      }),
      expect.objectContaining({
        projectPath: "unknown",
        projectName: "unknown",
        totalTokens: 5_100,
        requestCount: 1,
      }),
    ]);
  });

  it("reconciles token usage project fields from existing sessions", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    store.writeSessionEvent({
      session: {
        id: "s-project",
        tool: "codex",
        status: "completed",
        title: "Project session",
        updatedAt: 100,
        hasPendingActions: false,
        projectPath: "/Users/demo/code/CodePal",
        projectName: "CodePal",
      },
      activityItems: [],
    });
    store.writeTokenUsage({
      sessionId: "s-project",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: 200,
      inputTokens: 100,
      outputTokens: 50,
      sourceKind: "test",
      sourceKey: "session-project-fallback",
    });

    expect(store.getTokenUsageByProject(0, 1_000)).toEqual([
      expect.objectContaining({
        projectPath: "/Users/demo/code/CodePal",
        projectName: "CodePal",
        totalTokens: 150,
      }),
    ]);
  });

  it("repairs persisted session project fields from token usage attribution", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath, now: () => 1_000 });

    store.writeSessionEvent({
      session: {
        id: "s-project-from-token",
        tool: "codex",
        status: "completed",
        title: "Project recovered from token usage",
        updatedAt: 100,
        lastUserMessageAt: 90,
        hasPendingActions: false,
      },
      activityItems: [],
    });
    store.writeTokenUsage({
      sessionId: "s-project-from-token",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: 200,
      inputTokens: 100,
      outputTokens: 50,
      sourceKind: "test",
      sourceKey: "session-project-repair",
    });
    store.close();
    store = null;

    const db = new DatabaseSync(dbPath);
    db.exec(`
      UPDATE token_usage
      SET project_path = '/Users/demo/code/CodePal', project_name = 'CodePal'
      WHERE session_id = 's-project-from-token'
    `);
    db.close();

    store = createHistoryStore({ dbPath, now: () => 1_000 });
    expect(store.repairTokenUsageProjectAttribution()).toBe(1);
    expect(store.getRecentSessions({ maxAgeMs: 2_000, limit: 5 })).toEqual([
      expect.objectContaining({
        id: "s-project-from-token",
        projectPath: "/Users/demo/code/CodePal",
        projectName: "CodePal",
      }),
    ]);
  });

  it("returns bucketed token trends with agent and model filters", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    store = createHistoryStore({ dbPath });

    const base = Date.UTC(2026, 4, 22, 10, 0, 0);
    store.writeTokenUsage({
      sessionId: "codex-1",
      agent: "codex",
      model: "gpt-5.5",
      timestamp: base + 5 * 60_000,
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 20,
      projectPath: "/Users/demo/code/CodePal",
      projectName: "CodePal",
      sourceKind: "test",
      sourceKey: "trend-1",
    });
    store.writeTokenUsage({
      sessionId: "codex-2",
      agent: "codex",
      model: "gpt-5.4",
      timestamp: base + 35 * 60_000,
      inputTokens: 200,
      outputTokens: 20,
      projectPath: "/Users/demo/code/gateway",
      projectName: "gateway",
      sourceKind: "test",
      sourceKey: "trend-2",
    });
    store.writeTokenUsage({
      sessionId: "claude-1",
      agent: "claude",
      model: "sonnet",
      timestamp: base + 65 * 60_000,
      inputTokens: 300,
      outputTokens: 30,
      projectPath: "/Users/demo/code/CodePal",
      projectName: "CodePal",
      sourceKind: "test",
      sourceKey: "trend-3",
    });

    expect(store.getTokenUsageTrend(base, base + 2 * 60 * 60_000, "hour")).toEqual([
      expect.objectContaining({
        bucketStart: base,
        agent: "codex",
        model: "gpt-5.4",
        projectPath: "/Users/demo/code/gateway",
        projectName: "gateway",
        totalTokens: 220,
        requestCount: 1,
      }),
      expect.objectContaining({
        bucketStart: base,
        agent: "codex",
        model: "gpt-5.5",
        projectPath: "/Users/demo/code/CodePal",
        projectName: "CodePal",
        totalTokens: 130,
        requestCount: 1,
      }),
      expect.objectContaining({
        bucketStart: base + 60 * 60_000,
        agent: "claude",
        model: "sonnet",
        projectPath: "/Users/demo/code/CodePal",
        projectName: "CodePal",
        totalTokens: 330,
        requestCount: 1,
      }),
    ]);

    expect(store.getTokenUsageTrend(base, base + 2 * 60 * 60_000, "minute", {
      agent: "codex",
      model: "gpt-5.5",
    })).toEqual([
      expect.objectContaining({
        bucketStart: base + 5 * 60_000,
        agent: "codex",
        model: "gpt-5.5",
        inputTokens: 100,
        totalTokens: 130,
      }),
    ]);

    expect(store.getTokenUsageTrend(base, base + 2 * 60 * 60_000, "hour", {
      projectPath: "/Users/demo/code/CodePal",
    })).toEqual([
      expect.objectContaining({
        bucketStart: base,
        agent: "codex",
        model: "gpt-5.5",
        projectName: "CodePal",
      }),
      expect.objectContaining({
        bucketStart: base + 60 * 60_000,
        agent: "claude",
        model: "sonnet",
        projectName: "CodePal",
      }),
    ]);
  });

  describe("getRecentSessions", () => {
    it("preserves the first session tool like project attribution", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      store = createHistoryStore({ dbPath });
      const baseTime = Date.now();

      store.writeSessionEvent({
        session: {
          id: "stable-agent",
          tool: "cursor",
          status: "running",
          title: "Cursor task",
          latestTask: "Cursor task",
          updatedAt: baseTime + 100,
          lastUserMessageAt: baseTime + 90,
          hasPendingActions: false,
          projectPath: "/repo/cursor",
          projectName: "cursor",
        },
        activityItems: [
          makeActivityItem({
            id: "user-1",
            source: "user",
            title: "User",
            body: "Cursor first prompt",
            timestamp: baseTime + 90,
          }),
        ],
      });
      store.writeSessionEvent({
        session: {
          id: "stable-agent",
          tool: "claude",
          status: "idle",
          title: "idle",
          latestTask: "idle",
          updatedAt: baseTime + 200,
          lastUserMessageAt: baseTime + 90,
          hasPendingActions: false,
          projectPath: "/repo/claude",
          projectName: "claude",
        },
        activityItems: [],
      });

      const recent = store.getRecentSessions({ maxAgeMs: 86_400_000, limit: 100 });

      expect(recent[0]).toMatchObject({
        id: "stable-agent",
        tool: "cursor",
        projectPath: "/repo/cursor",
        projectName: "cursor",
      });
    });

    it("persists and restores the concrete session model", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      const now = () => 100_000_000;
      store = createHistoryStore({ dbPath, now });

      store.writeSessionEvent({
        session: {
          id: "model-session",
          tool: "codex",
          status: "completed",
          title: "Model-aware session",
          latestTask: "inspect model",
          model: "gpt-5.5",
          modelSource: "event-meta",
          updatedAt: now() - 1_000,
          lastUserMessageAt: now() - 2_000,
          hasPendingActions: false,
        },
        activityItems: [],
      });

      expect(store.getRecentSessions({ maxAgeMs: 86_400_000, limit: 100 })).toEqual([
        expect.objectContaining({
          id: "model-session",
          model: "gpt-5.5",
          modelSource: "event-meta",
        }),
      ]);
    });

    it("backfills legacy session models from token usage on startup", () => {
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

        INSERT INTO sessions (
          id, tool, status, title, latest_task, updated_at, last_user_message_at,
          has_pending_actions
        )
        VALUES (
          'legacy-model-session', 'codex', 'completed', 'Legacy model session',
          'inspect old model', 1000, 900, 0
        );

        INSERT INTO token_usage (
          session_id, agent, model, timestamp, input_tokens, output_tokens
        )
        VALUES
          ('legacy-model-session', 'codex', 'gpt-5.4', 1000, 200, 40),
          ('legacy-model-session', 'codex', 'gpt-5.5', 1100, 20, 5);
      `);
      legacyDb.close();

      store = createHistoryStore({ dbPath, now: () => 2_000 });

      expect(store.getRecentSessions({ maxAgeMs: 2_000, limit: 10 })).toEqual([
        expect.objectContaining({
          id: "legacy-model-session",
          model: "gpt-5.5",
          modelSource: "token-usage",
        }),
      ]);
    });

    it("repairs existing session models from the latest token usage on startup", () => {
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
          model TEXT,
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

        INSERT INTO sessions (
          id, tool, status, title, latest_task, model, updated_at, last_user_message_at,
          has_pending_actions
        )
        VALUES (
          'existing-model-session', 'codex', 'completed', 'Existing model session',
          'inspect changed model', 'gpt-5.4', 1200, 900, 0
        );

        INSERT INTO token_usage (
          session_id, agent, model, timestamp, input_tokens, output_tokens
        )
        VALUES
          ('existing-model-session', 'codex', 'gpt-5.4', 1000, 200, 40),
          ('existing-model-session', 'codex', 'gpt-5.5', 1100, 20, 5);
      `);
      legacyDb.close();

      store = createHistoryStore({ dbPath, now: () => 2_000 });

      expect(store.getRecentSessions({ maxAgeMs: 2_000, limit: 10 })).toEqual([
        expect.objectContaining({
          id: "existing-model-session",
          model: "gpt-5.5",
        }),
      ]);
    });

    it("fills a missing session model when token usage arrives later", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      const now = () => 100_000_000;
      store = createHistoryStore({ dbPath, now });

      store.writeSessionEvent({
        session: {
          id: "usage-later-session",
          tool: "claude",
          status: "completed",
          title: "Usage later session",
          updatedAt: now() - 1_000,
          lastUserMessageAt: now() - 2_000,
          hasPendingActions: false,
        },
        activityItems: [],
      });
      store.writeTokenUsage({
        sessionId: "usage-later-session",
        agent: "claude",
        model: "claude-sonnet-4-5-20250929",
        timestamp: now() - 500,
        inputTokens: 100,
        outputTokens: 20,
        sourceKind: "test",
        sourceKey: "usage-later-model",
      });
      store.writeTokenUsage({
        sessionId: "usage-later-session",
        agent: "claude",
        model: "claude-opus-4-7",
        timestamp: now() - 250,
        inputTokens: 10,
        outputTokens: 5,
        sourceKind: "test",
        sourceKey: "usage-later-model-2",
      });

      expect(store.getRecentSessions({ maxAgeMs: 86_400_000, limit: 100 })).toEqual([
        expect.objectContaining({
          id: "usage-later-session",
          model: "claude-opus-4-7",
          modelSource: "token-usage",
        }),
      ]);
    });

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

    it("derives accumulated running and latest running durations from persisted activity items", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      const now = () => 100_000_000;
      store = createHistoryStore({ dbPath, now });

      store.writeSessionEvent({
        session: {
          id: "timed",
          tool: "codex",
          status: "completed",
          title: "Timed session",
          latestTask: "Timed session",
          updatedAt: now() - 1_000,
          lastUserMessageAt: now() - 11_000,
          hasPendingActions: false,
        },
        activityItems: [
          makeActivityItem({
            id: "run-1",
            body: "Running",
            tone: "running",
            timestamp: now() - 11_000,
          }),
          makeActivityItem({
            id: "done-1",
            body: "Completed",
            tone: "completed",
            timestamp: now() - 9_500,
          }),
          makeActivityItem({
            id: "run-2",
            body: "Running",
            tone: "running",
            timestamp: now() - 5_000,
          }),
          makeActivityItem({
            id: "waiting-2",
            body: "Waiting",
            tone: "waiting",
            timestamp: now() - 3_000,
          }),
        ],
      });

      const recent = store.getRecentSessions({ maxAgeMs: 86_400_000, limit: 100 });

      expect(recent[0]).toMatchObject({
        id: "timed",
        startedAt: now() - 11_000,
        sessionDurationMs: 3_500,
        latestRunningDurationMs: 2_000,
      });
    });

    it("returns persisted user prompt summaries for review titles", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-"));
      const dbPath = path.join(tmpDir, "history.sqlite");
      const now = () => 100_000_000;
      store = createHistoryStore({ dbPath, now });

      store.writeSessionEvent({
        session: {
          id: "prompted",
          tool: "codex",
          status: "completed",
          title: "Old title",
          latestTask: "Old title",
          updatedAt: now() - 1_000,
          lastUserMessageAt: now() - 5_000,
          hasPendingActions: false,
        },
        activityItems: [
          makeActivityItem({
            id: "assistant-1",
            body: "Done",
            timestamp: now() - 4_000,
          }),
          makeActivityItem({
            id: "user-1",
            source: "user",
            title: "User",
            body: "按 user prompt 生成工作回顾标题",
            timestamp: now() - 5_000,
          }),
        ],
      });

      const recent = store.getRecentSessions({ maxAgeMs: 86_400_000, limit: 100 });

      expect(recent[0]?.userPrompts).toEqual([
        {
          id: "user-1",
          body: "按 user prompt 生成工作回顾标题",
          timestamp: now() - 5_000,
        },
      ]);
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
