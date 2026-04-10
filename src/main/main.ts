import { BrowserWindow, Tray, app, clipboard, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AppSettingsPatch } from "../shared/appSettings";
import { createActionResponseTransport } from "./actionResponse/createActionResponseTransport";
import { dispatchActionResponse } from "./actionResponse/dispatchActionResponse";
import { HOOK_CLI_NOT_HOOK_MODE, runHookCli } from "./hook/runHookCli";
import { lineToSessionEvent, lineToUsageSnapshot } from "./ingress/hookIngress";
import { createIntegrationService } from "./integrations/integrationService";
import { ensureAgentWrapperFiles } from "./integrations/agentWrappers";
import { createIpcHub } from "./ipc/ipcHub";
import { startTcpListener } from "./ipc/startTcpListener";
import { createSessionBroadcastScheduler } from "./session/createSessionBroadcastScheduler";
import { createSettingsService } from "./settings/settingsService";
import { createSessionStore } from "./session/sessionStore";
import { startSessionWatchers } from "./sessionWatchersBootstrap";
import { createTray } from "./tray/createTray";
import { createFloatingWindow } from "./window/createFloatingWindow";
import type { SessionRecord } from "../shared/sessionTypes";
import type { AppUpdateState } from "../shared/updateTypes";
import type { UsageOverview, UsageSnapshot } from "../shared/usageTypes";
import { createCursorDashboardService } from "./usage/cursorDashboardService";
import { createClaudeQuotaService } from "./usage/claudeQuotaService";
import { createCodeBuddyInternalQuotaService } from "./usage/codebuddyInternalQuotaService";
import { createCodeBuddyQuotaService } from "./usage/codebuddyQuotaService";
import { createUsageSnapshotCache } from "./usage/usageSnapshotCache";
import { createUsageStore } from "./usage/usageStore";
import { createUpdateService } from "./update/updateService";
import {
  applyHistorySettingsAtRuntime,
  createAppHistoryStore,
  createDeferredHistoryWriter,
  queueAcceptedSessionEventWrite,
  registerHistoryIpcHandlers,
} from "./history/historyRuntime";
import { installMainProcessFileLogger } from "./logging/appLogger";

const sessionStore = createSessionStore();
const usageStore = createUsageStore();
const actionResponseTransport = createActionResponseTransport(process.env);
const CLAUDE_QUOTA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CODEBUDDY_QUOTA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const requestedHomeDir = process.env.CODEPAL_HOME_DIR?.trim() || "";

if (requestedHomeDir) {
  app.setPath("home", requestedHomeDir);
  app.setPath("userData", path.join(requestedHomeDir, "Library", "Application Support", "CodePal"));
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingExpirySweepTimer: ReturnType<typeof setInterval> | null = null;
let claudeQuotaRefreshTimer: ReturnType<typeof setInterval> | null = null;
let codeBuddyQuotaRefreshTimer: ReturnType<typeof setInterval> | null = null;
let codeBuddyInternalQuotaRefreshTimer: ReturnType<typeof setInterval> | null = null;
let sessionWatchers: ReturnType<typeof startSessionWatchers> | null = null;
let historyStore: ReturnType<typeof createAppHistoryStore> | null = null;
let historyWriter: ReturnType<typeof createDeferredHistoryWriter> | null = null;
const debugCodex = process.env.CODEPAL_DEBUG_CODEX === "1";

// Hook 入口已并入应用可执行文件；这里只保留一个可推导 legacy 路径形态的根目录。
function resolveHookScriptsRoot() {
  return app.getAppPath();
}

function broadcastSessions() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const payload: SessionRecord[] = sessionStore.getSessions();
  if (debugCodex) {
    console.log(
      "[CodePal Sessions] broadcast",
      payload.length,
      payload.map((session) => `${session.tool}:${session.status}:${session.id}`),
    );
  }
  win.webContents.send("codepal:sessions", payload);
}

const sessionBroadcastScheduler = createSessionBroadcastScheduler(broadcastSessions, 50);

