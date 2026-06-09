import { BrowserWindow, Tray, app, clipboard, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultProviderGatewaySettings, type AppSettings, type AppSettingsPatch, type ProviderGatewayConfig } from "../shared/appSettings";
import { createActionResponseTransport } from "./actionResponse/createActionResponseTransport";
import { generateHtmlReport } from "./report/generateHtmlReport";
import { buildReportFacts } from "../shared/reportFacts";
import { deriveAnalyticsWorkHealth } from "../shared/analyticsWorkHealth";
import { deriveWorkItems } from "../shared/workItems";
import { resolveLlmReportGatewayForReport } from "./report/llmReportGateway";
import { generateLlmReport } from "./report/llmReportGenerator";
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
import { resolveTemplateSettingsPath, resolveWritableSettingsPath } from "./settings/settingsPath";
import { createSessionStore } from "./session/sessionStore";
import { startSessionWatchers } from "./sessionWatchersBootstrap";
import { createTray } from "./tray/createTray";
import { createFloatingWindow } from "./window/createFloatingWindow";
import { shouldApplyHistorySettingsAtRuntime } from "./settings/settingsChange";
import type { SessionRecord } from "../shared/sessionTypes";
import {
  SESSION_PENDING_ACTION_RESPONSE_ENABLED,
  isSessionJumpTarget,
} from "../shared/sessionTypes";
import type { AppUpdateState } from "../shared/updateTypes";
import type { UsageOverview } from "../shared/usageTypes";
import type { TokenTrendGranularity } from "../shared/analyticsTypes";
import type { AppLocale, ResolvedLocale } from "../shared/i18nTypes";
import {
  PROVIDER_GATEWAY_CLIENT_SETUP_TARGETS,
  type ProviderGatewayClientSetupTarget,
  type ProviderGatewayHealthCheckSummary,
} from "../shared/providerGatewayTypes";
import { createUsageSnapshotCache, hydrateUsageStoreFromCache } from "./usage/usageSnapshotCache";
import { tokenUsageWriteFromUsageSnapshot } from "./usage/usageSnapshotTokenUsage";
import { createCodeBuddyQuotaRuntime } from "./usage/codebuddyQuotaRuntime";
import { createUsageStore } from "./usage/usageStore";
import { createUpdateService } from "./update/updateService";
import {
  applyHistorySettingsAtRuntime,
  createAppHistoryStore,
  createDeferredHistoryWriter,
  queueAcceptedSessionEventWrite,
  registerHistoryIpcHandlers,
} from "./history/historyRuntime";
import { runUsageBackfillAsync } from "./history/usageBackfill";
import { installMainProcessFileLogger } from "./logging/appLogger";
import { createNotificationService } from "./notification/notificationService";
import type { NotificationService } from "./notification/notificationService";
import { syncModelPricingFromRemote } from "./pricing/modelPricingSync";
import { createSessionJumpService } from "./jump/sessionJumpService";
import { createTerminalTextSender } from "./terminal/terminalTextSender";
import { createActionBroker } from "./session/actionBroker";
import { resolveSessionCapabilities } from "../shared/capabilityResolver";
import {
  applyAccessoryActivationPolicy,
  shouldUseAccessoryActivationPolicy,
} from "./window/nonInteractiveWindowPolicy";

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
const actionBroker = createActionBroker({
  sessionStore,
  jumpService: sessionJumpService,
  terminalTextSender,
  openPath: (target: string) => shell.openPath(target),
});
const usageStore = createUsageStore();
const actionResponseTransport = createActionResponseTransport(process.env);
const requestedHomeDir = process.env.CODEPAL_HOME_DIR?.trim() || "";

if (requestedHomeDir) {
  app.setPath("home", requestedHomeDir);
  app.setPath("userData", path.join(requestedHomeDir, "Library", "Application Support", "CodePal"));
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingExpirySweepTimer: ReturnType<typeof setInterval> | null = null;
let sessionWatchers: ReturnType<typeof startSessionWatchers> | null = null;
let codeBuddyQuotaRuntime: ReturnType<typeof createCodeBuddyQuotaRuntime> | null = null;
let historyStore: ReturnType<typeof createAppHistoryStore> | null = null;
let historyWriter: ReturnType<typeof createDeferredHistoryWriter> | null = null;
let usageBackfillAbortController: AbortController | null = null;
let usageBackfillTimer: ReturnType<typeof setTimeout> | null = null;
let providerGatewayServer: ReturnType<typeof createClaudeDesktopGatewayServer> | null = null;
let providerGatewayListener: ProviderGatewayListenerInput = {
  state: "unavailable",
  host: "127.0.0.1",
  port: 15721,
  message: "Provider gateway not started",
};
let providerGatewayHealthCheck: ProviderGatewayHealthCheckSummary | null = null;
let providerGatewayRuntime: {
  settingsService: ReturnType<typeof createSettingsService>;
  gatewaySecretStore: GatewaySecretStore;
  homeDir: string;
} | null = null;
let quittingAfterProviderGatewayClose = false;
let installingUpdate = false;
const PROVIDER_GATEWAY_DISABLED_MESSAGE =
  "Provider Gateway is disabled in settings.";
const PROVIDER_GATEWAY_FEATURE_ENABLED = true;
const PROVIDER_GATEWAY_RESUME_STATE_FILE = "provider-gateway-runtime-state.json";
const PROVIDER_GATEWAY_RESUME_TARGETS = ["claude-desktop", "codex-desktop", "claude-cli"] as const;
type ProviderGatewayResumeTarget =
  | Extract<ProviderGatewayClientSetupTarget, "claude-desktop" | "codex-desktop">
  | "claude-cli";
const debugCodex = process.env.CODEPAL_DEBUG_CODEX === "1";
const silentE2E = process.env.CODEPAL_E2E_SILENT === "1";
const useAccessoryActivationPolicy = shouldUseAccessoryActivationPolicy({
  argv: process.argv,
  env: process.env,
  platform: process.platform,
});

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
  const payload = usageOverviewForRenderer(historyStore);
  win.webContents.send("codepal:usage-overview", payload);
}

