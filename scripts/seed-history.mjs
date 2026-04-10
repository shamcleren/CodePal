#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_SESSION_ID = "mock-done-history-session";
const DEFAULT_TITLE = "Mock done history session";
const DEFAULT_COUNT = 320;
const DEFAULT_TOOL = "cursor";
const DEFAULT_STATUS = "completed";
const DEFAULT_IPC_HOST = process.env.CODEPAL_IPC_HOST || "127.0.0.1";
const DEFAULT_IPC_PORT = Number(process.env.CODEPAL_IPC_PORT || "17371");

function parseArgs(argv) {
  const options = {
    sessionId: DEFAULT_SESSION_ID,
    title: DEFAULT_TITLE,
    count: DEFAULT_COUNT,
    tool: DEFAULT_TOOL,
    status: DEFAULT_STATUS,
    pushLive: true,
    ipcHost: DEFAULT_IPC_HOST,
    ipcPort: DEFAULT_IPC_PORT,
    dbPaths: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === "--session-id" && nextValue) {
      options.sessionId = nextValue.trim();
      index += 1;
      continue;
    }
    if (arg === "--title" && nextValue) {
      options.title = nextValue.trim();
      index += 1;
      continue;
    }
    if (arg === "--count" && nextValue) {
      options.count = Math.max(1, Number.parseInt(nextValue, 10) || DEFAULT_COUNT);
      index += 1;
      continue;
    }
    if (arg === "--tool" && nextValue) {
      options.tool = nextValue.trim() || DEFAULT_TOOL;
      index += 1;
      continue;
    }
    if (arg === "--status" && nextValue) {
      options.status = nextValue.trim() || DEFAULT_STATUS;
      index += 1;
      continue;
    }
    if (arg === "--ipc-host" && nextValue) {
      options.ipcHost = nextValue.trim() || DEFAULT_IPC_HOST;
      index += 1;
      continue;
    }
    if (arg === "--ipc-port" && nextValue) {
      options.ipcPort = Number.parseInt(nextValue, 10) || DEFAULT_IPC_PORT;
      index += 1;
      continue;
    }
    if (arg === "--db-path" && nextValue) {
      options.dbPaths.push(path.resolve(nextValue));
      index += 1;
      continue;
    }
    if (arg === "--no-push-live") {
      options.pushLive = false;
      continue;
    }
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.sessionId) {
    throw new Error("sessionId is required");
  }
  if (!Number.isFinite(options.ipcPort) || options.ipcPort <= 0 || options.ipcPort > 65535) {
    throw new Error(`Invalid ipc port: ${options.ipcPort}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/seed-history.mjs [options]

Options:
  --session-id <id>     Session id to seed
  --title <title>       Session title shown in the UI
  --count <n>           Number of persisted history items to generate
  --tool <tool>         Tool name, default: cursor
  --status <status>     Session status, default: completed
  --db-path <path>      Explicit history.sqlite path (repeatable)
  --ipc-host <host>     TCP host for live push, default: ${DEFAULT_IPC_HOST}
  --ipc-port <port>     TCP port for live push, default: ${DEFAULT_IPC_PORT}
  --no-push-live        Only seed SQLite, do not inject a live session event
  --help                Show this help
`);
}