function broadcastUsageOverview() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const payload: UsageOverview = usageStore.getOverview();
  win.webContents.send("codepal:usage-overview", payload);
}

function broadcastUpdateState(state: AppUpdateState) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.webContents.send("codepal:update-state", state);
}

function sweepExpiredPendingActions() {
  const now = Date.now();
  const pendingChanged = sessionStore.expireStalePendingActions(now);
  const staleActiveChanged = sessionStore.demoteStaleActiveSessions(now);
  const staleSessionsChanged = sessionStore.expireStaleSessions(now);
  const changed = pendingChanged || staleActiveChanged || staleSessionsChanged;
  if (changed) {
    sessionBroadcastScheduler.request();
  }
}

function wireActionResponseIpc(
  settingsService: ReturnType<typeof createSettingsService>,
  integrationService: ReturnType<typeof createIntegrationService>,
  claudeQuotaService: ReturnType<typeof createClaudeQuotaService>,
  cursorDashboardService: ReturnType<typeof createCursorDashboardService>,
  codeBuddyQuotaService: ReturnType<typeof createCodeBuddyQuotaService>,
  codeBuddyInternalQuotaService: ReturnType<typeof createCodeBuddyInternalQuotaService>,
  updateService: ReturnType<typeof createUpdateService>,
  currentHistoryStore: ReturnType<typeof createAppHistoryStore>,
) {
  ipcMain.handle("codepal:get-sessions", () => {
    const sessions = sessionStore.getSessions();
    if (debugCodex) {
      console.log(
        "[CodePal Sessions] get-sessions",
        sessions.length,
        sessions.map((session) => `${session.tool}:${session.status}:${session.id}`),
      );
    }
    return sessions;
  });
  ipcMain.handle("codepal:clear-session-history", () => {
    sessionStore.clearHistorySessions();
    const sessions = sessionStore.getSessions();
    sessionBroadcastScheduler.request();
    return sessions;
  });
  ipcMain.handle("codepal:get-usage-overview", () => {
    return usageStore.getOverview();
  });
  ipcMain.handle("codepal:get-app-settings", () => settingsService.getSettings());
  ipcMain.handle("codepal:get-home-dir", () => app.getPath("home"));
  ipcMain.handle("codepal:reload-app-settings", () => {
    const settings = settingsService.reloadSettings();
    codeBuddyQuotaService.updateConfig(settings.codebuddy.code);
    codeBuddyInternalQuotaService.updateConfig(settings.codebuddy.enterprise);
    applyHistorySettingsAtRuntime(currentHistoryStore, settings);
    return settings;
  });
  ipcMain.handle("codepal:get-app-settings-path", () => settingsService.filePath);
  ipcMain.handle("codepal:update-app-settings", (_event, payload: unknown) => {
    const settings = settingsService.updateSettings((payload ?? {}) as AppSettingsPatch);
    codeBuddyQuotaService.updateConfig(settings.codebuddy.code);
    codeBuddyInternalQuotaService.updateConfig(settings.codebuddy.enterprise);
    applyHistorySettingsAtRuntime(currentHistoryStore, settings);
    return settings;
  });
  ipcMain.handle("codepal:get-update-state", () => updateService.getState());
  ipcMain.handle("codepal:check-for-updates", () => updateService.checkForUpdates());
  ipcMain.handle("codepal:download-update", () => updateService.downloadUpdate());
  ipcMain.handle("codepal:install-update", () => updateService.installUpdate());
  ipcMain.handle("codepal:skip-update-version", () => updateService.skipVersion());
  ipcMain.handle("codepal:clear-skipped-update-version", () => updateService.clearSkippedVersion());
  ipcMain.handle("codepal:get-integration-diagnostics", () =>
    integrationService.getDiagnostics(),
  );
  ipcMain.handle("codepal:get-claude-quota-diagnostics", () =>
    claudeQuotaService.getDiagnostics(),
  );
  ipcMain.handle("codepal:get-cursor-dashboard-diagnostics", () =>
    cursorDashboardService.getDiagnostics(),
  );
  ipcMain.handle("codepal:get-codebuddy-quota-diagnostics", () =>
    codeBuddyQuotaService.getDiagnostics(),
  );
  ipcMain.handle("codepal:get-codebuddy-internal-quota-diagnostics", () =>
    codeBuddyInternalQuotaService.getDiagnostics(),
  );
  registerHistoryIpcHandlers({
    ipcMain,
    historyStore: currentHistoryStore,
    getPersistenceEnabled: () => settingsService.getSettings().history.persistenceEnabled,
  });
  ipcMain.handle("codepal:connect-cursor-dashboard", async () => {
    const result = await cursorDashboardService.connectAndSync();
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:connect-codebuddy-quota", async () => {
    const result = await codeBuddyQuotaService.connectAndSync();
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:connect-codebuddy-internal-quota", async () => {
    const result = await codeBuddyInternalQuotaService.connectAndSync();
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:refresh-cursor-dashboard-usage", async () => {
    const result = await cursorDashboardService.refreshUsage();
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:refresh-claude-quota", async () => {
    const result = await claudeQuotaService.refreshUsage();
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:clear-cursor-dashboard-auth", async () => {
    const diagnostics = await cursorDashboardService.getDiagnostics();
    const result = await cursorDashboardService.clearAuth();
    if (diagnostics.teamId) {
      usageStore.removeSession("cursor", `cursor-dashboard:${diagnostics.teamId}`);
    }
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:refresh-codebuddy-quota", async () => {
    const result = await codeBuddyQuotaService.refreshUsage();
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:clear-codebuddy-quota-auth", async () => {
    const result = await codeBuddyQuotaService.clearAuth();
    usageStore.removeSession("codebuddy", "codebuddy-quota");
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:refresh-codebuddy-internal-quota", async () => {
    const result = await codeBuddyInternalQuotaService.refreshUsage();
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:clear-codebuddy-internal-quota-auth", async () => {
    const result = await codeBuddyInternalQuotaService.clearAuth();
    usageStore.removeSession("codebuddy", "codebuddy-internal-quota");
    broadcastUsageOverview();
    return result;
  });
  ipcMain.handle("codepal:install-integration-hooks", (_event, payload: unknown) => {
    const agentId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).agentId === "string"
        ? (payload as Record<string, unknown>).agentId
        : "";
    if (agentId !== "claude" && agentId !== "cursor" && agentId !== "codebuddy" && agentId !== "codex") {
      throw new Error("unsupported integration agent");
    }
    return integrationService.installHooks(agentId);
  });
  ipcMain.handle("codepal:open-external-target", async (_event, payload: unknown) => {
    const targetToOpen =
      payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).target === "string"
        ? (payload as Record<string, unknown>).target.trim()
        : "";
    if (!targetToOpen) {
      throw new Error("target is required");
    }
    if (/^https?:\/\//i.test(targetToOpen)) {
      await shell.openExternal(targetToOpen);
      return "";
    }
    return shell.openPath(targetToOpen);
  });
  ipcMain.handle("codepal:write-clipboard-text", (_event, payload: unknown) => {
    const text =
      payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).text === "string"
        ? (payload as Record<string, unknown>).text
        : "";
    clipboard.writeText(text);
  });
  ipcMain.on("codepal:action-response", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const p = payload as Record<string, unknown>;
    const sessionId = typeof p.sessionId === "string" ? p.sessionId : "";
    const actionId = typeof p.actionId === "string" ? p.actionId : "";
    const option = typeof p.option === "string" ? p.option : "";
    if (!sessionId || !actionId || !option) return;

    void dispatchActionResponse(
      sessionStore,
      actionResponseTransport,
      broadcastSessions,
      sessionId,
      actionId,
      option,
    ).catch((err) => {
      console.error("[CodePal] action_response transport error:", err);
    });
  });
}

function getOrCreateMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  const win = createFloatingWindow();
  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
  win.once("ready-to-show", () => win.show());
  return win;
}

async function wireIpcHub(
  integrationService: ReturnType<typeof createIntegrationService>,
  settingsService: ReturnType<typeof createSettingsService>,
  currentHistoryStore: ReturnType<typeof createAppHistoryStore>,
  usageSnapshotCache?: ReturnType<typeof createUsageSnapshotCache>,
): Promise<"listening" | "already_running" | "error"> {
  const { server } = createIpcHub((line) => {
    const usageSnapshot = lineToUsageSnapshot(line);
    if (usageSnapshot) {
      usageStore.applySnapshot(usageSnapshot);
      if (
        usageSnapshot.agent === "claude" &&
        usageSnapshot.source === "statusline-derived" &&
        usageSnapshot.rateLimit
      ) {
        usageSnapshotCache?.saveClaudeRateLimitSnapshot(usageSnapshot);
      }
      broadcastUsageOverview();
    }
    const event = lineToSessionEvent(line);
    if (event) {
      sessionStore.applyEvent(event);
      integrationService.recordEvent(event.tool, event.status, event.timestamp);
      sessionBroadcastScheduler.request();
      const session = sessionStore.getSession(event.sessionId) ?? undefined;
      if (!historyWriter) {
        return;
      }
      queueAcceptedSessionEventWrite({
        historyWriter,
        event,
        session,
        persistenceEnabled: settingsService.getSettings().history.persistenceEnabled,
      });
    }
  });

  const socketPath = process.env.CODEPAL_SOCKET_PATH?.trim();

  if (socketPath) {
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error(
          "[CodePal IPC] could not remove existing socket file:",
          socketPath,
          (err as Error).message,
          code ?? "",
        );
      }
    }

    const result = await new Promise<"listening" | "error">((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off("error", onError);
        integrationService.setListenerDiagnostics({
          mode: "unavailable",
          message: `CodePal 接收入口启动失败：${err.message}`,
        });
        console.error("[CodePal IPC] server error:", err.message, err.code ?? "");
        resolve("error");
      };

      server.once("error", onError);
      server.listen(socketPath, () => {
        server.off("error", onError);
        integrationService.setListenerDiagnostics({
          mode: "socket",
          socketPath,
        });
        console.log(`[CodePal IPC] listening on unix socket ${socketPath}`);
        resolve("listening");
      });
    });
    return result;
  }

  const rawPort = process.env.CODEPAL_IPC_PORT;
  const port = rawPort ? Number(rawPort) : 17371;
  const host = "127.0.0.1";

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    integrationService.setListenerDiagnostics({
      mode: "unavailable",
      message: "CODEPAL_IPC_PORT 无效",
    });
    console.error(
      "[CodePal IPC] invalid CODEPAL_IPC_PORT; expected 1–65535, got:",
      rawPort,
    );
    return "error";
  }

  const result = await startTcpListener(server, host, port);
  integrationService.setListenerDiagnostics(result.diagnostics);
  if (result.status === "listening") {
    const addr = server.address();
    if (addr && typeof addr !== "string") {
      console.log(`[CodePal IPC] listening on ${host}:${addr.port}`);
    }
    return "listening";
  }
  if (result.status === "already_running") {
    console.warn("[CodePal IPC]", result.diagnostics.message);
    return "already_running";
  }
  console.error("[CodePal IPC] server error:", result.error.message);
  return "error";
}

