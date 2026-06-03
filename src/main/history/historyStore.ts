import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { HistoryRetentionPreset } from "../../shared/appSettings";
import type { TokenTrendGranularity, TokenTrendPoint } from "../../shared/analyticsTypes";
import type {
  HistoryDiagnostics,
  SessionHistoryPage,
  SessionHistoryPageRequest,
  UserPromptSummary,
} from "../../shared/historyTypes";
import { computeSessionTiming } from "../../shared/sessionTiming";
import type { ActivityItem, SessionModelSource } from "../../shared/sessionTypes";
import type {
  AgentTokenStats,
  DailyTokenStats,
  ModelPricing,
  ModelTokenStats,
  ProjectTokenStats,
  SessionTokenStats,
  TokenUsageWrite,
  UsageImportStatus,
} from "../../shared/usageTypes";
import {
  UNKNOWN_PROJECT_NAME,
  UNKNOWN_PROJECT_PATH,
  normalizeProjectAttribution,
} from "../../shared/projectAttribution";

const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGE_LIMIT = 200;
const LAST_CLEANUP_AT_KEY = "lastCleanupAt";
const USAGE_IMPORT_COMPLETED_AT_KEY = "usageImport.completedAt";
const USAGE_IMPORT_CLAUDE_ROWS_KEY = "usageImport.claudeRowsImported";
const USAGE_IMPORT_CODEX_ROWS_KEY = "usageImport.codexRowsImported";
const USAGE_IMPORT_LAST_ERROR_KEY = "usageImport.lastError";
const CODEX_CACHED_INPUT_NORMALIZED_KEY = "usage.codexCachedInputNormalized.v1";
const TOKEN_USAGE_SEMANTIC_CLEANUP_KEY = "usage.semanticCleanup.v1";
const SQLITE_SIDE_FILES = ["", "-wal", "-shm"] as const;

type CleanupRetention = HistoryRetentionPreset | `${number}d`;

type CleanupOptions = {
  detailRetention: CleanupRetention;
  analyticsRetention: CleanupRetention;
};

function bucketStartFor(timestamp: number, granularity: TokenTrendGranularity): number {
  if (granularity === "day") {
    const day = new Date(timestamp);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  }
  const bucketMs = granularity === "minute" ? 60_000 : 60 * 60_000;
  return Math.floor(timestamp / bucketMs) * bucketMs;
}

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
    model?: string;
    modelSource?: SessionModelSource;
    updatedAt: number;
    lastUserMessageAt?: number;
    hasPendingActions: boolean;
    projectPath?: string;
    projectName?: string;
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
  model?: string | null;
  modelSource?: SessionModelSource | null;
  projectPath?: string | null;
  projectName?: string | null;
  updatedAt: number;
  lastUserMessageAt: number | null;
  startedAt?: number | null;
  sessionDurationMs?: number | null;
  latestRunningDurationMs?: number | null;
  userPrompts?: UserPromptSummary[];
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
  projectPath?: string;
  projectName?: string;
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

function normalizedProjectFields(input: {
  projectPath?: string;
  projectName?: string;
}): { projectPath: string | null; projectName: string | null } {
  const project = normalizeProjectAttribution(input.projectPath, input.projectName);
  return {
    projectPath: project?.projectPath ?? null,
    projectName: project?.projectName ?? null,
  };
}

function normalizedSessionModel(value: string | undefined | null): string | null {
  const model = value?.trim();
  if (!model || model.toLowerCase() === "unknown") {
    return null;
  }
  return model;
}