function resolveDefaultDbPaths() {
  const appSupportDir = path.join(os.homedir(), "Library", "Application Support");
  const candidates = [
    path.join(appSupportDir, "codepal", "history.sqlite"),
    path.join(appSupportDir, "CodePal", "history.sqlite"),
    path.join(appSupportDir, "Electron", "history.sqlite"),
  ];

  const existing = candidates.filter((candidate) => fs.existsSync(candidate));
  const chosen = existing.length > 0 ? existing : [candidates[0]];
  return Array.from(new Set(chosen));
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
  `);
}

function buildActivityItem(index, timestamp) {
  const cycle = index % 4;
  if (cycle === 0) {
    return {
      id: `seed-user-${index}`,
      kind: "message",
      source: "user",
      title: "User",
      body: `历史验证问题 ${index}: 请继续检查更早的 session 记录。`,
      tone: null,
      toolName: null,
      toolPhase: null,
      metaJson: null,
    };
  }
  if (cycle === 1) {
    return {
      id: `seed-assistant-${index}`,
      kind: "message",
      source: "assistant",
      title: "Assistant",
      body: `持久化历史消息 ${index}: 这是脚本生成的 mock 内容，用于滚动验证。`,
      tone: null,
      toolName: null,
      toolPhase: null,
      metaJson: null,
    };
  }
  if (cycle === 2) {
    return {
      id: `seed-tool-call-${index}`,
      kind: "tool",
      source: "tool",
      title: "ReadFile",
      body: `ReadFile src/mock/file-${index}.ts`,
      tone: "running",
      toolName: "ReadFile",
      toolPhase: "call",
      metaJson: JSON.stringify({ path: `src/mock/file-${index}.ts` }),
    };
  }
  return {
    id: `seed-tool-result-${index}`,
    kind: "tool",
    source: "tool",
    title: "ReadFile",
    body: `ReadFile result ${index}: ok`,
    tone: "completed",
    toolName: "ReadFile",
    toolPhase: "result",
    metaJson: JSON.stringify({ bytes: 256 + index }),
  };
}

function seedHistoryDb(dbPath, options) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  ensureSchema(db);

  const startedAt = Date.now() - 4 * 60 * 60 * 1000;
  const latestTimestamp = startedAt + (options.count - 1) * 45 * 1000;

  db.prepare("DELETE FROM session_activity_items WHERE session_id = ?").run(options.sessionId);
  db.prepare("DELETE FROM session_event_debug WHERE session_id = ?").run(options.sessionId);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(options.sessionId);

  db.prepare(`
    INSERT INTO sessions (
      id, tool, status, title, latest_task, updated_at, last_user_message_at, has_pending_actions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    options.sessionId,
    options.tool,
    options.status,
    options.title,
    options.title,
    latestTimestamp,
    startedAt,
  );

  const insertActivity = db.prepare(`
    INSERT INTO session_activity_items (
      item_id, session_id, timestamp, kind, source, title, body, tone, tool_name, tool_phase, meta_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDebug = db.prepare(`
    INSERT INTO session_event_debug (
      session_id, timestamp, tool, status, event_type, raw_subset_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (let index = 0; index < options.count; index += 1) {
      const timestamp = startedAt + index * 45 * 1000;
      const item = buildActivityItem(index, timestamp);
      insertActivity.run(
        item.id,
        options.sessionId,
        timestamp,
        item.kind,
        item.source,
        item.title,
        item.body,
        item.tone,
        item.toolName,
        item.toolPhase,
        item.metaJson,
      );
      insertDebug.run(
        options.sessionId,
        timestamp,
        options.tool,
        options.status,
        "seed-history",
        JSON.stringify({ seeded: true, index, timestamp }),
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM session_activity_items WHERE session_id = ?")
    .get(options.sessionId);
  db.close();

  return {
    dbPath,
    count: row.count,
    latestTimestamp,
  };
}

function pushLiveSession(options, latestTimestamp) {
  const payload = {
    type: "status_change",
    sessionId: options.sessionId,
    tool: options.tool,
    status: options.status,
    task: options.title,
    title: options.title,
    timestamp: latestTimestamp,
    activityItems: [
      {
        id: `${options.sessionId}:live`,
        kind: "message",
        source: "assistant",
        title: "Assistant",
        body: `Live seeded session: ${options.title}`,
        timestamp: latestTimestamp,
      },
    ],
  };

  return new Promise((resolve, reject) => {
    const socket = net.connect(
      {
        host: options.ipcHost,
        port: options.ipcPort,
      },
      () => {
        socket.end(`${JSON.stringify(payload)}\n`);
      },
    );

    socket.once("close", () => resolve());
    socket.once("error", reject);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbPaths = options.dbPaths.length > 0 ? options.dbPaths : resolveDefaultDbPaths();
  const results = dbPaths.map((dbPath) => seedHistoryDb(dbPath, options));

  let livePush = "skipped";
  if (options.pushLive) {
    try {
      await pushLiveSession(options, results[0]?.latestTimestamp ?? Date.now());
      livePush = `ok:${options.ipcHost}:${options.ipcPort}`;
    } catch (error) {
      livePush = `failed:${error instanceof Error ? error.message : String(error)}`;
    }
  }

  console.log(
    JSON.stringify(
      {
        sessionId: options.sessionId,
        title: options.title,
        status: options.status,
        count: options.count,
        livePush,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
