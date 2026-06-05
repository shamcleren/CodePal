#!/usr/bin/env node

import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { _electron as electron } from "playwright";

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, "docs", "assets");
const remotionPublicScreensDir = path.join(
  repoRoot,
  "promo",
  "remotion-codepal",
  "public",
  "screens",
);
const walkthroughDir = path.join(outDir, "walkthrough");

const blockedTerms = [
  os.userInfo().username,
  "renjinming",
  "sk-",
  "api_key",
  "token:",
  "Authorization",
  "Bearer ",
  "tencent.sso",
  "cursor.com/api/dashboard",
];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Unable to allocate a TCP port"));
        }
      });
    });
  });
}

function waitForTcpListener(host, port) {
  const deadline = Date.now() + 8_000;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ host, port }, () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for CodePal IPC listener at ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, 50);
      });
    };
    tryConnect();
  });
}

async function sendStatusChange(payload, target) {
  const body = `${JSON.stringify(payload)}\n`;
  await new Promise((resolve, reject) => {
    const client = net.createConnection(target, () => {
      client.write(body, (writeErr) => {
        if (writeErr) {
          client.destroy();
          reject(writeErr);
          return;
        }
        client.end();
        resolve();
      });
    });
    client.once("error", reject);
  });
}

function ensureHistoryDb(dbPath) {
  fsSync.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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

    CREATE TABLE IF NOT EXISTS model_pricing (
      model_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      input_per_million TEXT NOT NULL,
      output_per_million TEXT NOT NULL,
      cache_read_per_million TEXT NOT NULL DEFAULT '0',
      cache_creation_per_million TEXT NOT NULL DEFAULT '0'
    );

    CREATE INDEX IF NOT EXISTS idx_token_usage_ts ON token_usage (timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_token_usage_agent_ts ON token_usage (agent, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_token_usage_project_ts ON token_usage (project_path, timestamp DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_source_key
      ON token_usage (agent, source_key)
      WHERE source_key IS NOT NULL;
  `);
  return db;
}

function seedAnalytics(db, now) {
  const sessions = [
    {
      id: "promo-codex-report",
      agent: "codex",
      model: "gpt-5.5",
      title: "Generate release report from local facts",
      projectPath: "/Users/demo/Projects/atlas-web",
      projectName: "atlas-web",
      input: 168_000,
      output: 42_000,
      cache: 31_000,
      ts: now - 18 * 60_000,
    },
    {
      id: "promo-claude-runtime",
      agent: "claude",
      model: "claude-sonnet-4-6-20260217",
      title: "Refactor session recovery diagnostics",
      projectPath: "/Users/demo/Projects/codepal-lab",
      projectName: "codepal-lab",
      input: 126_000,
      output: 36_000,
      cache: 18_000,
      ts: now - 70 * 60_000,
    },
    {
      id: "promo-cursor-ui",
      agent: "cursor",
      model: "gpt-5",
      title: "Polish analytics chart domain refresh",
      projectPath: "/Users/demo/Projects/atlas-web",
      projectName: "atlas-web",
      input: 82_000,
      output: 25_000,
      cache: 9_000,
      ts: now - 4 * 60 * 60_000,
    },
    {
      id: "promo-codebuddy-jetbrains",
      agent: "codebuddy",
      model: "deepseek-v4-pro",
      title: "Triage JetBrains transcript watcher",
      projectPath: "/Users/demo/Projects/ops-kit",
      projectName: "ops-kit",
      input: 64_000,
      output: 19_000,
      cache: 7_000,
      ts: now - 25 * 60 * 60_000,
    },
  ];

  const insertSession = db.prepare(`
    INSERT INTO sessions (
      id, tool, status, title, latest_task, model, model_source, updated_at,
      last_user_message_at, has_pending_actions, project_path, project_name
    ) VALUES (?, ?, ?, ?, ?, ?, 'token-usage', ?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      title = excluded.title,
      latest_task = excluded.latest_task,
      model = excluded.model,
      model_source = excluded.model_source,
      updated_at = excluded.updated_at,
      last_user_message_at = excluded.last_user_message_at,
      project_path = excluded.project_path,
      project_name = excluded.project_name
  `);
  const insertUsage = db.prepare(`
    INSERT INTO token_usage (
      session_id, agent, model, timestamp, input_tokens, output_tokens,
      cache_read_tokens, cache_creation_tokens, reasoning_tokens, source_kind,
      source_key, project_path, project_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'promo-synthetic', ?, ?, ?)
  `);

  for (const row of sessions) {
    insertSession.run(
      row.id,
      row.agent,
      row.id === "promo-codex-report" ? "completed" : "completed",
      row.title,
      row.title,
      row.model,
      row.ts,
      row.ts - 18 * 60_000,
      row.projectPath,
      row.projectName,
    );
    insertUsage.run(
      row.id,
      row.agent,
      row.model,
      row.ts,
      row.input,
      row.output,
      row.cache,
      `${row.id}-${row.ts}`,
      row.projectPath,
      row.projectName,
    );
  }

  const pricing = [
    ["gpt-5.5", "GPT-5.5", "5", "30", "0.50", "0"],
    ["gpt-5", "GPT-5", "1.25", "10", "0.125", "0"],
    ["claude-sonnet-4-6-20260217", "Claude Sonnet 4.6", "3", "15", "0.30", "3.75"],
    ["deepseek-v4-pro", "DeepSeek V4 Pro", "0.435", "0.87", "0.003625", "0"],
  ];
  const insertPricing = db.prepare(`
    INSERT INTO model_pricing (
      model_id, display_name, input_per_million, output_per_million,
      cache_read_per_million, cache_creation_per_million
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id) DO UPDATE SET
      display_name = excluded.display_name,
      input_per_million = excluded.input_per_million,
      output_per_million = excluded.output_per_million,
      cache_read_per_million = excluded.cache_read_per_million,
      cache_creation_per_million = excluded.cache_creation_per_million
  `);
  for (const row of pricing) insertPricing.run(...row);

  db.prepare(`
    INSERT INTO history_meta (key, value)
    VALUES ('usageImport.completedAt', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(now - 5_000));
  db.prepare(`
    INSERT INTO history_meta (key, value)
    VALUES ('usageImport.claudeRowsImported', '16')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run();
  db.prepare(`
    INSERT INTO history_meta (key, value)
    VALUES ('usageImport.codexRowsImported', '22')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run();
}

function liveSessionPayloads(now) {
  return [
    {
      type: "status_change",
      sessionId: "promo-live-codex",
      tool: "codex",
      status: "running",
      task: "Build a release-ready analytics refresh patch",
      title: "Build a release-ready analytics refresh patch",
      timestamp: now - 4_000,
      meta: {
        model: "gpt-5.5",
        input_tokens: 54_000,
        output_tokens: 12_400,
        cached_input_tokens: 8_200,
        context: { used: 74_000, max: 100_000 },
        projectPath: "/Users/demo/Projects/codepal-lab",
        projectName: "codepal-lab",
      },
      activityItems: [
        {
          id: "promo-live-codex-user",
          kind: "message",
          source: "user",
          title: "User",
          body: "Refresh Analytics so report facts and trend filters stay aligned.",
          timestamp: now - 36_000,
        },
        {
          id: "promo-live-codex-tool",
          kind: "tool",
          source: "tool",
          title: "npm test",
          body: "Focused Analytics tests are running against synthetic fixtures.",
          tone: "running",
          toolName: "npm test",
          toolPhase: "call",
          timestamp: now - 18_000,
        },
      ],
    },
    {
      type: "status_change",
      sessionId: "promo-live-claude",
      tool: "claude",
      status: "waiting",
      task: "Review provider gateway setup changes",
      title: "Review provider gateway setup changes",
      timestamp: now - 62_000,
      meta: {
        model: "claude-sonnet-4-6-20260217",
        input_tokens: 92_000,
        output_tokens: 18_200,
        cached_input_tokens: 14_000,
        context: { used: 88_000, max: 100_000 },
        projectPath: "/Users/demo/Projects/gateway-sandbox",
        projectName: "gateway-sandbox",
      },
      activityItems: [
        {
          id: "promo-live-claude-assistant",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "Provider health checks are ready; waiting for your confirmation before switching the desktop client.",
          timestamp: now - 70_000,
        },
      ],
    },
    {
      type: "status_change",
      sessionId: "promo-live-cursor",
      tool: "cursor",
      status: "completed",
      task: "Polish Work Review grouping copy",
      title: "Polish Work Review grouping copy",
      timestamp: now - 9 * 60_000,
      meta: {
        model: "gpt-5",
        input_tokens: 27_000,
        output_tokens: 6_500,
        cached_input_tokens: 3_100,
        context: { used: 38_000, max: 100_000 },
        projectPath: "/Users/demo/Projects/atlas-web",
        projectName: "atlas-web",
      },
      activityItems: [
        {
          id: "promo-live-cursor-result",
          kind: "tool",
          source: "tool",
          title: "git diff --check",
          body: "No whitespace errors found in the release-facing copy.",
          tone: "completed",
          toolName: "git diff",
          toolPhase: "result",
          timestamp: now - 9 * 60_000,
        },
      ],
    },
  ];
}

async function copyToRemotionPublic(filename) {
  const source = path.join(outDir, filename);
  const target = path.join(remotionPublicScreensDir, filename);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function assertNoSensitiveText(page, label) {
  const text = await page.locator("body").innerText();
  const lower = text.toLowerCase();
  const hit = blockedTerms.find((term) => term && lower.includes(term.toLowerCase()));
  if (hit) {
    throw new Error(`Sensitive term "${hit}" detected before capturing ${label}`);
  }
}

async function captureElement(page, selector, filename) {
  await assertNoSensitiveText(page, filename);
  const locator = page.locator(selector).first();
  await fs.mkdir(path.dirname(path.join(outDir, filename)), { recursive: true });
  await locator.screenshot({ path: path.join(outDir, filename) });
  await copyToRemotionPublic(filename);
}

async function main() {
  const mainJs = path.join(repoRoot, "out", "main", "main.js");
  if (!fsSync.existsSync(mainJs)) {
    throw new Error("Build output not found. Run npm run build before capturing promo assets.");
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(walkthroughDir, { recursive: true });
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-promo-home-"));
  const userDataPath = path.join(homeDir, "Library", "Application Support", "CodePal");
  const settingsPath = path.join(userDataPath, "settings.yaml");
  const dbPath = path.join(userDataPath, "history.sqlite");
  const now = Date.now();
  const providerGatewayPort = await getFreePort();
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(
    settingsPath,
    `version: 1
locale: en
display:
  showInStatusBar: true
  hiddenAgents: []
  density: detailed
  theme: graphite-ops
history:
  persistenceEnabled: true
  detailRetention: 30d
  analyticsRetention: forever
notifications:
  enabled: false
  soundEnabled: false
  completed: false
  waiting: false
  error: false
  resumed: false
reports:
  llmEnabled: false
  llmDefaultModel: ""
providerGateway:
  enabled: true
  host: 127.0.0.1
  port: ${providerGatewayPort}
  activeProvider: demo
  providers:
    demo:
      type: openai-chat-compatible
      displayName: Demo Gateway
      baseUrl: https://example.invalid/v1
      authScheme: bearer
      tokenRef: demo.gateway.credential
      envFallback: CODEPAL_PROMO_PROVIDER_CREDENTIAL
      headers: {}
      modelMappings:
        default: demo-coder
        sonnet: demo-coder
        opus: demo-reasoner
        haiku: demo-fast
`,
    "utf8",
  );
  const db = ensureHistoryDb(dbPath);
  seedAnalytics(db, now);
  db.close();

  const ipcPort = await getFreePort();
  const actionResponsePort = await getFreePort();
  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    CODEPAL_HOME_DIR: homeDir,
    CODEPAL_SETTINGS_PATH: settingsPath,
    CODEPAL_E2E_SILENT: "1",
    CODEPAL_USAGE_BACKFILL_DELAY_MS: "60000",
    CODEPAL_IPC_HOST: "127.0.0.1",
    CODEPAL_IPC_PORT: String(ipcPort),
    CODEPAL_ACTION_RESPONSE_MODE: "socket",
    CODEPAL_ACTION_RESPONSE_HOST: "127.0.0.1",
    CODEPAL_ACTION_RESPONSE_PORT: String(actionResponsePort),
    CODEPAL_PROMO_PROVIDER_CREDENTIAL: "demo-local-provider-credential",
  };
  delete env.ELECTRON_RENDERER_URL;

  const app = await electron.launch({ args: [mainJs, "--lang=en-US"], cwd: repoRoot, env });
  try {
    await waitForTcpListener("127.0.0.1", ipcPort);
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1120, height: 920 });
    await page.waitForLoadState("load");
    await page.getByRole("heading", { name: "CodePal" }).waitFor({ timeout: 15_000 });
    await page.locator(".app").evaluate((element) => {
      element.setAttribute("data-theme", "graphite-ops");
    });

    for (const payload of liveSessionPayloads(now)) {
      await sendStatusChange(payload, { host: "127.0.0.1", port: ipcPort });
    }

    await page.locator(".session-row").first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await captureElement(page, ".app-shell", "walkthrough/01-sessions.png");

    await page.locator(".session-row").nth(1).click();
    await page.waitForTimeout(700);
    await captureElement(page, ".app-shell", "walkthrough/02-expanded-session.png");
    await captureElement(page, ".app-shell", "hero-main.png");
    await captureElement(page, ".app-shell", "codepal-dashboard-preview.png");

    await page.getByRole("button", { name: /Analytics|分析/ }).click();
    await page.locator(".analytics-page").waitFor({ timeout: 15_000 });
    await page.waitForTimeout(900);
    await captureElement(page, ".app-shell", "walkthrough/03-analytics.png");
    await captureElement(page, ".app-shell", "analytics-overview.png");

    await page.getByRole("button", { name: /Work Review|工作回顾/ }).click();
    await page.locator(".work-review").waitFor({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await captureElement(page, ".app-shell", "walkthrough/04-work-review.png");
    await captureElement(page, ".app-shell", "work-review.png");

    await page.locator(".app-settings-trigger").click();
    await page.locator(".app-settings-drawer--open").waitFor({ timeout: 15_000 });
    await page.locator(".settings-nav__item").filter({ hasText: "Provider Gateway" }).click();
    await page.locator(".provider-gateway-panel").waitFor({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await captureElement(page, ".app-shell", "walkthrough/05-settings.png");
    await captureElement(page, ".app-shell", "settings-focus.png");
  } finally {
    await app.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