void runHookCli(process.argv, process.stdin, process.stdout, process.stderr, process.env)
  .then((hookExitCode) => {
    if (hookExitCode !== HOOK_CLI_NOT_HOOK_MODE) {
      process.exit(hookExitCode);
      return;
    }

    app.on("before-quit", () => {
      if (pendingExpirySweepTimer !== null) {
        clearInterval(pendingExpirySweepTimer);
        pendingExpirySweepTimer = null;
      }
      if (codeBuddyQuotaRefreshTimer !== null) {
        clearInterval(codeBuddyQuotaRefreshTimer);
        codeBuddyQuotaRefreshTimer = null;
      }
      if (claudeQuotaRefreshTimer !== null) {
        clearInterval(claudeQuotaRefreshTimer);
        claudeQuotaRefreshTimer = null;
      }
      if (codeBuddyInternalQuotaRefreshTimer !== null) {
        clearInterval(codeBuddyInternalQuotaRefreshTimer);
        codeBuddyInternalQuotaRefreshTimer = null;
      }
      sessionBroadcastScheduler.cancel();
      sessionWatchers?.stop();
      sessionWatchers = null;
      historyWriter?.close();
      historyWriter = null;
      historyStore?.close();
      historyStore = null;
      if (tray && !tray.isDestroyed()) {
        tray.destroy();
      }
      tray = null;
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.whenReady().then(async () => {
      const homeDir = process.env.CODEPAL_HOME_DIR?.trim() || app.getPath("home");
      const templateSettingsPath = app.isPackaged
        ? path.join(app.getAppPath(), "config", "settings.template.yaml")
        : path.join(app.getAppPath(), "config", "settings.template.yaml");
      const writableSettingsPath = app.isPackaged
        ? path.join(app.getPath("userData"), "settings.yaml")
        : path.join(app.getAppPath(), "config", "settings-dev.yaml");
      const settingsService = createSettingsService({
        writablePath: writableSettingsPath,
        templatePath: templateSettingsPath,
      });
      const appSettings = settingsService.getSettings();
      installMainProcessFileLogger(path.join(app.getPath("userData"), "logs"));
      historyStore = createAppHistoryStore({
        userDataPath: app.getPath("userData"),
      });
      historyWriter = createDeferredHistoryWriter({
        historyStore,
        onError: (error) => {
          console.error("[CodePal History] failed to persist session event:", error);
        },
      });
      applyHistorySettingsAtRuntime(historyStore, appSettings);
      const usageSnapshotCache = createUsageSnapshotCache({
        filePath: path.join(app.getPath("userData"), "usage-snapshot-cache.json"),
      });
      const integrationService = createIntegrationService({
        homeDir,
        hookScriptsRoot: resolveHookScriptsRoot(),
        packaged: app.isPackaged,
        execPath: process.execPath,
        appPath: app.getAppPath(),
      });
      ensureAgentWrapperFiles(homeDir, {
        packaged: app.isPackaged,
        execPath: process.execPath,
        appPath: app.getAppPath(),
      });
      const cursorDashboardService = createCursorDashboardService({
        onUsageSnapshot: (snapshot: UsageSnapshot) => {
          usageStore.applySnapshot(snapshot);
        },
      });
      const claudeQuotaService = createClaudeQuotaService({
        getCachedSnapshot: () => usageSnapshotCache.loadClaudeRateLimitSnapshot(),
      });
      const codeBuddyQuotaService = createCodeBuddyQuotaService({
        config: appSettings.codebuddy.code,
        onUsageSnapshot: (snapshot: UsageSnapshot) => {
          usageStore.applySnapshot(snapshot);
          broadcastUsageOverview();
        },
      });
      const codeBuddyInternalQuotaService = createCodeBuddyInternalQuotaService({
        config: appSettings.codebuddy.enterprise,
        onUsageSnapshot: (snapshot: UsageSnapshot) => {
          usageStore.applySnapshot(snapshot);
          broadcastUsageOverview();
        },
      });
      const updateService = createUpdateService({
        isPackaged: app.isPackaged,
        currentVersion: app.getVersion(),
        stateFilePath: path.join(app.getPath("userData"), "update-state.json"),
        onStateChange: broadcastUpdateState,
      });

      wireActionResponseIpc(
        settingsService,
        integrationService,
        claudeQuotaService,
        cursorDashboardService,
        codeBuddyQuotaService,
        codeBuddyInternalQuotaService,
        updateService,
        historyStore,
      );
      const ipcResult = await wireIpcHub(
        integrationService,
        settingsService,
        historyStore,
        usageSnapshotCache,
      );
      if (ipcResult === "already_running") {
        await dialog.showMessageBox({
          type: "info",
          buttons: ["知道了"],
          defaultId: 0,
          title: "CodePal",
          message: "已有 CodePal 在运行",
          detail: "当前实例未启动，避免多个 CodePal 同时占用同一个接收入口。",
        });
        app.quit();
        return;
      }
      if (ipcResult !== "listening") {
        app.quit();
        return;
      }
      sessionWatchers = startSessionWatchers({
        homeDir,
        env: process.env,
        platform: process.platform,
        sessionStore,
        usageStore,
        integrationService,
        broadcastSessions: sessionBroadcastScheduler.request,
        broadcastUsageOverview,
        onSessionEventAccepted: (event) => {
          const session = sessionStore.getSession(event.sessionId) ?? undefined;
          if (!historyWriter) {
            return;
          }
          queueAcceptedSessionEventWrite({
            historyWriter,
            event,
            session,
            persistenceEnabled: settingsService.getSettings().history.persistenceEnabled,
          });
        },
      });
      const cachedClaudeRateLimitSnapshot = usageSnapshotCache.loadClaudeRateLimitSnapshot();
      if (cachedClaudeRateLimitSnapshot) {
        usageStore.applySnapshot(cachedClaudeRateLimitSnapshot);
      }
      broadcastUsageOverview();
      void claudeQuotaService.refreshUsage().then((result) => {
        if (result.synced) {
          broadcastUsageOverview();
        }
      });
      void cursorDashboardService.refreshUsage().then((result) => {
        if (result.synced) {
          broadcastUsageOverview();
        }
      });
      void codeBuddyQuotaService.refreshUsage().then((result) => {
        if (result.synced) {
          broadcastUsageOverview();
        }
      });
      void codeBuddyInternalQuotaService.refreshUsage().then((result) => {
        if (result.synced) {
          broadcastUsageOverview();
        }
      });
      claudeQuotaRefreshTimer = setInterval(() => {
        void claudeQuotaService.refreshUsage().then((result) => {
          if (result.synced) {
            broadcastUsageOverview();
          }
        });
      }, CLAUDE_QUOTA_REFRESH_INTERVAL_MS);
      codeBuddyQuotaRefreshTimer = setInterval(() => {
        void codeBuddyQuotaService.refreshUsage().then((result) => {
          if (result.synced) {
            broadcastUsageOverview();
          }
        });
      }, CODEBUDDY_QUOTA_REFRESH_INTERVAL_MS);
      codeBuddyInternalQuotaRefreshTimer = setInterval(() => {
        void codeBuddyInternalQuotaService.refreshUsage().then((result) => {
          if (result.synced) {
            broadcastUsageOverview();
          }
        });
      }, CODEBUDDY_QUOTA_REFRESH_INTERVAL_MS);
      const win = getOrCreateMainWindow();
      win.webContents.once("dom-ready", () => {
        sessionBroadcastScheduler.flushNow();
        broadcastUsageOverview();
        broadcastUpdateState(updateService.getState());
      });
      updateService.initialize();
      tray = createTray({
        onOpenMain: () => {
          const next = getOrCreateMainWindow();
          if (!next.isVisible()) {
            next.show();
          }
          next.focus();
        },
        onOpenSettings: () => {
          const next = getOrCreateMainWindow();
          if (!next.isVisible()) {
            next.show();
          }
          next.focus();
          next.webContents.send("codepal:open-settings");
        },
      });

      pendingExpirySweepTimer = setInterval(sweepExpiredPendingActions, 1_000);

      app.on("activate", () => {
        const activeWindow = getOrCreateMainWindow();
        if (!activeWindow.isVisible()) {
          activeWindow.show();
        }
      });
    });
  })
  .catch((err) => {
    console.error("[CodePal] hook CLI bootstrap error:", err);
    process.exit(1);
  });
