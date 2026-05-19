import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { HistoryRetentionPreset } from "../../shared/appSettings";
import type { HistoryDiagnostics, SessionHistoryPage, SessionHistoryPageRequest } from "../../shared/historyTypes";
import type { ActivityItem } from "../../shared/sessionTypes";
import type {
  AgentTokenStats,
  DailyTokenStats,
  ModelPricing,
  ModelTokenStats,
  SessionTokenStats,
  TokenUsageWrite,
  UsageImportStatus,
} from "../../shared/usageTypes";

const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGE_LIMIT = 200;
const LAST_CLEANUP_AT_KEY = "lastCleanupAt";
const USAGE_IMPORT_COMPLETED_AT_KEY = "usageImport.completedAt";
const USAGE_IMPORT_CLAUDE_ROWS_KEY = "usageImport.claudeRowsImported";
const USAGE_IMPORT_CODEX_ROWS_KEY = "usageImport.codexRowsImported";
const USAGE_IMPORT_LAST_ERROR_KEY = "usageImport.lastError";
const SQLITE_SIDE_FILES = ["", "-wal", "-shm"] as const;

type CleanupRetention = HistoryRetentionPreset | `${number}d`;

type CleanupOptions = {
  detailRetention: CleanupRetention;
  analyticsRetention: CleanupRetention;
};

type HistoryCursor = {
  timestamp: number;
  insertSeq: number;
};

export type PersistedSessionWrite = {
  session: {
    id: string;
    tool: string;
    status: string;
    title?: string;
    latestTask?: string;
    updatedAt: number;
    lastUserMessageAt?: number;
    hasPendingActions: boolean;
  };
  activityItems: ActivityItem[];
  debugEvent?: {
    timestamp: number;
    tool: string;
    status: string;
    eventType?: string;
    rawSubset: Record<string, unknown>;
  };
};

export type SessionSeedRecord = {
  id: string;
  tool: string;
  status: string;
  title: string | null;
  latestTask: string | null;
  updatedAt: number;
  lastUserMessageAt: number | null;
};

export type GetRecentSessionsOptions = {
  maxAgeMs: number;
  limit: number;
};

export type UsageSessionSummaryWrite = {
  sessionId: string;
  agent: string;
  title: string;
  timestamp: number;
};

function parseJsonObject(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): HistoryCursor {
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
  if (typeof parsed.timestamp !== "number" || typeof parsed.insertSeq !== "number") {
    throw new Error("Invalid history cursor");
  }
  return { timestamp: parsed.timestamp, insertSeq: parsed.insertSeq };
}

function fileSizeOrZero(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function totalSqliteSize(filePath: string): number {
  return SQLITE_SIDE_FILES.reduce((total, suffix) => total + fileSizeOrZero(`${filePath}${suffix}`), 0);
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.trunc(limit ?? DEFAULT_PAGE_LIMIT)));
}

function retentionDays(value: CleanupRetention): number | null {
  if (value === "forever") {
    return null;
  }
  const days = Number.parseInt(value.replace("d", ""), 10);
  return Number.isFinite(days) ? Math.max(1, days) : 30;
}

function cutoffForRetention(nowMs: number, retention: CleanupRetention): number | null {
  const days = retentionDays(retention);
  return days === null ? null : nowMs - days * 24 * 60 * 60 * 1000;
}

function deleteOrphanSessions(db: DatabaseSync) {
  db.exec(`
    DELETE FROM sessions
    WHERE id NOT IN (SELECT DISTINCT session_id FROM session_activity_items)
      AND id NOT IN (SELECT DISTINCT session_id FROM session_event_debug)
      AND id NOT IN (SELECT DISTINCT session_id FROM token_usage)
  `);
}