function usageOverviewForRenderer(currentHistoryStore: ReturnType<typeof createAppHistoryStore> | null) {
  const payload: UsageOverview = usageStore.getOverview();
  if (currentHistoryStore) {
    try {
      payload.pricing = currentHistoryStore.getModelPricing();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "History store is closed") {
        throw error;
      }
    }
  }
  return payload;
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
  const statusInput = providerGatewayStatusInput(settingsService, gatewaySecretStore);
  const baseStatus = buildProviderGatewayStatus(statusInput);
  const claudeDesktopSetup = inspectProviderGatewayClientSetup({
    target: "claude-desktop",
    status: baseStatus,
    homeDir,
  });
  const claudeCliSetup = inspectProviderGatewayClientSetup({
    target: "claude-cli",
    status: baseStatus,
    homeDir,
  });
  const codexDesktopSetup = inspectProviderGatewayClientSetup({
    target: "codex-desktop",
    status: baseStatus,
    homeDir,
  });
  return buildProviderGatewayStatus({
    ...statusInput,
    claudeDesktopSetup,
    claudeCliSetup,
    claudeCliSettingsPath: path.join(homeDir, ".claude", "settings.json"),
    codexDesktopSetup,
  });
}

function providerGatewayBaseStatus(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
) {
  return buildProviderGatewayStatus(providerGatewayStatusInput(settingsService, gatewaySecretStore));
}

function providerGatewayStatusInput(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
) {
  const rawSettings = settingsService.getSettings();
  const settings = PROVIDER_GATEWAY_FEATURE_ENABLED
    ? rawSettings
    : {
        ...rawSettings,
        providerGateway: {
          ...rawSettings.providerGateway,
          enabled: false,
        },
      };
  const provider = settings.providerGateway.providers[settings.providerGateway.activeProvider];
  const tokenStatusByProvider = Object.fromEntries(
    Object.entries(settings.providerGateway.providers).map(([id, item]) => [
      id,
      gatewaySecretStore.tokenStatus(item),
    ]),
  );
  return {
    settings,
    tokenConfigured: provider ? gatewaySecretStore.hasToken(provider) : false,
    tokenStatusByProvider,
    listener: providerGatewayListener,
    lastHealthCheck: providerGatewayHealthCheck,
  };
}

function defaultReportTrendGranularity(startMs: number, endMs: number): TokenTrendGranularity {
  const durationMs = Math.max(1, endMs - startMs);
  if (durationMs <= 24 * 60 * 60 * 1000) return "minute";
  if (durationMs <= 45 * 24 * 60 * 60 * 1000) return "hour";
  return "day";
}

