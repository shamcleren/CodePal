import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { HistoryDiagnostics, SessionHistoryPage, SessionHistoryPageRequest } from "../../shared/historyTypes";
import type { ActivityItem } from "../../shared/sessionTypes";

const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGE_LIMIT = 200;
const LAST_CLEANUP_AT_KEY = "lastCleanupAt";
const SQLITE_SIDE_FILES = ["", "-wal", "-shm"] as const;

type CleanupOptions = {
  retentionDays: number;
  maxStorageMb: number;
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

function deleteOrphanSessions(db: DatabaseSync) {
  db.exec(`
    DELETE FROM sessions
    WHERE id NOT IN (SELECT DISTINCT session_id FROM session_activity_items)
      AND id NOT IN (SELECT DISTINCT session_id FROM session_event_debug)
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
  `);

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
  const oldestActivityRowsStmt = db.prepare(`
    SELECT insert_seq AS insertSeq
    FROM session_activity_items
    ORDER BY timestamp ASC, insert_seq ASC
    LIMIT ?
  `);
  const oldestDebugRowsStmt = db.prepare(`
    SELECT id
    FROM session_event_debug
    ORDER BY timestamp ASC, id ASC
    LIMIT ?
  `);
  const deleteActivityBySeqStmt = db.prepare(`DELETE FROM session_activity_items WHERE insert_seq = ?`);
  const deleteDebugByIdStmt = db.prepare(`DELETE FROM session_event_debug WHERE id = ?`);

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

  function clearAll(): HistoryDiagnostics {
    assertOpen();
    db.exec(`
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
    const retentionCutoff = now() - Math.max(1, cleanup.retentionDays) * 24 * 60 * 60 * 1000;

    db.exec("BEGIN");
    try {
      deleteActivityBeforeStmt.run(retentionCutoff);
      deleteDebugBeforeStmt.run(retentionCutoff);
      deleteOrphanSessions(db);
      upsertMetaStmt.run(LAST_CLEANUP_AT_KEY, String(now()));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const maxBytes = Math.max(1, cleanup.maxStorageMb) * 1024 * 1024;
    checkpointWal("TRUNCATE");
    db.exec("VACUUM");
    checkpointWal("TRUNCATE");
    let currentSize = totalSqliteSize(options.dbPath);
    let trimmed = false;

    while (currentSize > maxBytes) {
      const oldestActivityRows = oldestActivityRowsStmt.all(200) as Array<{ insertSeq: number }>;
      if (oldestActivityRows.length > 0) {
        db.exec("BEGIN");
        try {
          for (const row of oldestActivityRows) {
            deleteActivityBySeqStmt.run(row.insertSeq);
          }
          deleteOrphanSessions(db);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        trimmed = true;
      } else {
        const oldestDebugRows = oldestDebugRowsStmt.all(200) as Array<{ id: number }>;
        if (oldestDebugRows.length === 0) {
          break;
        }
        db.exec("BEGIN");
        try {
          for (const row of oldestDebugRows) {
            deleteDebugByIdStmt.run(row.id);
          }
          deleteOrphanSessions(db);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        trimmed = true;
      }

      checkpointWal("TRUNCATE");
      db.exec("VACUUM");
      checkpointWal("TRUNCATE");
      currentSize = totalSqliteSize(options.dbPath);
    }

    if (!trimmed) {
      checkpointWal("TRUNCATE");
      db.exec("VACUUM");
      checkpointWal("TRUNCATE");
    }

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
  };
}