function normalizedSessionModelSource(
  source: SessionModelSource | undefined,
  model: string | null,
): SessionModelSource | null {
  if (!model) {
    return null;
  }
  return source ?? "event-meta";
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
      model TEXT,
      model_source TEXT,
      updated_at INTEGER NOT NULL,
      last_user_message_at INTEGER,
      has_pending_actions INTEGER NOT NULL DEFAULT 0,
      project_path TEXT,
      project_name TEXT
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
      project_path TEXT,
      project_name TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_token_usage_ts
      ON token_usage (timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_token_usage_agent_ts
      ON token_usage (agent, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_token_usage_session_model_ts
      ON token_usage (session_id, model, timestamp DESC);

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
    "ALTER TABLE sessions ADD COLUMN model TEXT",
    "ALTER TABLE sessions ADD COLUMN model_source TEXT",
    "ALTER TABLE sessions ADD COLUMN project_path TEXT",
    "ALTER TABLE sessions ADD COLUMN project_name TEXT",
    "ALTER TABLE token_usage ADD COLUMN source_kind TEXT",
    "ALTER TABLE token_usage ADD COLUMN source_key TEXT",
    "ALTER TABLE token_usage ADD COLUMN project_path TEXT",
    "ALTER TABLE token_usage ADD COLUMN project_name TEXT",
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
    CREATE INDEX IF NOT EXISTS idx_token_usage_project_ts
      ON token_usage (project_path, timestamp DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_source_key
      ON token_usage (agent, source_key)
      WHERE source_key IS NOT NULL
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_usage_semantic
      ON token_usage (
        agent, session_id, model, input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens
      )
  `);

  const codexCachedInputNormalized = db
    .prepare(`SELECT value FROM history_meta WHERE key = ?`)
    .get(CODEX_CACHED_INPUT_NORMALIZED_KEY);
  if (!codexCachedInputNormalized) {
    db.exec(`
      UPDATE token_usage
      SET input_tokens = MAX(input_tokens - cache_read_tokens, 0)
      WHERE agent = 'codex'
        AND cache_read_tokens > 0;

      INSERT INTO history_meta (key, value)
      VALUES ('${CODEX_CACHED_INPUT_NORMALIZED_KEY}', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
  }

  const semanticCleanupCompleted = db
    .prepare(`SELECT value FROM history_meta WHERE key = ?`)
    .get(TOKEN_USAGE_SEMANTIC_CLEANUP_KEY);
  if (!semanticCleanupCompleted) {
    db.exec(`
    DROP TABLE IF EXISTS temp_token_usage_keyed_semantic;
    CREATE TEMP TABLE temp_token_usage_keyed_semantic AS
      SELECT
        agent,
        session_id,
        COALESCE(model, '') AS model_key,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens,
        reasoning_tokens
      FROM token_usage
      WHERE source_key IS NOT NULL
        AND source_key != ''
      GROUP BY agent, session_id, COALESCE(model, ''), input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens;
    CREATE INDEX temp_token_usage_keyed_semantic_idx
      ON temp_token_usage_keyed_semantic (
        agent, session_id, model_key, input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens
      );

    DELETE FROM token_usage
    WHERE id IN (
      SELECT legacy.id
      FROM token_usage AS legacy
      JOIN temp_token_usage_keyed_semantic AS keyed
        ON keyed.agent = legacy.agent
       AND keyed.session_id = legacy.session_id
       AND keyed.model_key = COALESCE(legacy.model, '')
       AND keyed.input_tokens = legacy.input_tokens
       AND keyed.output_tokens = legacy.output_tokens
       AND keyed.cache_read_tokens = legacy.cache_read_tokens
       AND keyed.cache_creation_tokens = legacy.cache_creation_tokens
       AND keyed.reasoning_tokens = legacy.reasoning_tokens
      WHERE legacy.source_key IS NULL
         OR legacy.source_key = ''
    );
    DROP TABLE IF EXISTS temp_token_usage_keyed_semantic;

    DROP TABLE IF EXISTS temp_token_usage_missing_keep;
    CREATE TEMP TABLE temp_token_usage_missing_keep AS
      SELECT
        MIN(id) AS keep_id,
        agent,
        session_id,
        COALESCE(model, '') AS model_key,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens,
        reasoning_tokens
      FROM token_usage
      WHERE source_key IS NULL
         OR source_key = ''
      GROUP BY agent, session_id, COALESCE(model, ''), input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens;
    CREATE INDEX temp_token_usage_missing_keep_idx
      ON temp_token_usage_missing_keep (
        agent, session_id, model_key, input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens
      );

    DELETE FROM token_usage
    WHERE id IN (
      SELECT missing.id
      FROM token_usage AS missing
      JOIN temp_token_usage_missing_keep AS keep
        ON keep.agent = missing.agent
       AND keep.session_id = missing.session_id
       AND keep.model_key = COALESCE(missing.model, '')
       AND keep.input_tokens = missing.input_tokens
       AND keep.output_tokens = missing.output_tokens
       AND keep.cache_read_tokens = missing.cache_read_tokens
       AND keep.cache_creation_tokens = missing.cache_creation_tokens
       AND keep.reasoning_tokens = missing.reasoning_tokens
      WHERE (missing.source_key IS NULL OR missing.source_key = '')
        AND missing.id != keep.keep_id
    );
    DROP TABLE IF EXISTS temp_token_usage_missing_keep;

    DROP TABLE IF EXISTS temp_codex_stable_semantic;
    CREATE TEMP TABLE temp_codex_stable_semantic AS
      SELECT
        session_id,
        COALESCE(model, '') AS model_key,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens,
        reasoning_tokens
      FROM token_usage
      WHERE agent = 'codex'
        AND source_kind = 'codex-jsonl'
        AND source_key LIKE '%:total:%:last:%'
      GROUP BY session_id, COALESCE(model, ''), input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens;
    CREATE INDEX temp_codex_stable_semantic_idx
      ON temp_codex_stable_semantic (
        session_id, model_key, input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens
      );

    DELETE FROM token_usage
    WHERE id IN (
      SELECT old.id
      FROM token_usage AS old
      JOIN temp_codex_stable_semantic AS stable
        ON stable.session_id = old.session_id
       AND stable.model_key = COALESCE(old.model, '')
       AND stable.input_tokens = old.input_tokens
       AND stable.output_tokens = old.output_tokens
       AND stable.cache_read_tokens = old.cache_read_tokens
       AND stable.cache_creation_tokens = old.cache_creation_tokens
       AND stable.reasoning_tokens = old.reasoning_tokens
      WHERE old.agent = 'codex'
        AND old.source_kind = 'codex-jsonl'
        AND old.source_key IS NOT NULL
        AND old.source_key != ''
        AND old.source_key NOT LIKE '%:total:%:last:%'
    );
    DROP TABLE IF EXISTS temp_codex_stable_semantic;

    DROP TABLE IF EXISTS temp_codex_old_keep;
    CREATE TEMP TABLE temp_codex_old_keep AS
      SELECT
        MIN(id) AS keep_id,
        session_id,
        COALESCE(model, '') AS model_key,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens,
        reasoning_tokens
      FROM token_usage
      WHERE agent = 'codex'
        AND source_kind = 'codex-jsonl'
        AND source_key IS NOT NULL
        AND source_key != ''
        AND source_key NOT LIKE '%:total:%:last:%'
      GROUP BY session_id, COALESCE(model, ''), input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens;
    CREATE INDEX temp_codex_old_keep_idx
      ON temp_codex_old_keep (
        session_id, model_key, input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, reasoning_tokens
      );

    DELETE FROM token_usage
    WHERE id IN (
      SELECT old.id
      FROM token_usage AS old
      JOIN temp_codex_old_keep AS keep
        ON keep.session_id = old.session_id
       AND keep.model_key = COALESCE(old.model, '')
       AND keep.input_tokens = old.input_tokens
       AND keep.output_tokens = old.output_tokens
       AND keep.cache_read_tokens = old.cache_read_tokens
       AND keep.cache_creation_tokens = old.cache_creation_tokens
       AND keep.reasoning_tokens = old.reasoning_tokens
      WHERE old.agent = 'codex'
        AND old.source_kind = 'codex-jsonl'
        AND old.source_key IS NOT NULL
        AND old.source_key != ''
        AND old.source_key NOT LIKE '%:total:%:last:%'
        AND old.id != keep.keep_id
    );
    DROP TABLE IF EXISTS temp_codex_old_keep;

    INSERT INTO history_meta (key, value)
    VALUES ('${TOKEN_USAGE_SEMANTIC_CLEANUP_KEY}', '1')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `);
  }

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
  // Backfill persisted session summaries after app updates. Token usage rows
  // can predate the session-level model field, so choose the last observed
  // non-empty model for each session.
  db.exec(`
    UPDATE sessions
    SET model = (
      SELECT token_usage.model
      FROM token_usage
      WHERE token_usage.session_id = sessions.id
        AND NULLIF(token_usage.model, '') IS NOT NULL
        AND lower(token_usage.model) != 'unknown'
      ORDER BY token_usage.timestamp DESC, token_usage.id DESC
      LIMIT 1
    )
    WHERE EXISTS (
        SELECT 1
        FROM token_usage
        WHERE token_usage.session_id = sessions.id
          AND NULLIF(token_usage.model, '') IS NOT NULL
          AND lower(token_usage.model) != 'unknown'
      )
  `);
  db.exec(`
    UPDATE sessions
    SET model_source = 'token-usage'
    WHERE model_source IS NULL
      AND NULLIF(model, '') IS NOT NULL
      AND lower(model) != 'unknown'
      AND EXISTS (
        SELECT 1
        FROM token_usage
        WHERE token_usage.session_id = sessions.id
          AND NULLIF(token_usage.model, '') IS NOT NULL
          AND lower(token_usage.model) != 'unknown'
      )
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

  function tokenUsageProjectFields(entry: TokenUsageWrite): {
    projectPath: string | null;
    projectName: string | null;
  } {
    const explicit = normalizedProjectFields(entry);
    if (explicit.projectPath) {
      return explicit;
    }
    const sessionProject = sessionProjectStmt.get(entry.sessionId) as
      | { projectPath: string | null; projectName: string | null }
      | undefined;
    return normalizedProjectFields({
      projectPath: sessionProject?.projectPath ?? undefined,
      projectName: sessionProject?.projectName ?? undefined,
    });
  }

  const upsertSessionStmt = db.prepare(`
    INSERT INTO sessions (
      id, tool, status, title, latest_task, model, model_source, updated_at, last_user_message_at,
      has_pending_actions, project_path, project_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      model = CASE
        WHEN excluded.model IS NOT NULL
          AND (
            sessions.model IS NULL
            OR sessions.model = ''
            OR excluded.updated_at >= sessions.updated_at
          )
        THEN excluded.model
        ELSE sessions.model
      END,
      model_source = CASE
        WHEN excluded.model IS NOT NULL
          AND (
            sessions.model IS NULL
            OR sessions.model = ''
            OR excluded.updated_at >= sessions.updated_at
          )
        THEN excluded.model_source
        ELSE sessions.model_source
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
      END,
      project_path = CASE
        WHEN excluded.project_path IS NOT NULL THEN excluded.project_path
        ELSE sessions.project_path
      END,
      project_name = CASE
        WHEN excluded.project_name IS NOT NULL THEN excluded.project_name
        ELSE sessions.project_name
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
    SELECT id, tool, status, title, latest_task, model, model_source, project_path, project_name, updated_at, last_user_message_at
    FROM sessions
    WHERE updated_at >= ?
      AND last_user_message_at IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT ?
  `);
  const sessionTimingItemsStmt = db.prepare(`
    SELECT timestamp, tone
    FROM session_activity_items
    WHERE session_id = ?
    ORDER BY timestamp ASC, insert_seq ASC
  `);
  const sessionUserPromptsStmt = db.prepare(`
    SELECT item_id AS id, body, timestamp
    FROM session_activity_items
    WHERE session_id = ?
      AND kind = 'message'
      AND source = 'user'
    ORDER BY timestamp ASC, insert_seq ASC
  `);
  const deleteActivityBeforeStmt = db.prepare(`DELETE FROM session_activity_items WHERE timestamp < ?`);
  const deleteDebugBeforeStmt = db.prepare(`DELETE FROM session_event_debug WHERE timestamp < ?`);

  // Token usage statements
  const ensureTokenUsageSessionStmt = db.prepare(`
    INSERT INTO sessions (
      id, tool, status, title, latest_task, model, model_source, updated_at, last_user_message_at,
      has_pending_actions, project_path, project_name
    )
    VALUES (?, ?, 'unknown', NULL, NULL, ?, ?, ?, NULL, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = MAX(sessions.updated_at, excluded.updated_at),
      model = CASE
        WHEN excluded.model IS NOT NULL AND excluded.updated_at >= sessions.updated_at THEN excluded.model
        WHEN (sessions.model IS NULL OR sessions.model = '') AND excluded.model IS NOT NULL THEN excluded.model
        ELSE sessions.model
      END,
      model_source = CASE
        WHEN excluded.model IS NOT NULL AND excluded.updated_at >= sessions.updated_at THEN excluded.model_source
        WHEN (sessions.model IS NULL OR sessions.model = '') AND excluded.model IS NOT NULL THEN excluded.model_source
        ELSE sessions.model_source
      END,
      project_path = CASE
        WHEN sessions.project_path IS NULL THEN excluded.project_path
        ELSE sessions.project_path
      END,
      project_name = CASE
        WHEN sessions.project_name IS NULL THEN excluded.project_name
        ELSE sessions.project_name
      END
  `);
  const upsertUsageSessionSummaryStmt = db.prepare(`
    INSERT INTO sessions (
      id, tool, status, title, latest_task, updated_at, last_user_message_at,
      has_pending_actions, project_path, project_name
    )
    VALUES (?, ?, 'usage-only', ?, ?, ?, ?, 0, ?, ?)
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
      END,
      project_path = CASE
        WHEN sessions.project_path IS NULL THEN excluded.project_path
        ELSE sessions.project_path
      END,
      project_name = CASE
        WHEN sessions.project_name IS NULL THEN excluded.project_name
        ELSE sessions.project_name
      END
  `);
  const sessionProjectStmt = db.prepare(`
    SELECT project_path AS projectPath, project_name AS projectName
    FROM sessions
    WHERE id = ?
  `);
  const insertTokenUsageStmt = db.prepare(`
    INSERT INTO token_usage (
      session_id, agent, model, timestamp, input_tokens, output_tokens,
      cache_read_tokens, cache_creation_tokens, reasoning_tokens, source_kind,
      source_key, project_path, project_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      source_kind = ?,
      project_path = COALESCE(?, project_path),
      project_name = COALESCE(?, project_name)
    WHERE id = ?
  `);
  const deleteLegacyDuplicateTokenUsageStmt = db.prepare(`
    DELETE FROM token_usage
    WHERE (? IS NULL OR id != ?)
      AND session_id = ?
      AND agent = ?
      AND COALESCE(model, '') = COALESCE(?, '')
      AND input_tokens = ?
      AND output_tokens = ?
      AND cache_read_tokens = ?
      AND cache_creation_tokens = ?
      AND reasoning_tokens = ?
      AND (
        source_key IS NULL
        OR source_key = ''
        OR (? = 'codex' AND source_kind = 'codex-jsonl' AND source_key NOT LIKE '%:total:%:last:%')
      )
  `);
  const deleteTokenUsageBeforeStmt = db.prepare(`DELETE FROM token_usage WHERE timestamp < ?`);
  const repairTokenUsageProjectStmt = db.prepare(`
    UPDATE token_usage
    SET
      project_path = COALESCE(
        NULLIF(project_path, ''),
        (SELECT NULLIF(sessions.project_path, '') FROM sessions WHERE sessions.id = token_usage.session_id)
      ),
      project_name = COALESCE(
        NULLIF(project_name, ''),
        (SELECT NULLIF(sessions.project_name, '') FROM sessions WHERE sessions.id = token_usage.session_id)
      )
    WHERE (
        project_path IS NULL OR project_path = ''
        OR project_name IS NULL OR project_name = ''
      )
      AND EXISTS (
        SELECT 1
        FROM sessions
        WHERE sessions.id = token_usage.session_id
          AND NULLIF(sessions.project_path, '') IS NOT NULL
      )
  `);
  const repairSessionProjectFromTokenUsageStmt = db.prepare(`
    UPDATE sessions
    SET
      project_path = COALESCE(
        NULLIF(project_path, ''),
        (
          SELECT NULLIF(token_usage.project_path, '')
          FROM token_usage
          WHERE token_usage.session_id = sessions.id
            AND NULLIF(token_usage.project_path, '') IS NOT NULL
          GROUP BY NULLIF(token_usage.project_path, ''), NULLIF(token_usage.project_name, '')
          ORDER BY
            SUM(token_usage.input_tokens + token_usage.output_tokens + token_usage.cache_read_tokens + token_usage.cache_creation_tokens) DESC,
            COUNT(*) DESC,
            NULLIF(token_usage.project_path, '') ASC
          LIMIT 1
        )
      ),
      project_name = COALESCE(
        NULLIF(project_name, ''),
        (
          SELECT COALESCE(NULLIF(token_usage.project_name, ''), NULLIF(token_usage.project_path, ''))
          FROM token_usage
          WHERE token_usage.session_id = sessions.id
            AND NULLIF(token_usage.project_path, '') IS NOT NULL
          GROUP BY NULLIF(token_usage.project_path, ''), NULLIF(token_usage.project_name, '')
          ORDER BY
            SUM(token_usage.input_tokens + token_usage.output_tokens + token_usage.cache_read_tokens + token_usage.cache_creation_tokens) DESC,
            COUNT(*) DESC,
            NULLIF(token_usage.project_path, '') ASC
          LIMIT 1
        )
      )
    WHERE (
        project_path IS NULL OR project_path = ''
        OR project_name IS NULL OR project_name = ''
      )
      AND EXISTS (
        SELECT 1
        FROM token_usage
        WHERE token_usage.session_id = sessions.id
          AND NULLIF(token_usage.project_path, '') IS NOT NULL
      )
  `);

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

  const projectStatsStmt = db.prepare(`
    SELECT
      COALESCE(
        NULLIF(token_usage.project_path, ''),
        NULLIF(sessions.project_path, ''),
        '${UNKNOWN_PROJECT_PATH}'
      ) AS projectPath,
      COALESCE(
        NULLIF(token_usage.project_name, ''),
        NULLIF(sessions.project_name, ''),
        '${UNKNOWN_PROJECT_NAME}'
      ) AS projectName,
      SUM(token_usage.input_tokens) AS inputTokens,
      SUM(token_usage.output_tokens) AS outputTokens,
      SUM(token_usage.cache_read_tokens) AS cacheReadTokens,
      SUM(token_usage.cache_creation_tokens) AS cacheCreationTokens,
      SUM(token_usage.input_tokens + token_usage.output_tokens + token_usage.cache_read_tokens + token_usage.cache_creation_tokens) AS totalTokens,
      COUNT(*) AS requestCount,
      SUM(
        (token_usage.input_tokens / 1000000.0) * COALESCE(CAST(model_pricing.input_per_million AS REAL), 0) +
        (token_usage.output_tokens / 1000000.0) * COALESCE(CAST(model_pricing.output_per_million AS REAL), 0) +
        (token_usage.cache_read_tokens / 1000000.0) * COALESCE(CAST(model_pricing.cache_read_per_million AS REAL), 0) +
        (token_usage.cache_creation_tokens / 1000000.0) * COALESCE(CAST(model_pricing.cache_creation_per_million AS REAL), 0)
      ) AS estimatedCost,
      MIN(token_usage.timestamp) AS firstSeenAt,
      MAX(token_usage.timestamp) AS lastSeenAt
    FROM token_usage
    LEFT JOIN sessions ON sessions.id = token_usage.session_id
    LEFT JOIN model_pricing ON model_pricing.model_id = COALESCE(token_usage.model, 'unknown')
    WHERE token_usage.timestamp >= ? AND token_usage.timestamp < ?
      AND (? IS NULL OR token_usage.agent = ?)
    GROUP BY projectPath
    ORDER BY
      CASE WHEN projectPath = '${UNKNOWN_PROJECT_PATH}' THEN 1 ELSE 0 END ASC,
      totalTokens DESC,
      requestCount DESC,
      projectName ASC
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

  const sessionTokenUsageStmt = db.prepare(`
    SELECT
      token_usage.agent AS agent,
      COALESCE(token_usage.model, 'unknown') AS model,
      SUM(token_usage.input_tokens) AS inputTokens,
      SUM(token_usage.output_tokens) AS outputTokens,
      SUM(token_usage.cache_read_tokens) AS cacheReadTokens,
      SUM(token_usage.cache_creation_tokens) AS cacheCreationTokens,
      SUM(token_usage.reasoning_tokens) AS reasoningTokens,
      SUM(token_usage.input_tokens + token_usage.output_tokens + token_usage.cache_read_tokens + token_usage.cache_creation_tokens) AS totalTokens,
      COUNT(*) AS requestCount,
      MIN(token_usage.timestamp) AS firstSeenAt,
      MAX(token_usage.timestamp) AS lastSeenAt
    FROM token_usage
    WHERE token_usage.session_id = ?
    GROUP BY token_usage.agent, token_usage.model
    ORDER BY totalTokens DESC
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
    const project = normalizedProjectFields(write.session);
    const model = normalizedSessionModel(write.session.model);
    const modelSource = normalizedSessionModelSource(write.session.modelSource, model);
    db.exec("BEGIN");
    try {
      upsertSessionStmt.run(
        write.session.id,
        write.session.tool,
        write.session.status,
        write.session.title ?? null,
        write.session.latestTask ?? null,
        model,
        modelSource,
        write.session.updatedAt,
        write.session.lastUserMessageAt ?? null,
        write.session.hasPendingActions ? 1 : 0,
        project.projectPath,
        project.projectName,
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
      model: string | null;
      model_source: SessionModelSource | null;
      updated_at: number;
      last_user_message_at: number | null;
      project_path: string | null;
      project_name: string | null;
    }>;
    return rows.map((row) => {
      const activityItems = sessionTimingItemsStmt.all(row.id) as Array<{
        timestamp: number;
        tone: ActivityItem["tone"] | null;
      }>;
      const timing = computeSessionTiming({
        status: row.status,
        updatedAt: row.updated_at,
        lastUserMessageAt: row.last_user_message_at,
        activityItems: activityItems.map((item) => ({
          timestamp: item.timestamp,
          ...(item.tone ? { tone: item.tone } : {}),
        })),
      }, now());
      const userPrompts = sessionUserPromptsStmt.all(row.id) as UserPromptSummary[];
      return {
        id: row.id,
        tool: row.tool,
        status: row.status,
        title: row.title,
        latestTask: row.latest_task,
        model: row.model,
        modelSource: row.model_source,
        projectPath: row.project_path,
        projectName: row.project_name,
        updatedAt: row.updated_at,
        lastUserMessageAt: row.last_user_message_at,
        ...(timing.startedAt !== undefined ? { startedAt: timing.startedAt } : {}),
        ...(timing.sessionDurationMs !== undefined
          ? { sessionDurationMs: timing.sessionDurationMs }
          : {}),
        ...(timing.latestRunningDurationMs !== undefined
          ? { latestRunningDurationMs: timing.latestRunningDurationMs }
          : {}),
        ...(userPrompts.length > 0 ? { userPrompts } : {}),
      };
    });
  }

  function writeTokenUsage(entry: TokenUsageWrite) {
    assertOpen();
    const project = tokenUsageProjectFields(entry);
    const sourceKey =
      typeof entry.sourceKey === "string" && entry.sourceKey.trim()
        ? entry.sourceKey.trim()
        : null;
    const sourceKind =
      typeof entry.sourceKind === "string" && entry.sourceKind.trim()
        ? entry.sourceKind.trim()
        : null;
    const inputTokens = entry.inputTokens ?? 0;
    const outputTokens = entry.outputTokens ?? 0;
    const cacheReadTokens = entry.cacheReadTokens ?? 0;
    const cacheCreationTokens = entry.cacheCreationTokens ?? 0;
    const reasoningTokens = entry.reasoningTokens ?? 0;

    db.exec("BEGIN");
    try {
      ensureTokenUsageSessionStmt.run(
        entry.sessionId,
        entry.agent,
        normalizedSessionModel(entry.model),
        normalizedSessionModel(entry.model) ? "token-usage" : null,
        entry.timestamp,
        project.projectPath,
        project.projectName,
      );
      const existing =
        sourceKey !== null
          ? (findTokenUsageBySourceStmt.get(entry.agent, sourceKey) as { id: number } | undefined)
          : undefined;
      if (sourceKey !== null) {
        deleteLegacyDuplicateTokenUsageStmt.run(
          existing?.id ?? null,
          existing?.id ?? null,
          entry.sessionId,
          entry.agent,
          entry.model ?? null,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          reasoningTokens,
          entry.agent,
        );
      }
      if (existing) {
        updateTokenUsageByIdStmt.run(
          entry.sessionId,
          entry.model ?? null,
          entry.timestamp,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          reasoningTokens,
          sourceKind,
          project.projectPath,
          project.projectName,
          existing.id,
        );
      } else {
        insertTokenUsageStmt.run(
          entry.sessionId,
          entry.agent,
          entry.model ?? null,
          entry.timestamp,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          reasoningTokens,
          sourceKind,
          sourceKey,
          project.projectPath,
          project.projectName,
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function repairTokenUsageProjectAttribution(): number {
    assertOpen();
    db.exec("BEGIN");
    try {
      const sessionResult = repairSessionProjectFromTokenUsageStmt.run() as { changes?: number };
      const usageResult = repairTokenUsageProjectStmt.run() as { changes?: number };
      db.exec("COMMIT");
      return (
        (typeof sessionResult.changes === "number" ? sessionResult.changes : 0) +
        (typeof usageResult.changes === "number" ? usageResult.changes : 0)
      );
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
    const project = normalizedProjectFields(summary);
    upsertUsageSessionSummaryStmt.run(
      summary.sessionId,
      summary.agent,
      title,
      title,
      summary.timestamp,
      summary.timestamp,
      project.projectPath,
      project.projectName,
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

  function getTokenUsageByProject(
    startMs: number,
    endMs: number,
    agent?: string,
  ): ProjectTokenStats[] {
    assertOpen();
    const rows = projectStatsStmt.all(
      startMs,
      endMs,
      agent ?? null,
      agent ?? null,
    ) as Array<{
      projectPath: string;
      projectName: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      totalTokens: number;
      requestCount: number;
      estimatedCost: number | null;
      firstSeenAt: number;
      lastSeenAt: number;
    }>;
    return rows.map((row) => ({
      projectPath: row.projectPath,
      projectName: row.projectName,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
      estimatedCost: row.estimatedCost ?? 0,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
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

  function getSessionTokenUsage(sessionId: string): SessionTokenStats[] {
    assertOpen();
    const rows = sessionTokenUsageStmt.all(sessionId) as Array<{
      agent: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      requestCount: number;
      firstSeenAt: number;
      lastSeenAt: number;
    }>;
    return rows.map((row) => ({
      sessionId,
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

  function getTokenUsageTrend(
    startMs: number,
    endMs: number,
    granularity: TokenTrendGranularity,
    filters: { agent?: string; model?: string; projectPath?: string } = {},
  ): TokenTrendPoint[] {
    assertOpen();
    const rows = db.prepare(`
      SELECT
        timestamp,
        token_usage.agent AS agent,
        COALESCE(token_usage.model, 'unknown') AS model,
        COALESCE(
          NULLIF(token_usage.project_path, ''),
          NULLIF(sessions.project_path, ''),
          '${UNKNOWN_PROJECT_PATH}'
        ) AS projectPath,
        COALESCE(
          NULLIF(token_usage.project_name, ''),
          NULLIF(sessions.project_name, ''),
          '${UNKNOWN_PROJECT_NAME}'
        ) AS projectName,
        token_usage.input_tokens AS inputTokens,
        token_usage.output_tokens AS outputTokens,
        token_usage.cache_read_tokens AS cacheReadTokens,
        token_usage.cache_creation_tokens AS cacheCreationTokens,
        token_usage.reasoning_tokens AS reasoningTokens
      FROM token_usage
      LEFT JOIN sessions ON sessions.id = token_usage.session_id
      WHERE token_usage.timestamp >= ? AND token_usage.timestamp < ?
        AND (? IS NULL OR token_usage.agent = ?)
        AND (? IS NULL OR COALESCE(token_usage.model, 'unknown') = ?)
        AND (
          ? IS NULL
          OR COALESCE(
            NULLIF(token_usage.project_path, ''),
            NULLIF(sessions.project_path, ''),
            '${UNKNOWN_PROJECT_PATH}'
          ) = ?
        )
      ORDER BY timestamp ASC, projectPath ASC, agent ASC, model ASC
    `).all(
      startMs,
      endMs,
      filters.agent ?? null,
      filters.agent ?? null,
      filters.model ?? null,
      filters.model ?? null,
      filters.projectPath ?? null,
      filters.projectPath ?? null,
    ) as Array<{
      timestamp: number;
      agent: string;
      model: string;
      projectPath: string;
      projectName: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      reasoningTokens: number;
    }>;

    const buckets = new Map<string, TokenTrendPoint>();
    for (const row of rows) {
      const bucketStart = bucketStartFor(row.timestamp, granularity);
      const key = `${bucketStart}\u0000${row.projectPath}\u0000${row.agent}\u0000${row.model}`;
      const existing = buckets.get(key) ?? {
        bucketStart,
        projectPath: row.projectPath,
        projectName: row.projectName,
        agent: row.agent,
        model: row.model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        requestCount: 0,
      };
      existing.inputTokens += row.inputTokens;
      existing.outputTokens += row.outputTokens;
      existing.cacheReadTokens += row.cacheReadTokens;
      existing.cacheCreationTokens += row.cacheCreationTokens;
      existing.reasoningTokens += row.reasoningTokens;
      existing.totalTokens +=
        row.inputTokens +
        row.outputTokens +
        row.cacheReadTokens +
        row.cacheCreationTokens;
      existing.requestCount += 1;
      buckets.set(key, existing);
    }

    return Array.from(buckets.values()).sort((a, b) => {
      if (a.bucketStart !== b.bucketStart) return a.bucketStart - b.bucketStart;
      if (a.agent !== b.agent) return a.agent.localeCompare(b.agent);
      if (a.model !== b.model) return a.model.localeCompare(b.model);
      const aProjectPath = a.projectPath ?? UNKNOWN_PROJECT_PATH;
      const bProjectPath = b.projectPath ?? UNKNOWN_PROJECT_PATH;
      const aUnknown = aProjectPath === UNKNOWN_PROJECT_PATH;
      const bUnknown = bProjectPath === UNKNOWN_PROJECT_PATH;
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      const aProjectName = a.projectName ?? UNKNOWN_PROJECT_NAME;
      const bProjectName = b.projectName ?? UNKNOWN_PROJECT_NAME;
      if (aProjectName !== bProjectName) return aProjectName.localeCompare(bProjectName);
      return aProjectPath.localeCompare(bProjectPath);
    });
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
    repairTokenUsageProjectAttribution,
    writeUsageSessionSummary,
    getTokenUsageDailyStats,
    getTokenUsageByProject,
    getTokenUsageByModel,
    getTokenUsageByAgent,
    getTopTokenUsageSessions,
    getSessionTokenUsage,
    getTokenUsageTrend,
    getSessionStats,
    getUsageImportStatus,
    setUsageImportStatus,
    getModelPricing,
    upsertModelPricing,
  };
}