export function createHistoryStore(options: { dbPath: string; now?: () => number }) {
  const now = options.now ?? Date.now;
  fs.mkdirSync(path.dirname(options.dbPath), { recursive: true });

  const db = new DatabaseSync(options.dbPath);
  let isClosed = false;
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT,
      latest_task TEXT,
      updated_at INTEGER NOT NULL,
      last_user_message_at INTEGER,
      has_pending_actions INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS session_activity_items (
      insert_seq INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tone TEXT,
      tool_name TEXT,
      tool_phase TEXT,
      meta_json TEXT,
      UNIQUE (session_id, item_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_event_debug (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      tool TEXT NOT NULL,
      status TEXT NOT NULL,
      event_type TEXT,
      raw_subset_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS history_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_activity_items_session_timestamp
      ON session_activity_items (session_id, timestamp DESC, insert_seq DESC);
    CREATE INDEX IF NOT EXISTS idx_session_activity_items_session_item
      ON session_activity_items (session_id, item_id);
    CREATE INDEX IF NOT EXISTS idx_session_event_debug_session_timestamp
      ON session_event_debug (session_id, timestamp DESC, id DESC);

    CREATE TABLE IF NOT EXISTS token_usage (
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

    CREATE INDEX IF NOT EXISTS idx_token_usage_ts
      ON token_usage (timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_token_usage_agent_ts
      ON token_usage (agent, timestamp DESC);

    CREATE TABLE IF NOT EXISTS model_pricing (
      model_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      input_per_million TEXT NOT NULL,
      output_per_million TEXT NOT NULL,
      cache_read_per_million TEXT NOT NULL DEFAULT '0',
      cache_creation_per_million TEXT NOT NULL DEFAULT '0'
    );
  `);

  for (const statement of [
    "ALTER TABLE token_usage ADD COLUMN source_kind TEXT",
    "ALTER TABLE token_usage ADD COLUMN source_key TEXT",
  ]) {
    try {
      db.exec(statement);
    } catch (error) {
      if (!String((error as Error).message).toLowerCase().includes("duplicate column")) {
        throw error;
      }
    }
  }
  // Keep column migrations before indexes that depend on the migrated columns.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_source_key
      ON token_usage (agent, source_key)
      WHERE source_key IS NOT NULL
  `);

  // Seed default model pricing (upsert so user edits survive)
  const seedPricing = db.prepare(`
    INSERT INTO model_pricing (model_id, display_name, input_per_million, output_per_million, cache_read_per_million, cache_creation_per_million)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id) DO NOTHING
  `);
  const DEFAULT_PRICING: Array<[string, string, string, string, string, string]> = [
    // Claude (Anthropic)
    ["claude-opus-4-7", "Claude Opus 4.7", "5", "25", "0.50", "6.25"],
    ["claude-opus-4-6-20260206", "Claude Opus 4.6", "5", "25", "0.50", "6.25"],
    ["claude-sonnet-4-6-20260217", "Claude Sonnet 4.6", "3", "15", "0.30", "3.75"],
    ["claude-opus-4-5-20251101", "Claude Opus 4.5", "5", "25", "0.50", "6.25"],
    ["claude-sonnet-4-5-20250929", "Claude Sonnet 4.5", "3", "15", "0.30", "3.75"],
    ["claude-haiku-4-5-20251001", "Claude Haiku 4.5", "1", "5", "0.10", "1.25"],
    ["claude-opus-4-20250514", "Claude Opus 4", "15", "75", "1.50", "18.75"],
    ["claude-sonnet-4-20250514", "Claude Sonnet 4", "3", "15", "0.30", "3.75"],
    ["claude-3-5-haiku-20241022", "Claude 3.5 Haiku", "0.80", "4", "0.08", "1"],
    ["claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet", "3", "15", "0.30", "3.75"],
    // Codex / OpenAI
    ["codex-default", "Codex (default)", "1.50", "6", "0.375", "0"],
    ["codex-mini-latest", "Codex Mini", "1.50", "6", "0.375", "0"],
    ["gpt-5.5", "GPT-5.5", "5", "30", "0.50", "0"],
    ["gpt-5", "GPT-5", "1.25", "10", "0.125", "0"],
    ["gpt-4.1", "GPT-4.1", "2", "8", "0.50", "0"],
    // DeepSeek
    ["deepseek-v4-flash", "DeepSeek V4 Flash", "0.14", "0.28", "0.0028", "0"],
    ["deepseek-v4-pro", "DeepSeek V4 Pro", "0.435", "0.87", "0.003625", "0"],
  ];
  for (const row of DEFAULT_PRICING) {
    seedPricing.run(...row);
  }

  // Backfill: codex rows that predate model tracking have NULL or "unknown" model
  db.exec(`UPDATE token_usage SET model = 'gpt-5.5' WHERE agent = 'codex' AND (model IS NULL OR model = '' OR model = 'unknown')`);

  function assertOpen() {
    if (isClosed) {
      throw new Error("History store is closed");
    }
  }

  function checkpointWal(mode: "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE" = "PASSIVE") {
    assertOpen();
    db.exec(`PRAGMA wal_checkpoint(${mode})`);
  }

  const upsertSessionStmt = db.prepare(`
    INSERT INTO sessions (
      id, tool, status, title, latest_task, updated_at, last_user_message_at, has_pending_actions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tool = CASE
        WHEN excluded.updated_at >= sessions.updated_at THEN excluded.tool
        ELSE sessions.tool
      END,
      status = CASE
        WHEN excluded.updated_at >= sessions.updated_at THEN excluded.status
        ELSE sessions.status
      END,
      title = CASE
        WHEN excluded.updated_at >= sessions.updated_at AND excluded.title IS NOT NULL THEN excluded.title
        ELSE sessions.title
      END,
      latest_task = CASE
        WHEN excluded.updated_at >= sessions.updated_at AND excluded.latest_task IS NOT NULL THEN excluded.latest_task
        ELSE sessions.latest_task
      END,
      updated_at = MAX(sessions.updated_at, excluded.updated_at),
      last_user_message_at = CASE
        WHEN sessions.last_user_message_at IS NULL THEN excluded.last_user_message_at
        WHEN excluded.last_user_message_at IS NULL THEN sessions.last_user_message_at
        ELSE MAX(sessions.last_user_message_at, excluded.last_user_message_at)
      END,
      has_pending_actions = CASE
        WHEN excluded.updated_at >= sessions.updated_at THEN excluded.has_pending_actions
        ELSE sessions.has_pending_actions
      END
  `);

  const insertActivityStmt = db.prepare(`
    INSERT INTO session_activity_items (
      item_id, session_id, timestamp, kind, source, title, body, tone, tool_name, tool_phase, meta_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, item_id) DO NOTHING
  `);

  const insertDebugStmt = db.prepare(`
    INSERT INTO session_event_debug (
      session_id, timestamp, tool, status, event_type, raw_subset_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const historyCountsStmt = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sessions) AS sessionCount,
      (SELECT COUNT(*) FROM session_activity_items) AS activityCount
  `);
  const lastCleanupStmt = db.prepare(`SELECT value FROM history_meta WHERE key = ?`);
  const upsertMetaStmt = db.prepare(`
    INSERT INTO history_meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const pageStmt = db.prepare(`
    SELECT
      insert_seq AS insertSeq,
      item_id AS id,
      timestamp,
      kind,
      source,
      title,
      body,
      tone,
      tool_name AS toolName,
      tool_phase AS toolPhase,
      meta_json
    FROM session_activity_items
    WHERE session_id = ?
      AND (
        ? IS NULL OR timestamp < ?
        OR (timestamp = ? AND insert_seq < ?)
      )
    ORDER BY timestamp DESC, insert_seq DESC
    LIMIT ?
  `);
  const recentSessionsStmt = db.prepare(`
    SELECT id, tool, status, title, latest_task, updated_at, last_user_message_at
    FROM sessions
    WHERE updated_at >= ?
      AND last_user_message_at IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT ?
  `);
  const deleteActivityBeforeStmt = db.prepare(`DELETE FROM session_activity_items WHERE timestamp < ?`);
  const deleteDebugBeforeStmt = db.prepare(`DELETE FROM session_event_debug WHERE timestamp < ?`);

  // Token usage statements
  const ensureTokenUsageSessionStmt = db.prepare(`
    INSERT INTO sessions (id, tool, status, title, latest_task, updated_at, last_user_message_at, has_pending_actions)
    VALUES (?, ?, 'unknown', NULL, NULL, ?, NULL, 0)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = MAX(sessions.updated_at, excluded.updated_at)
  `);
  const upsertUsageSessionSummaryStmt = db.prepare(`
    INSERT INTO sessions (id, tool, status, title, latest_task, updated_at, last_user_message_at, has_pending_actions)
    VALUES (?, ?, 'usage-only', ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET
      tool = CASE
        WHEN sessions.tool IS NULL OR sessions.tool = '' THEN excluded.tool
        ELSE sessions.tool
      END,
      status = CASE
        WHEN sessions.status = 'unknown' THEN excluded.status
        ELSE sessions.status
      END,
      title = CASE
        WHEN sessions.title IS NULL OR sessions.title = '' THEN excluded.title
        ELSE sessions.title
      END,
      latest_task = CASE
        WHEN sessions.latest_task IS NULL OR sessions.latest_task = '' THEN excluded.latest_task
        ELSE sessions.latest_task
      END,
      updated_at = MAX(sessions.updated_at, excluded.updated_at),
      last_user_message_at = CASE
        WHEN sessions.last_user_message_at IS NULL THEN excluded.last_user_message_at
        WHEN excluded.last_user_message_at IS NULL THEN sessions.last_user_message_at
        ELSE MAX(sessions.last_user_message_at, excluded.last_user_message_at)
      END
  `);
  const insertTokenUsageStmt = db.prepare(`
    INSERT INTO token_usage (
      session_id, agent, model, timestamp, input_tokens, output_tokens,
      cache_read_tokens, cache_creation_tokens, reasoning_tokens, source_kind, source_key
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const findTokenUsageBySourceStmt = db.prepare(`
    SELECT id FROM token_usage WHERE agent = ? AND source_key = ? LIMIT 1
  `);
  const updateTokenUsageByIdStmt = db.prepare(`
    UPDATE token_usage
    SET
      session_id = ?,
      model = ?,
      timestamp = ?,
      input_tokens = ?,
      output_tokens = ?,
      cache_read_tokens = ?,
      cache_creation_tokens = ?,
      reasoning_tokens = ?,
      source_kind = ?
    WHERE id = ?
  `);
  const deleteTokenUsageBeforeStmt = db.prepare(`DELETE FROM token_usage WHERE timestamp < ?`);

  const dailyStatsStmt = db.prepare(`
    SELECT
      date(timestamp / 1000, 'unixepoch', 'localtime') AS date,
      agent,
      SUM(input_tokens) AS inputTokens,
      SUM(output_tokens) AS outputTokens,
      SUM(cache_read_tokens) AS cacheReadTokens,
      SUM(cache_creation_tokens) AS cacheCreationTokens,
      SUM(reasoning_tokens) AS reasoningTokens,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS totalTokens,
      COUNT(*) AS requestCount
    FROM token_usage
    WHERE timestamp >= ? AND timestamp < ?
      AND (? IS NULL OR agent = ?)
    GROUP BY date, agent
    ORDER BY date ASC, agent ASC
  `);

  const modelStatsStmt = db.prepare(`
    SELECT
      COALESCE(model, 'unknown') AS model,
      agent,
      SUM(input_tokens) AS inputTokens,
      SUM(output_tokens) AS outputTokens,
      SUM(cache_read_tokens) AS cacheReadTokens,
      SUM(cache_creation_tokens) AS cacheCreationTokens,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS totalTokens,
      COUNT(*) AS requestCount
    FROM token_usage
    WHERE timestamp >= ? AND timestamp < ?
      AND (? IS NULL OR agent = ?)
    GROUP BY model, agent
    ORDER BY totalTokens DESC
  `);

  const agentStatsStmt = db.prepare(`
    SELECT
      agent,
      SUM(input_tokens) AS inputTokens,
      SUM(output_tokens) AS outputTokens,
      SUM(cache_read_tokens) AS cacheReadTokens,
      SUM(cache_creation_tokens) AS cacheCreationTokens,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS totalTokens,
      COUNT(*) AS requestCount
    FROM token_usage
    WHERE timestamp >= ? AND timestamp < ?
      AND (? IS NULL OR agent = ?)
    GROUP BY agent
    ORDER BY totalTokens DESC
  `);

  const topSessionStatsStmt = db.prepare(`
    SELECT
      token_usage.session_id AS sessionId,
      COALESCE(NULLIF(sessions.latest_task, ''), NULLIF(sessions.title, '')) AS title,
      token_usage.agent AS agent,
      COALESCE(token_usage.model, 'unknown') AS model,
      SUM(token_usage.input_tokens) AS inputTokens,
      SUM(token_usage.output_tokens) AS outputTokens,
      SUM(token_usage.cache_read_tokens) AS cacheReadTokens,
      SUM(token_usage.cache_creation_tokens) AS cacheCreationTokens,
      SUM(token_usage.input_tokens + token_usage.output_tokens + token_usage.cache_read_tokens + token_usage.cache_creation_tokens) AS totalTokens,
      COUNT(*) AS requestCount,
      MIN(token_usage.timestamp) AS firstSeenAt,
      MAX(token_usage.timestamp) AS lastSeenAt
    FROM token_usage
    LEFT JOIN sessions ON sessions.id = token_usage.session_id
    WHERE token_usage.timestamp >= ? AND token_usage.timestamp < ?
      AND (? IS NULL OR token_usage.agent = ?)
    GROUP BY token_usage.session_id, token_usage.agent, token_usage.model, sessions.latest_task, sessions.title
    ORDER BY totalTokens DESC
    LIMIT ?
  `);

  const sessionStatsStmt = db.prepare(`
    SELECT
      tool AS agent,
      status,
      COUNT(*) AS count
    FROM sessions
    WHERE updated_at >= ? AND updated_at < ?
    GROUP BY tool, status
    ORDER BY count DESC
  `);

  const modelPricingStmt = db.prepare(`SELECT * FROM model_pricing ORDER BY model_id ASC`);
  const upsertModelPricingStmt = db.prepare(`
    INSERT INTO model_pricing (model_id, display_name, input_per_million, output_per_million, cache_read_per_million, cache_creation_per_million)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id) DO UPDATE SET
      display_name = excluded.display_name,
      input_per_million = excluded.input_per_million,
      output_per_million = excluded.output_per_million,
      cache_read_per_million = excluded.cache_read_per_million,
      cache_creation_per_million = excluded.cache_creation_per_million
  `);

  function getDiagnostics(): HistoryDiagnostics {
    assertOpen();
    const counts = historyCountsStmt.get() as { sessionCount: number; activityCount: number };
    const cleanup = lastCleanupStmt.get(LAST_CLEANUP_AT_KEY) as { value: string } | undefined;
    return {
      enabled: true,
      dbPath: options.dbPath,
      dbSizeBytes: totalSqliteSize(options.dbPath),
      estimatedSessionCount: counts.sessionCount,
      estimatedActivityCount: counts.activityCount,
      lastCleanupAt: cleanup ? Number.parseInt(cleanup.value, 10) : null,
    };
  }

  function writeSessionEvent(write: PersistedSessionWrite) {
    assertOpen();
    db.exec("BEGIN");
    try {
      upsertSessionStmt.run(
        write.session.id,
        write.session.tool,
        write.session.status,
        write.session.title ?? null,
        write.session.latestTask ?? null,
        write.session.updatedAt,
        write.session.lastUserMessageAt ?? null,
        write.session.hasPendingActions ? 1 : 0,
      );

      for (const item of write.activityItems) {
        insertActivityStmt.run(
          item.id,
          write.session.id,
          item.timestamp,
          item.kind,
          item.source,
          item.title,
          item.body,
          item.tone ?? null,
          item.toolName ?? null,
          item.toolPhase ?? null,
          item.meta ? JSON.stringify(item.meta) : null,
        );
      }

      if (write.debugEvent) {
        insertDebugStmt.run(
          write.session.id,
          write.debugEvent.timestamp,
          write.debugEvent.tool,
          write.debugEvent.status,
          write.debugEvent.eventType ?? null,
          JSON.stringify(write.debugEvent.rawSubset),
        );
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function getSessionHistoryPage(request: SessionHistoryPageRequest): SessionHistoryPage {
    assertOpen();
    const limit = normalizeLimit(request.limit);
    const cursor = request.cursor ? decodeCursor(request.cursor) : null;
    const rows = pageStmt.all(
      request.sessionId,
      cursor ? cursor.timestamp : null,
      cursor ? cursor.timestamp : null,
      cursor ? cursor.timestamp : null,
      cursor ? cursor.insertSeq : null,
      limit + 1,
    ) as Array<{
      insertSeq: number;
      id: string;
      timestamp: number;
      kind: ActivityItem["kind"];
      source: ActivityItem["source"];
      title: string;
      body: string;
      tone: ActivityItem["tone"];
      toolName: string | null;
      toolPhase: ActivityItem["toolPhase"];
      meta_json: string | null;
    }>;

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const items: ActivityItem[] = pageRows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      kind: row.kind,
      source: row.source,
      title: row.title,
      body: row.body,
      ...(row.tone ? { tone: row.tone } : {}),
      ...(row.toolName ? { toolName: row.toolName } : {}),
      ...(row.toolPhase ? { toolPhase: row.toolPhase } : {}),
      ...(row.meta_json ? { meta: parseJsonObject(row.meta_json) } : {}),
    }));

    const lastRow = pageRows.at(-1);
    return {
      items,
      nextCursor:
        hasMore && lastRow
          ? encodeCursor({ timestamp: lastRow.timestamp, insertSeq: lastRow.insertSeq })
          : null,
      hasMore,
    };
  }

  function getRecentSessions(opts: GetRecentSessionsOptions): SessionSeedRecord[] {
    assertOpen();
    const cutoff = now() - opts.maxAgeMs;
    const limit = Math.max(1, Math.min(opts.limit, 500));
    const rows = recentSessionsStmt.all(cutoff, limit) as Array<{
      id: string;
      tool: string;
      status: string;
      title: string | null;
      latest_task: string | null;
      updated_at: number;
      last_user_message_at: number | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      tool: row.tool,
      status: row.status,
      title: row.title,
      latestTask: row.latest_task,
      updatedAt: row.updated_at,
      lastUserMessageAt: row.last_user_message_at,
    }));
  }

  function writeTokenUsage(entry: TokenUsageWrite) {
    assertOpen();
    const sourceKey =
      typeof entry.sourceKey === "string" && entry.sourceKey.trim()
        ? entry.sourceKey.trim()
        : null;
    const sourceKind =
      typeof entry.sourceKind === "string" && entry.sourceKind.trim()
        ? entry.sourceKind.trim()
        : null;

    db.exec("BEGIN");
    try {
      ensureTokenUsageSessionStmt.run(entry.sessionId, entry.agent, entry.timestamp);
      const existing =
        sourceKey !== null
          ? (findTokenUsageBySourceStmt.get(entry.agent, sourceKey) as { id: number } | undefined)
          : undefined;
      if (existing) {
        updateTokenUsageByIdStmt.run(
          entry.sessionId,
          entry.model ?? null,
          entry.timestamp,
          entry.inputTokens ?? 0,
          entry.outputTokens ?? 0,
          entry.cacheReadTokens ?? 0,
          entry.cacheCreationTokens ?? 0,
          entry.reasoningTokens ?? 0,
          sourceKind,
          existing.id,
        );
      } else {
        insertTokenUsageStmt.run(
          entry.sessionId,
          entry.agent,
          entry.model ?? null,
          entry.timestamp,
          entry.inputTokens ?? 0,
          entry.outputTokens ?? 0,
          entry.cacheReadTokens ?? 0,
          entry.cacheCreationTokens ?? 0,
          entry.reasoningTokens ?? 0,
          sourceKind,
          sourceKey,
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function writeUsageSessionSummary(summary: UsageSessionSummaryWrite) {
    assertOpen();
    const title = summary.title.trim();
    if (!title) {
      return;
    }
    upsertUsageSessionSummaryStmt.run(
      summary.sessionId,
      summary.agent,
      title,
      title,
      summary.timestamp,
      summary.timestamp,
    );
  }

  function getTokenUsageDailyStats(
    startMs: number,
    endMs: number,
    agent?: string,
  ): DailyTokenStats[] {
    assertOpen();
    const rows = dailyStatsStmt.all(
      startMs,
      endMs,
      agent ?? null,
      agent ?? null,
    ) as Array<{
      date: string;
      agent: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      requestCount: number;
    }>;
    return rows.map((row) => ({
      date: row.date,
      agent: row.agent,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      reasoningTokens: row.reasoningTokens,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
    }));
  }

  function getTokenUsageByModel(
    startMs: number,
    endMs: number,
    agent?: string,
  ): ModelTokenStats[] {
    assertOpen();
    const rows = modelStatsStmt.all(
      startMs,
      endMs,
      agent ?? null,
      agent ?? null,
    ) as Array<{
      model: string;
      agent: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      totalTokens: number;
      requestCount: number;
    }>;
    return rows.map((row) => ({
      model: row.model,
      agent: row.agent,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
    }));
  }

  function getTokenUsageByAgent(
    startMs: number,
    endMs: number,
    agent?: string,
  ): AgentTokenStats[] {
    assertOpen();
    const rows = agentStatsStmt.all(
      startMs,
      endMs,
      agent ?? null,
      agent ?? null,
    ) as Array<{
      agent: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      totalTokens: number;
      requestCount: number;
    }>;
    return rows.map((row) => ({
      agent: row.agent,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
    }));
  }

  function getTopTokenUsageSessions(
    startMs: number,
    endMs: number,
    agent?: string,
    limit = 20,
  ): SessionTokenStats[] {
    assertOpen();
    const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = topSessionStatsStmt.all(
      startMs,
      endMs,
      agent ?? null,
      agent ?? null,
      normalizedLimit,
    ) as Array<{
      sessionId: string;
      title: string | null;
      agent: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      totalTokens: number;
      requestCount: number;
      firstSeenAt: number;
      lastSeenAt: number;
    }>;
    return rows.map((row) => ({
      sessionId: row.sessionId,
      ...(row.title ? { title: row.title } : {}),
      agent: row.agent,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
    }));
  }

  function getUsageImportStatus(): UsageImportStatus {
    assertOpen();
    const completedAt = lastCleanupStmt.get(USAGE_IMPORT_COMPLETED_AT_KEY) as { value: string } | undefined;
    const claudeRows = lastCleanupStmt.get(USAGE_IMPORT_CLAUDE_ROWS_KEY) as { value: string } | undefined;
    const codexRows = lastCleanupStmt.get(USAGE_IMPORT_CODEX_ROWS_KEY) as { value: string } | undefined;
    const lastError = lastCleanupStmt.get(USAGE_IMPORT_LAST_ERROR_KEY) as { value: string } | undefined;
    const parsedCompletedAt = completedAt ? Number.parseInt(completedAt.value, 10) : NaN;
    const parsedClaudeRows = claudeRows ? Number.parseInt(claudeRows.value, 10) : NaN;
    const parsedCodexRows = codexRows ? Number.parseInt(codexRows.value, 10) : NaN;
    return {
      completedAt: Number.isFinite(parsedCompletedAt) ? parsedCompletedAt : null,
      claudeRowsImported: Number.isFinite(parsedClaudeRows) ? parsedClaudeRows : 0,
      codexRowsImported: Number.isFinite(parsedCodexRows) ? parsedCodexRows : 0,
      lastError: lastError?.value || null,
    };
  }

  function setUsageImportStatus(status: UsageImportStatus) {
    assertOpen();
    upsertMetaStmt.run(USAGE_IMPORT_COMPLETED_AT_KEY, String(status.completedAt ?? ""));
    upsertMetaStmt.run(USAGE_IMPORT_CLAUDE_ROWS_KEY, String(status.claudeRowsImported));
    upsertMetaStmt.run(USAGE_IMPORT_CODEX_ROWS_KEY, String(status.codexRowsImported));
    upsertMetaStmt.run(USAGE_IMPORT_LAST_ERROR_KEY, status.lastError ?? "");
  }

  function getSessionStats(
    startMs: number,
    endMs: number,
  ): Array<{ agent: string; status: string; count: number }> {
    assertOpen();
    return sessionStatsStmt.all(startMs, endMs) as Array<{
      agent: string;
      status: string;
      count: number;
    }>;
  }

  function getModelPricing(): ModelPricing[] {
    assertOpen();
    const rows = modelPricingStmt.all() as Array<{
      model_id: string;
      display_name: string;
      input_per_million: string;
      output_per_million: string;
      cache_read_per_million: string;
      cache_creation_per_million: string;
    }>;
    return rows.map((row) => ({
      modelId: row.model_id,
      displayName: row.display_name,
      inputPerMillion: row.input_per_million,
      outputPerMillion: row.output_per_million,
      cacheReadPerMillion: row.cache_read_per_million,
      cacheCreationPerMillion: row.cache_creation_per_million,
    }));
  }

  function upsertModelPricing(pricing: ModelPricing) {
    assertOpen();
    upsertModelPricingStmt.run(
      pricing.modelId,
      pricing.displayName,
      pricing.inputPerMillion,
      pricing.outputPerMillion,
      pricing.cacheReadPerMillion,
      pricing.cacheCreationPerMillion,
    );
  }

  function clearAll(): HistoryDiagnostics {
    assertOpen();
    db.exec(`
      DELETE FROM token_usage;
      DELETE FROM session_event_debug;
      DELETE FROM session_activity_items;
      DELETE FROM sessions;
      DELETE FROM history_meta;
    `);
    checkpointWal("TRUNCATE");
    db.exec("VACUUM");
    checkpointWal("TRUNCATE");
    return getDiagnostics();
  }

  function runCleanup(cleanup: CleanupOptions): HistoryDiagnostics {
    assertOpen();
    const currentTime = now();
    const detailCutoff = cutoffForRetention(currentTime, cleanup.detailRetention);
    const analyticsCutoff = cutoffForRetention(currentTime, cleanup.analyticsRetention);

    db.exec("BEGIN");
    try {
      if (detailCutoff !== null) {
        deleteActivityBeforeStmt.run(detailCutoff);
        deleteDebugBeforeStmt.run(detailCutoff);
      }
      if (analyticsCutoff !== null) {
        deleteTokenUsageBeforeStmt.run(analyticsCutoff);
      }
      deleteOrphanSessions(db);
      upsertMetaStmt.run(LAST_CLEANUP_AT_KEY, String(currentTime));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    checkpointWal("TRUNCATE");
    db.exec("VACUUM");
    checkpointWal("TRUNCATE");

    return getDiagnostics();
  }

  function close() {
    if (isClosed) {
      return;
    }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    isClosed = true;
  }

  return {
    writeSessionEvent,
    getSessionHistoryPage,
    getRecentSessions,
    getDiagnostics,
    clearAll,
    runCleanup,
    close,
    writeTokenUsage,
    writeUsageSessionSummary,
    getTokenUsageDailyStats,
    getTokenUsageByModel,
    getTokenUsageByAgent,
    getTopTokenUsageSessions,
    getSessionStats,
    getUsageImportStatus,
    setUsageImportStatus,
    getModelPricing,
    upsertModelPricing,
  };
}