function resolveReportLocale(setting: AppLocale, systemLocale: string | undefined): ResolvedLocale {
  if (setting === "en" || setting === "zh-CN") return setting;
  return systemLocale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function applyHistorySettingsAtRuntimeSafely(
  currentHistoryStore: ReturnType<typeof createAppHistoryStore>,
  settings: Pick<AppSettings, "history">,
) {
  try {
    applyHistorySettingsAtRuntime(currentHistoryStore, settings);
  } catch (error) {
    console.error(
      "[CodePal History] failed to apply runtime settings:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function wireActionResponseIpc(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
  integrationService: ReturnType<typeof createIntegrationService>,
  updateService: ReturnType<typeof createUpdateService>,
  currentHistoryStore: ReturnType<typeof createAppHistoryStore> | null,
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
    return usageOverviewForRenderer(currentHistoryStore);
  });
  ipcMain.handle("codepal:get-token-stats", (_event, startMs: number, endMs: number, agent?: string) => {
    if (!currentHistoryStore) {
      return {
        daily: [],
        byProject: [],
        byModel: [],
        byAgent: [],
        topSessions: [],
        importStatus: {
          completedAt: null,
          claudeRowsImported: 0,
          codexRowsImported: 0,
          lastError: null,
        },
        pricing: [],
      };
    }
    return {
      daily: currentHistoryStore.getTokenUsageDailyStats(startMs, endMs, agent),
      byProject: currentHistoryStore.getTokenUsageByProject(startMs, endMs, agent),
      byModel: currentHistoryStore.getTokenUsageByModel(startMs, endMs, agent),
      byAgent: currentHistoryStore.getTokenUsageByAgent(startMs, endMs, agent),
      topSessions: currentHistoryStore.getTopTokenUsageSessions(startMs, endMs, agent, 10),
      importStatus: currentHistoryStore.getUsageImportStatus(),
      pricing: currentHistoryStore.getModelPricing(),
    };
  });
  ipcMain.handle(
    "codepal:get-token-trend",
    (
      _event,
	      startMs: number,
	      endMs: number,
	      granularity: import("../shared/analyticsTypes").TokenTrendGranularity,
	      filters?: { agent?: string; model?: string; projectPath?: string },
    ) => {
      if (!currentHistoryStore) {
        return { granularity, points: [], sourcePointCount: 0 };
      }
      const points = currentHistoryStore.getTokenUsageTrend(
        startMs,
        endMs,
        granularity,
        filters,
      );
      return {
        granularity,
        points,
        sourcePointCount: points.length,
      };
    },
  );
  ipcMain.handle("codepal:get-session-token-usage", (_event, sessionId: unknown) => {
    if (typeof sessionId !== "string" || !sessionId) {
      return { persisted: [], pricing: [] };
    }
    const persisted = currentHistoryStore?.getSessionTokenUsage(sessionId) ?? [];
    const liveEntry = usageStore.getOverview().sessions.find((s) => s.sessionId === sessionId);
    const live = liveEntry
      ? {
          tokens: liveEntry.tokens,
          context: liveEntry.context,
          cost: liveEntry.cost,
          model: liveEntry.model,
          completeness: liveEntry.completeness,
        }
      : undefined;
    const pricing = currentHistoryStore?.getModelPricing() ?? [];
    return { persisted, live, pricing };
  });
  ipcMain.handle("codepal:get-model-pricing", () => {
    if (!currentHistoryStore) return [];
    return currentHistoryStore.getModelPricing();
  });
  ipcMain.handle("codepal:upsert-model-pricing", (_event, pricing) => {
    if (!currentHistoryStore) return;
    currentHistoryStore.upsertModelPricing(pricing);
  });
  ipcMain.handle("codepal:get-session-stats", (_event, startMs: number, endMs: number) => {
    if (!currentHistoryStore) return [];
    return currentHistoryStore.getSessionStats(startMs, endMs);
  });
  ipcMain.handle("codepal:generate-html-report", (_event, startMs: number, endMs: number, reportOptions?: import("../main/report/generateHtmlReport").ReportRedactionOptions) => {
    if (!currentHistoryStore) return "";
    const startDate = new Date(startMs).toISOString().slice(0, 10);
    const endDate = new Date(endMs).toISOString().slice(0, 10);
    const agent = reportOptions?.agent;
    const model = reportOptions?.model;
    const locale = reportOptions?.locale ?? resolveReportLocale(settingsService.getSettings().locale, app.getLocale());
    const granularity = reportOptions?.trendGranularity ?? defaultReportTrendGranularity(startMs, endMs);
    const trendPoints = currentHistoryStore.getTokenUsageTrend(startMs, endMs, granularity, {
      agent,
      model,
      projectPath: reportOptions?.projectPath,
    });
    const durationMs = Math.max(1, endMs - startMs);
    const previousStartMs = startMs - durationMs;
    const previousEndMs = startMs - 1;
    const pricing = currentHistoryStore.getModelPricing();
    const currentStats = {
      daily: currentHistoryStore.getTokenUsageDailyStats(startMs, endMs, agent),
      byProject: currentHistoryStore.getTokenUsageByProject(startMs, endMs, agent),
      byModel: currentHistoryStore.getTokenUsageByModel(startMs, endMs, agent),
      byAgent: currentHistoryStore.getTokenUsageByAgent(startMs, endMs, agent),
      topSessions: currentHistoryStore.getTopTokenUsageSessions(startMs, endMs, agent, 25),
      importStatus: currentHistoryStore.getUsageImportStatus(),
      pricing,
    };
    const previousStats = {
      daily: currentHistoryStore.getTokenUsageDailyStats(previousStartMs, previousEndMs, agent),
      byModel: currentHistoryStore.getTokenUsageByModel(previousStartMs, previousEndMs, agent),
      byAgent: currentHistoryStore.getTokenUsageByAgent(previousStartMs, previousEndMs, agent),
      topSessions: currentHistoryStore.getTopTokenUsageSessions(previousStartMs, previousEndMs, agent, 25),
      importStatus: currentStats.importStatus,
      pricing,
    };
    const workHealth = deriveAnalyticsWorkHealth({
      workItemList: deriveWorkItems(sessionStore.getSessions()),
      usageOverview: usageStore.getOverview(),
      currentStats,
      previousStats,
      selectedRange: { startMs, endMs },
    });
    const sessionContexts = Object.fromEntries(
      usageStore
        .getOverview()
        .sessions
        .filter((session) => session.context)
        .map((session) => [session.sessionId, session.context]),
    );
    const html = generateHtmlReport({
      startDate,
      endDate,
      sessionStats: currentHistoryStore.getSessionStats(startMs, endMs),
      daily: currentStats.daily,
      byProject: currentStats.byProject,
      byModel: currentStats.byModel,
      byAgent: currentStats.byAgent,
      topSessions: currentStats.topSessions,
      sessionContexts,
      importStatus: currentStats.importStatus,
      trend: { granularity, points: trendPoints, sourcePointCount: trendPoints.length },
      metric: reportOptions?.metric,
      locale,
      workHealth,
      pricing,
      redaction: reportOptions,
    });
    const filePath = path.join(os.tmpdir(), `codepal-report-${Date.now()}.html`);
    fs.writeFileSync(filePath, html, "utf8");
    return filePath;
  });
  ipcMain.handle("codepal:generate-llm-report", async (_event, startMs: number, endMs: number, options?: { model?: string; redaction?: { redactSessionTitles?: boolean; redactModelNames?: boolean } }) => {
    if (!currentHistoryStore) {
      return { ok: false, error: "History store not available", model: "", estimatedInputTokens: 0 };
    }
    const settings = settingsService.getSettings();
    if (!settings.reports.llmEnabled) {
      return { ok: false, error: "LLM report generation is not enabled in settings", model: "", estimatedInputTokens: 0 };
    }
    const startDate = new Date(startMs).toISOString().slice(0, 10);
    const endDate = new Date(endMs).toISOString().slice(0, 10);
    const facts = buildReportFacts({
      granularity: "daily",
      startDate,
      endDate,
      sessionStats: currentHistoryStore.getSessionStats(startMs, endMs),
      daily: currentHistoryStore.getTokenUsageDailyStats(startMs, endMs),
      byModel: currentHistoryStore.getTokenUsageByModel(startMs, endMs),
      byAgent: currentHistoryStore.getTokenUsageByAgent(startMs, endMs),
      topSessions: currentHistoryStore.getTopTokenUsageSessions(startMs, endMs, undefined, 25),
      importStatus: currentHistoryStore.getUsageImportStatus(),
      pricing: currentHistoryStore.getModelPricing(),
    });
    const gatewaySettings = settings.providerGateway;
    const activeProvider = gatewaySettings.providers[gatewaySettings.activeProvider];
    const model = options?.model || settings.reports.llmDefaultModel || "claude-haiku-4-5";
    const gatewayResolution = resolveLlmReportGatewayForReport({
      gateway: gatewaySettings,
      listener: providerGatewayListener,
      tokenConfigured: activeProvider ? gatewaySecretStore.hasToken(activeProvider) : false,
    });
    if (!gatewayResolution.ok) {
      return {
        ok: false,
        error: gatewayResolution.error,
        model,
        estimatedInputTokens: 0,
      };
    }
    return generateLlmReport({
      facts,
      model,
      redaction: options?.redaction,
      gatewayBaseUrl: gatewayResolution.gatewayBaseUrl,
    });
  });
  ipcMain.handle("codepal:get-app-settings", () => settingsService.getSettings());
  ipcMain.handle("codepal:get-home-dir", () => app.getPath("home"));
  ipcMain.handle("codepal:reload-app-settings", () => {
    const settings = settingsService.reloadSettings();
    if (currentHistoryStore) {
      applyHistorySettingsAtRuntimeSafely(currentHistoryStore, settings);
    }
    codeBuddyQuotaRuntime?.updateSettings(settings.codebuddy);
    return settings;
  });
  ipcMain.handle("codepal:get-app-settings-path", () => settingsService.filePath);
  ipcMain.handle("codepal:update-app-settings", (_event, payload: unknown) => {
    const previousSettings = settingsService.getSettings();
    const settings = settingsService.updateSettings((payload ?? {}) as AppSettingsPatch);
    if (
      currentHistoryStore &&
      shouldApplyHistorySettingsAtRuntime(previousSettings, settings)
    ) {
      applyHistorySettingsAtRuntimeSafely(currentHistoryStore, settings);
    }
    codeBuddyQuotaRuntime?.updateSettings(settings.codebuddy);
    return settings;
  });
  ipcMain.handle("codepal:get-codebuddy-quota-status", async () => {
    return codeBuddyQuotaRuntime?.getStatus() ?? null;
  });
  ipcMain.handle("codepal:refresh-codebuddy-quota", async (_event, endpoint: unknown) => {
    if (endpoint !== "code" && endpoint !== "enterprise") {
      throw new Error("invalid CodeBuddy quota endpoint");
    }
    return codeBuddyQuotaRuntime?.refreshUsage(endpoint) ?? null;
  });
  ipcMain.handle("codepal:connect-codebuddy-quota", async (_event, endpoint: unknown) => {
    if (endpoint !== "code" && endpoint !== "enterprise") {
      throw new Error("invalid CodeBuddy quota endpoint");
    }
    return codeBuddyQuotaRuntime?.connectAndSync(endpoint) ?? null;
  });
  ipcMain.handle("codepal:clear-codebuddy-quota-auth", async (_event, endpoint: unknown) => {
    if (endpoint !== "code" && endpoint !== "enterprise") {
      throw new Error("invalid CodeBuddy quota endpoint");
    }
    return codeBuddyQuotaRuntime?.clearAuth(endpoint) ?? null;
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
  ipcMain.handle("codepal:update-provider-gateway-provider", (_event, payload: unknown) => {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const providerId = typeof record.providerId === "string" ? record.providerId.trim() : "";
    const provider = record.provider && typeof record.provider === "object"
      ? record.provider as ProviderGatewayConfig
      : null;
    if (!providerId || !provider) {
      throw new Error("provider payload is required");
    }
    const settings = settingsService.getSettings();
    const existingProvider = settings.providerGateway.providers[providerId];
    settings.providerGateway.providers[providerId] = {
      ...provider,
      tokenRef: existingProvider?.tokenRef ?? provider.tokenRef,
    };
    settingsService.replaceSettings(settings);
    return {
      ok: true,
      status: providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir),
    };
  });
  ipcMain.handle("codepal:select-provider-gateway-provider", (_event, payload: unknown) => {
    const providerId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).providerId === "string"
        ? (payload as Record<string, unknown>).providerId.trim()
        : "";
    if (!providerId) {
      throw new Error("provider id is required");
    }
    const settings = settingsService.getSettings();
    if (!(providerId in settings.providerGateway.providers)) {
      throw new Error("provider not configured");
    }
    const nextSettings = settingsService.replaceSettings({
      ...settings,
      providerGateway: {
        ...settings.providerGateway,
        activeProvider: providerId,
      },
    });
    return {
      ok: true,
      settings: nextSettings,
      status: providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir),
    };
  });
  ipcMain.handle("codepal:delete-provider-gateway-provider", (_event, payload: unknown) => {
    const providerId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).providerId === "string"
        ? (payload as Record<string, unknown>).providerId.trim()
        : "";
    if (!providerId) {
      throw new Error("provider id is required");
    }
    if (providerId in defaultProviderGatewaySettings.providers) {
      throw new Error("built-in providers cannot be deleted");
    }
    const settings = settingsService.getSettings();
    if (!(providerId in settings.providerGateway.providers)) {
      throw new Error("provider not configured");
    }
    delete settings.providerGateway.providers[providerId];
    if (settings.providerGateway.activeProvider === providerId) {
      settings.providerGateway.activeProvider = Object.keys(settings.providerGateway.providers)[0] ?? "mimo";
    }
    settingsService.replaceSettings(settings);
    return {
      ok: true,
      status: providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir),
    };
  });
  ipcMain.handle("codepal:run-provider-gateway-health-check", async () => {
    if (!PROVIDER_GATEWAY_FEATURE_ENABLED) {
      providerGatewayHealthCheck = null;
      return providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
    }
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
  ipcMain.handle("codepal:start-provider-gateway", async () => {
    if (!PROVIDER_GATEWAY_FEATURE_ENABLED) {
      throw new Error(PROVIDER_GATEWAY_DISABLED_MESSAGE);
    }
    if (providerGatewayServer && providerGatewayListener.state === "listening") {
      return providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
    }
    setProviderGatewayEnabled(settingsService, true);
    await startClaudeDesktopProviderGateway(settingsService, gatewaySecretStore);
    return providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
  });
  ipcMain.handle("codepal:stop-provider-gateway", async () => {
    if (!PROVIDER_GATEWAY_FEATURE_ENABLED) {
      throw new Error(PROVIDER_GATEWAY_DISABLED_MESSAGE);
    }
    return stopProviderGateway(settingsService, gatewaySecretStore, homeDir, app.getPath("userData"));
  });
  ipcMain.handle("codepal:configure-provider-gateway-client", (_event, payload: unknown) => {
    if (!PROVIDER_GATEWAY_FEATURE_ENABLED) {
      throw new Error(PROVIDER_GATEWAY_DISABLED_MESSAGE);
    }
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
    const status = providerGatewayBaseStatus(settingsService, gatewaySecretStore);
    if (!setupTarget.endsWith("-restore") && status.listener.state !== "listening") {
      throw new Error("Start Provider Gateway before configuring Claude or Codex.");
    }
    const result = configureProviderGatewayClient({
      target: setupTarget,
      status,
      homeDir,
    });
    return {
      ...result,
      status: providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir),
    };
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
  registerHistoryIpcHandlers({
    ipcMain,
    historyStore: currentHistoryStore,
    getPersistenceEnabled: () => settingsService.getSettings().history.persistenceEnabled,
  });
  ipcMain.handle("codepal:install-integration-hooks", (_event, payload: unknown) => {
    const agentId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).agentId === "string"
        ? (payload as Record<string, unknown>).agentId
        : "";
    if (
      agentId !== "claude" &&
      agentId !== "cursor" &&
      agentId !== "codebuddy" &&
      agentId !== "codex" &&
      agentId !== "qoder" &&
      agentId !== "qwen" &&
      agentId !== "factory"
    ) {
      throw new Error("unsupported integration agent");
    }
    return integrationService.installHooks(agentId);
  });
  ipcMain.handle("codepal:restore-integration-hooks", (_event, payload: unknown) => {
    const agentId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).agentId === "string"
        ? (payload as Record<string, unknown>).agentId
        : "";
    if (
      agentId !== "claude" &&
      agentId !== "cursor" &&
      agentId !== "codebuddy" &&
      agentId !== "codex" &&
      agentId !== "qoder" &&
      agentId !== "qwen" &&
      agentId !== "factory"
    ) {
      throw new Error("unsupported integration agent");
    }
    return integrationService.restoreHooks(agentId);
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

    if (!SESSION_PENDING_ACTION_RESPONSE_ENABLED) {
      emitResult({
        sessionId,
        actionId,
        option,
        result: "error",
        error: "Action response is disabled in CodePal.",
      });
      return;
    }

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
  ipcMain.handle("codepal:get-session-capabilities", (_event, sessionId: unknown) => {
    if (typeof sessionId !== "string") return null;
    const session = sessionStore.getSession(sessionId);
    if (!session) return null;
    return resolveSessionCapabilities(session);
  });
  ipcMain.handle("codepal:execute-session-action", async (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return { ok: false, action: "unknown", sessionId: "", error: "invalid payload" };
    }
    const p = payload as Record<string, unknown>;
    const sessionId = typeof p.sessionId === "string" ? p.sessionId : "";
    const actionType = typeof p.actionType === "string" ? p.actionType : "";
    const params = (p.payload ?? {}) as Record<string, unknown>;
    if (!sessionId || !actionType) {
      return { ok: false, action: actionType, sessionId, error: "missing sessionId or actionType" };
    }
    const result = await actionBroker.executeAction(
      sessionId,
      actionType as import("../shared/capabilityTypes").SessionActionType,
      {
        text: typeof params.text === "string" ? params.text : undefined,
      },
    );
    sessionStore.addActionLogEntry(sessionId, {
      action: result.action as import("../shared/sessionTypes").ActionLogAction,
      timestamp: Date.now(),
      ok: result.ok,
      error: result.error,
      detail: typeof params.text === "string" ? params.text.slice(0, 80) : undefined,
    });
    if (result.ok) {
      broadcastSessions();
    }
    return result;
  });
  ipcMain.handle("codepal:delete-session", (_event, sessionId: unknown) => {
    if (typeof sessionId !== "string" || !sessionId) {
      return false;
    }
    sessionStore.addActionLogEntry(sessionId, {
      action: "deleteSession",
      timestamp: Date.now(),
      ok: true,
    });
    const ok = sessionStore.closeSession(sessionId);
    if (ok) {
      broadcastSessions();
    }
    return ok;
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
  if (silentE2E) {
    win.setSkipTaskbar(true);
  } else {
    win.once("ready-to-show", () => win.show());
  }
  return win;
}

function applySilentE2EWindowPolicy() {
  applyAccessoryActivationPolicy(app, useAccessoryActivationPolicy);
}

function resolveUsageBackfillDelayMs() {
  const raw = process.env.CODEPAL_USAGE_BACKFILL_DELAY_MS?.trim();
  if (!raw) {
    return 750;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 750;
}

function scheduleUsageBackfillAfterStartup(options: {
  currentHistoryStore: ReturnType<typeof createAppHistoryStore>;
  homeDir: string;
}) {
  if (usageBackfillAbortController || usageBackfillTimer !== null) {
    return;
  }
  const controller = new AbortController();
  usageBackfillAbortController = controller;
  usageBackfillTimer = setTimeout(() => {
    usageBackfillTimer = null;
    if (controller.signal.aborted || historyStore !== options.currentHistoryStore) {
      if (usageBackfillAbortController === controller) {
        usageBackfillAbortController = null;
      }
      return;
    }
    void runUsageBackfillAsync({
      historyStore: options.currentHistoryStore,
      claudeProjectsPath: path.join(options.homeDir, ".claude", "projects"),
      codexSessionsPath: path.join(options.homeDir, ".codex", "sessions"),
      signal: controller.signal,
    })
      .then((status) => {
        if (status.lastError) {
          console.error("[CodePal Usage] history backfill failed:", status.lastError);
        } else if (status.claudeRowsImported > 0 || status.codexRowsImported > 0) {
          console.log(
            `[CodePal Usage] Backfilled ${status.claudeRowsImported} Claude row(s) and ${status.codexRowsImported} Codex row(s)`,
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("[CodePal Usage] history backfill failed:", error);
        }
      })
      .finally(() => {
        if (usageBackfillAbortController === controller) {
          usageBackfillAbortController = null;
        }
      });
  }, resolveUsageBackfillDelayMs());
}

function scheduleModelPricingSync(options: {
  currentHistoryStore: ReturnType<typeof createAppHistoryStore>;
  settingsService: ReturnType<typeof createSettingsService>;
}) {
  const remoteUrl = options.settingsService.getSettings().pricing.remoteUrl;
  void syncModelPricingFromRemote({
    remoteUrl,
    historyStore: options.currentHistoryStore,
  }).then((result) => {
    if (result.ok) {
      if (result.imported > 0) {
        console.log(`[CodePal Pricing] Synced ${result.imported} model pricing row(s)`);
      }
      return;
    }
    console.error("[CodePal Pricing] remote pricing sync skipped:", result.error);
  });
}

async function wireIpcHub(
  integrationService: ReturnType<typeof createIntegrationService>,
  settingsService: ReturnType<typeof createSettingsService>,
  currentHistoryStore: ReturnType<typeof createAppHistoryStore> | null,
  usageSnapshotCache?: ReturnType<typeof createUsageSnapshotCache>,
): Promise<"listening" | "already_running" | "error"> {
  const hub = createIpcHub({
    onMessage: (line) => {
      const usageSnapshot = lineToUsageSnapshot(line);
      if (usageSnapshot) {
        usageStore.applySnapshot(usageSnapshot);
        const tokenUsage = tokenUsageWriteFromUsageSnapshot(usageSnapshot);
        if (tokenUsage && currentHistoryStore) {
          try {
            currentHistoryStore.writeTokenUsage(tokenUsage);
          } catch (error) {
            console.error("[CodePal] Failed to persist token usage:", (error as Error).message);
          }
        }
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
  if (!PROVIDER_GATEWAY_FEATURE_ENABLED || !settings.enabled) {
    providerGatewayListener = {
      state: "disabled",
      host: settings.host,
      port: settings.port,
    };
    console.log(
      PROVIDER_GATEWAY_FEATURE_ENABLED
        ? "[CodePal Gateway] disabled"
        : `[CodePal Gateway] disabled: ${PROVIDER_GATEWAY_DISABLED_MESSAGE}`,
    );
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

function restoreProviderGatewayClients(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
) {
  const status = providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
  return [
    configureProviderGatewayClient({
      target: "claude-desktop-restore",
      status,
      homeDir,
    }),
    configureProviderGatewayClient({
      target: "claude-cli-restore",
      status,
      homeDir,
    }),
    configureProviderGatewayClient({
      target: "codex-desktop-restore",
      status,
      homeDir,
    }),
  ];
}

function providerGatewayResumeStatePath(userDataPath: string) {
  return path.join(userDataPath, PROVIDER_GATEWAY_RESUME_STATE_FILE);
}

function isProviderGatewayResumeTarget(value: unknown): value is ProviderGatewayResumeTarget {
  return (
    typeof value === "string" &&
    (PROVIDER_GATEWAY_RESUME_TARGETS as readonly string[]).includes(value)
  );
}

function writeProviderGatewayResumeState(
  userDataPath: string,
  targets: readonly ProviderGatewayResumeTarget[],
) {
  const statePath = providerGatewayResumeStatePath(userDataPath);
  if (targets.length === 0) {
    if (fs.existsSync(statePath)) {
      fs.rmSync(statePath);
    }
    return;
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(
    statePath,
    `${JSON.stringify({ targets: [...new Set(targets)], savedAt: Date.now() }, null, 2)}\n`,
    "utf8",
  );
}

function readProviderGatewayResumeState(userDataPath: string): ProviderGatewayResumeTarget[] {
  const statePath = providerGatewayResumeStatePath(userDataPath);
  if (!fs.existsSync(statePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { targets?: unknown }).targets)) {
      return [];
    }
    return [...new Set((parsed as { targets: unknown[] }).targets.filter(isProviderGatewayResumeTarget))];
  } catch {
    return [];
  }
}

function deleteProviderGatewayResumeState(userDataPath: string) {
  writeProviderGatewayResumeState(userDataPath, []);
}

function activeProviderGatewayClientTargets(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
): ProviderGatewayResumeTarget[] {
  const status = providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
  const targets: ProviderGatewayResumeTarget[] = [];
  if (status.claudeDesktop.setup.active) {
    targets.push("claude-desktop");
  }
  if (status.codexDesktop.setup.active) {
    targets.push("codex-desktop");
  }
  if (status.claudeCli.setup.active) {
    targets.push("claude-cli");
  }
  return targets;
}

function configureProviderGatewayClients(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
  targets: readonly ProviderGatewayResumeTarget[],
) {
  if (targets.length === 0) {
    return [];
  }
  const status = providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
  if (status.listener.state !== "listening") {
    return [];
  }
  return targets.map((target) =>
    configureProviderGatewayClient({
      target,
      status,
      homeDir,
    }),
  );
}

function resumeProviderGatewayClients(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
  userDataPath: string,
) {
  const targets = readProviderGatewayResumeState(userDataPath);
  try {
    return configureProviderGatewayClients(settingsService, gatewaySecretStore, homeDir, targets);
  } catch (error) {
    console.error("[CodePal Gateway] failed to resume client configs after startup:", error);
    return [];
  }
}

function setProviderGatewayEnabled(
  settingsService: ReturnType<typeof createSettingsService>,
  enabled: boolean,
) {
  const settings = settingsService.getSettings();
  if (settings.providerGateway.enabled === enabled) {
    return;
  }
  settingsService.replaceSettings({
    ...settings,
    providerGateway: {
      ...settings.providerGateway,
      enabled,
    },
  });
}

function closeProviderGatewayServer(): Promise<void> {
  const server = providerGatewayServer;
  providerGatewayServer = null;
  if (!server) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function stopProviderGateway(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
  userDataPath: string,
  options: { throwOnRestoreError?: boolean } = {},
) {
  try {
    restoreProviderGatewayClients(settingsService, gatewaySecretStore, homeDir);
  } catch (error) {
    if (options.throwOnRestoreError ?? true) {
      throw error;
    }
    console.error("[CodePal Gateway] failed to restore client configs before stop:", error);
  }
  await closeProviderGatewayServer();
  providerGatewayHealthCheck = null;
  deleteProviderGatewayResumeState(userDataPath);
  setProviderGatewayEnabled(settingsService, false);
  markProviderGatewayNotStarted(settingsService);
  return providerGatewayStatusForRenderer(settingsService, gatewaySecretStore, homeDir);
}

async function suspendProviderGatewayForAppQuit(
  settingsService: ReturnType<typeof createSettingsService>,
  gatewaySecretStore: GatewaySecretStore,
  homeDir: string,
  userDataPath: string,
) {
  try {
    const targets = settingsService.getSettings().providerGateway.enabled
      ? activeProviderGatewayClientTargets(settingsService, gatewaySecretStore, homeDir)
      : [];
    writeProviderGatewayResumeState(userDataPath, targets);
    restoreProviderGatewayClients(settingsService, gatewaySecretStore, homeDir);
  } catch (error) {
    console.error("[CodePal Gateway] failed to restore client configs during app quit:", error);
  }
  await closeProviderGatewayServer();
  providerGatewayHealthCheck = null;
  markProviderGatewayNotStarted(settingsService);
}

function markProviderGatewayNotStarted(settingsService: ReturnType<typeof createSettingsService>) {
  const settings = settingsService.getSettings().providerGateway;
  providerGatewayListener = {
    state: "unavailable",
    host: settings.host,
    port: settings.port,
    message: "Provider gateway not started",
  };
}

applyAccessoryActivationPolicy(app, useAccessoryActivationPolicy);

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

    app.on("before-quit", (event) => {
      if (
        !installingUpdate &&
        !quittingAfterProviderGatewayClose &&
        providerGatewayRuntime &&
        providerGatewayServer
      ) {
        event.preventDefault();
        quittingAfterProviderGatewayClose = true;
        void suspendProviderGatewayForAppQuit(
          providerGatewayRuntime.settingsService,
          providerGatewayRuntime.gatewaySecretStore,
          providerGatewayRuntime.homeDir,
          app.getPath("userData"),
        )
          .catch((error) => {
            console.error("[CodePal Gateway] failed to suspend server during app quit:", error);
          })
          .finally(() => {
            app.quit();
          });
        return;
      }
      usageBackfillAbortController?.abort();
      usageBackfillAbortController = null;
      if (usageBackfillTimer !== null) {
        clearTimeout(usageBackfillTimer);
        usageBackfillTimer = null;
      }
      if (pendingExpirySweepTimer !== null) {
        clearInterval(pendingExpirySweepTimer);
        pendingExpirySweepTimer = null;
      }
      sessionBroadcastScheduler.cancel();
      codeBuddyQuotaRuntime?.stop();
      codeBuddyQuotaRuntime = null;
      sessionWatchers?.stop();
      sessionWatchers = null;
      historyWriter?.close();
      historyWriter = null;
      historyStore?.close();
      historyStore = null;
      void closeProviderGatewayServer();
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

    applySilentE2EWindowPolicy();

    void app.whenReady().then(async () => {
      applySilentE2EWindowPolicy();
      const homeDir = process.env.CODEPAL_HOME_DIR?.trim() || app.getPath("home");
      const templateSettingsPath = resolveTemplateSettingsPath(app.getAppPath());
      const writableSettingsPath = resolveWritableSettingsPath({
        override: process.env.CODEPAL_SETTINGS_PATH,
        userDataPath: app.getPath("userData"),
      });
      const settingsService = createSettingsService({
        writablePath: writableSettingsPath,
        templatePath: templateSettingsPath,
      });
      const appSettings = settingsService.getSettings();
      const gatewaySecretStore = createGatewaySecretStore({
        filePath: path.join(app.getPath("userData"), "provider-gateway-secrets.json"),
        env: process.env,
      });
      providerGatewayRuntime = { settingsService, gatewaySecretStore, homeDir };
      installMainProcessFileLogger(path.join(app.getPath("userData"), "logs"));
      if (appSettings.providerGateway.enabled) {
        await startClaudeDesktopProviderGateway(settingsService, gatewaySecretStore);
        resumeProviderGatewayClients(
          settingsService,
          gatewaySecretStore,
          homeDir,
          app.getPath("userData"),
        );
      } else {
        markProviderGatewayNotStarted(settingsService);
      }
      try {
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
        scheduleModelPricingSync({
          currentHistoryStore: historyStore,
          settingsService,
        });
        if (appSettings.history.persistenceEnabled) {
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
      } catch (error) {
        console.error(
          "[CodePal History] failed to initialize; persistence disabled for this launch:",
          error,
        );
        try {
          historyWriter?.close();
        } catch (closeError) {
          console.error("[CodePal History] failed to close writer after startup error:", closeError);
        }
        historyWriter = null;
        try {
          historyStore?.close();
        } catch (closeError) {
          console.error("[CodePal History] failed to close store after startup error:", closeError);
        }
        historyStore = null;
      }
      const usageSnapshotCache = createUsageSnapshotCache({
        filePath: path.join(app.getPath("userData"), "usage-snapshot-cache.json"),
      });
      hydrateUsageStoreFromCache(usageSnapshotCache, usageStore);
      codeBuddyQuotaRuntime = createCodeBuddyQuotaRuntime({
        settings: appSettings.codebuddy,
        onUsageSnapshot: (snapshot) => usageStore.applySnapshot(snapshot),
        broadcastUsageOverview,
      });
      codeBuddyQuotaRuntime.start();
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
      // Startup must remain read-only for third-party agent configuration.
      // Hook install and migration are only allowed through explicit user actions.
      const updateService = createUpdateService({
        isPackaged: app.isPackaged,
        currentVersion: app.getVersion(),
        stateFilePath: path.join(app.getPath("userData"), "update-state.json"),
        updateCacheDir: path.join(app.getPath("cache"), "codepal-updater"),
        onStateChange: broadcastUpdateState,
        onBeforeInstall: () => {
          installingUpdate = true;
          historyWriter?.close();
          void closeProviderGatewayServer();
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
        writeTokenUsage: historyStore
          ? (entry) => {
              try {
                historyStore!.writeTokenUsage(entry);
              } catch (error) {
                console.error("[CodePal] Failed to persist token usage:", (error as Error).message);
              }
            }
          : undefined,
      });
      broadcastUsageOverview();
      const win = getOrCreateMainWindow();
      win.webContents.once("dom-ready", () => {
        sessionBroadcastScheduler.flushNow();
        broadcastUsageOverview();
        broadcastUpdateState(updateService.getState());
        if (appSettings.history.persistenceEnabled && historyStore) {
          scheduleUsageBackfillAfterStartup({
            currentHistoryStore: historyStore,
            homeDir,
          });
        }
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
    }).catch((error) => {
      console.error("[CodePal] startup failed:", error);
      app.quit();
    });
  })
  .catch((err) => {
    console.error("[CodePal] hook CLI bootstrap error:", err);
    process.exit(1);
  });
