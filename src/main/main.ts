import { BrowserWindow, Tray, app, clipboard, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AppSettingsPatch } from "../shared/appSettings";
import { createActionResponseTransport } from "./actionResponse/createActionResponseTransport";
import { dispatchActionResponse } from "./actionResponse/dispatchActionResponse";
import type { ActionResponseResult } from "./actionResponse/dispatchActionResponse";
import {
  createClaudeDesktopGatewayServer,
  runProviderHealthCheck,
} from "./gateway/claudeDesktopGateway";
import { createGatewaySecretStore } from "./gateway/gatewaySecrets";
import type { GatewaySecretStore } from "./gateway/gatewaySecrets";
import {
  configureProviderGatewayClient,
  inspectProviderGatewayClientSetup,
} from "./gateway/providerGatewayClientSetup";
import { buildProviderGatewayStatus } from "./gateway/providerGatewayStatus";
import type { ProviderGatewayListenerInput } from "./gateway/providerGatewayStatus";
import { normalizeAppPath } from "./hook/commandBuilder";
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
import { isSessionJumpTarget } from "../shared/sessionTypes";
import type { AppUpdateState } from "../shared/updateTypes";
import type { UsageOverview, UsageSnapshot } from "../shared/usageTypes";
import {
  PROVIDER_GATEWAY_CLIENT_SETUP_TARGETS,
  type ProviderGatewayClientSetupTarget,
  type ProviderGatewayHealthCheckSummary,
} from "../shared/providerGatewayTypes";
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
import { createNotificationService } from "./notification/notificationService";
import type { NotificationService } from "./notification/notificationService";
import { createSessionJumpService } from "./jump/sessionJumpService";
import { createTerminalTextSender } from "./terminal/terminalTextSender";

let notificationServiceRef: NotificationService | null = null;
const sessionJumpService = createSessionJumpService();
const terminalTextSender = createTerminalTextSender();
const sessionStore = createSessionStore({
  onStatusChange: (change) => {
    notificationServiceRef?.onSessionStateChange(change);
  },
  onPendingActionCreated: (params) => {
    notificationServiceRef?.onPendingActionCreated(params);
  },
});
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
let providerGatewayServer: ReturnType<typeof createClaudeDesktopGatewayServer> | null = null;
let providerGatewayListener: ProviderGatewayListenerInput = {
  state: "unavailable",
  host: "127.0.0.1",
  port: 15721,
  message: "Provider gateway not started",
};
let providerGatewayHealthCheck: ProviderGatewayHealthCheckSummary | null = null;
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

function providerGatewayStatusForRenderer(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
) {
  const settings = settingsService.getSettings();
  const provider = settings.providerGateway.providers[settings.providerGateway.activeProvider];
  const baseStatus = buildProviderGatewayStatus({
    settings,
    tokenConfigured: provider ? gatewaySecretStore.hasToken(provider) : false,
    listener: providerGatewayListener,
    lastHealthCheck: providerGatewayHealthCheck,
  });
  const claudeDesktopSetup = inspectProviderGatewayClientSetup({
    target: "claude-desktop",
    status: baseStatus,
    homeDir,
  });
  const codexDesktopSetup = inspectProviderGatewayClientSetup({
    target: "codex-desktop",
    status: baseStatus,
    homeDir,
  });
  return buildProviderGatewayStatus({
    settings,
    tokenConfigured: provider ? gatewaySecretStore.hasToken(provider) : false,
    listener: providerGatewayListener,
    lastHealthCheck: providerGatewayHealthCheck,
    claudeDesktopSetup,
    codexDesktopSetup,
  });
}

function wireActionResponseIpc(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
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
  ipcMain.handle("codepal:get-provider-gateway-status", () => {
    return providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
  });
  ipcMain.handle("codepal:update-provider-gateway-token", (_event, payload: unknown) => {
    const providerId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).providerId === "string"
        ? (payload as Record<string, unknown>).providerId
        : "";
    const token =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).token === "string"
        ? (payload as Record<string, unknown>).token
        : "";
    const settings = settingsService.getSettings();
    const provider = settings.providerGateway.providers[providerId];
    if (!provider) {
      throw new Error("provider not configured");
    }
    gatewaySecretStore.updateToken(provider, token);
    return {
      ok: true,
      status: providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir),
    };
  });
  ipcMain.handle("codepal:run-provider-gateway-health-check", async () => {
    const settings = settingsService.getSettings();
    const result = await runProviderHealthCheck({
      settings,
      secrets: gatewaySecretStore,
    });
    providerGatewayHealthCheck = {
      checkedAt: Date.now(),
      ok: result.ok,
      models: result.models.map((model) => ({
        claudeModel: model.claudeModel,
        upstreamModel: model.upstreamModel,
        health: model.ok ? "ok" : "error",
        status: model.status,
        error: model.error,
      })),
    };
    return providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
  });
  ipcMain.handle("codepal:configure-provider-gateway-client", (_event, payload: unknown) => {
    const target =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).target === "string"
        ? (payload as Record<string, unknown>).target
        : "";
    if (!PROVIDER_GATEWAY_CLIENT_SETUP_TARGETS.includes(
      target as (typeof PROVIDER_GATEWAY_CLIENT_SETUP_TARGETS)[number],
    )) {
      throw new Error("unsupported provider gateway client target");
    }
    const setupTarget = target as ProviderGatewayClientSetupTarget;
    const status = providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
    return configureProviderGatewayClient({
      target: setupTarget,
      status,
      homeDir,
    });
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
  ipcMain.handle("codepal:jump-to-session-target", async (_event, payload: unknown) => {
    const target =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).target
        : undefined;
    if (!isSessionJumpTarget(target)) {
      return { ok: false as const, error: "jump target is required" };
    }
    return sessionJumpService.jumpTo(target);
  });
  ipcMain.on("codepal:action-response", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const p = payload as Record<string, unknown>;
    const sessionId = typeof p.sessionId === "string" ? p.sessionId : "";
    const actionId = typeof p.actionId === "string" ? p.actionId : "";
    const option = typeof p.option === "string" ? p.option : "";
    if (!sessionId || !actionId || !option) return;

    const emitResult = (result: ActionResponseResult) => {
      const win = mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send("codepal:action-response-result", result);
      }
    };

    void dispatchActionResponse(
      sessionStore,
      actionResponseTransport,
      broadcastSessions,
      sessionId,
      actionId,
      option,
      emitResult,
    ).catch((err) => {
      console.error("[CodePal] action_response transport error:", err);
    });
  });
  ipcMain.on("codepal:send-message", (_event, payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as Record<string, unknown>).sessionId !== "string" ||
      typeof (payload as Record<string, unknown>).text !== "string"
    ) {
      return;
    }
    const { sessionId, text } = payload as { sessionId: string; text: string };
    if (!sessionId || !text) return;

    const emit = (result: "success" | "error", error?: string) => {
      const win = mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send("codepal:send-message-result", { sessionId, result, error });
      }
    };

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      emit("error", "session_not_found");
      return;
    }

    terminalTextSender
      .send(session, text)
      .then((result) => {
        if (result.ok) {
          emit("success");
        } else {
          emit("error", result.error);
        }
      })
      .catch((err) => {
        console.error("[CodePal] send-message error:", err);
        emit("error", err instanceof Error ? err.message : String(err));
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
  const hub = createIpcHub({
    onMessage: (line) => {
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
    },
  });
  const { server } = hub;

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

function resolveProviderGatewayPort(
  settingsService: ReturnType<typeof createSettingsService>,
): number {
  const raw =
    process.env.CODEPAL_GATEWAY_PORT?.trim() ||
    process.env.PORT?.trim() ||
    String(settingsService.getSettings().providerGateway.port);
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.warn("[CodePal Gateway] invalid port; falling back to settings port:", raw);
    return settingsService.getSettings().providerGateway.port;
  }
  return port;
}

async function startClaudeDesktopProviderGateway(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
): Promise<void> {
  const settings = settingsService.getSettings().providerGateway;
  if (!settings.enabled) {
    providerGatewayListener = {
      state: "disabled",
      host: settings.host,
      port: settings.port,
    };
    console.log("[CodePal Gateway] disabled");
    return;
  }
  const host = settings.host;
  const port = resolveProviderGatewayPort(settingsService);
  const server = createClaudeDesktopGatewayServer({
    getSettings: () => settingsService.getSettings(),
    secrets: gatewaySecretStore,
  });
  const result = await startTcpListener(server, host, port);
  if (result.status === "listening") {
    providerGatewayListener = {
      state: "listening",
      host,
      port,
    };
    providerGatewayServer = server;
    console.log(`[CodePal Gateway] listening on http://${host}:${port}`);
    return;
  }
  if (result.status === "already_running") {
    providerGatewayListener = {
      state: "unavailable",
      host,
      port,
      message: result.diagnostics.message ?? "Provider gateway port is already in use",
    };
    console.warn("[CodePal Gateway]", result.diagnostics.message);
    return;
  }
  providerGatewayListener = {
    state: "unavailable",
    host,
    port,
    message: result.diagnostics.message ?? result.error.message,
  };
  console.error("[CodePal Gateway] server error:", result.error.message);
}

void runHookCli(process.argv, process.stdin, process.stdout, process.stderr, process.env)
  .then((hookExitCode) => {
    if (hookExitCode !== HOOK_CLI_NOT_HOOK_MODE) {
      process.exit(hookExitCode);
      return;
    }

    // Hold the single-instance lock so the auto-updater's quit-and-relaunch
    // (and double-clicks on the dock icon) can't spawn a second GUI process.
    // Without this guard the second instance would race the first all the way
    // to wireIpcHub, hit the "already_running" branch, flash a "已有 CodePal
    // 在运行" dialog, then quit — visible as a phantom GUI process popping up.
    if (!app.requestSingleInstanceLock()) {
      app.quit();
      return;
    }

    app.on("second-instance", () => {
      if (!mainWindow) {
        return;
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    });

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
      providerGatewayServer?.close();
      providerGatewayServer = null;
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
      const gatewaySecretStore = createGatewaySecretStore({
        filePath: path.join(app.getPath("userData"), "provider-gateway-secrets.json"),
        env: process.env,
      });
      installMainProcessFileLogger(path.join(app.getPath("userData"), "logs"));
      await startClaudeDesktopProviderGateway(settingsService, gatewaySecretStore);
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
      if (appSettings.history.persistenceEnabled && historyStore) {
        const RESTORE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
        const MAX_RESTORE_COUNT = 150;
        try {
          const recentSessions = historyStore.getRecentSessions({
            maxAgeMs: RESTORE_MAX_AGE_MS,
            limit: MAX_RESTORE_COUNT,
          });
          for (const record of recentSessions) {
            sessionStore.seedFromHistory(record);
          }
          if (recentSessions.length > 0) {
            console.log(
              `[CodePal] Restored ${recentSessions.length} session(s) from history`,
            );
          }
        } catch (error) {
          console.error("[CodePal] Failed to restore sessions from history:", error);
        }
      }
      const usageSnapshotCache = createUsageSnapshotCache({
        filePath: path.join(app.getPath("userData"), "usage-snapshot-cache.json"),
      });
      const resolvedAppPath = normalizeAppPath(app.getAppPath()) ?? app.getAppPath();
      const integrationService = createIntegrationService({
        homeDir,
        hookScriptsRoot: resolveHookScriptsRoot(),
        packaged: app.isPackaged,
        execPath: process.execPath,
        appPath: resolvedAppPath,
      });
      ensureAgentWrapperFiles(homeDir, {
        packaged: app.isPackaged,
        execPath: process.execPath,
        appPath: resolvedAppPath,
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
        onBeforeInstall: () => {
          historyWriter?.close();
        },
      });
      const notificationService = createNotificationService({
        getNotificationSettings: () => settingsService.getSettings().notifications,
        getMainWindow: () => mainWindow,
      });
      notificationServiceRef = notificationService;

      wireActionResponseIpc(
      settingsService,
      gatewaySecretStore,
      homeDir,
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
