import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, AppSettingsPatch } from "../../shared/appSettings";
import type {
  ClaudeQuotaDiagnostics,
  ClaudeQuotaSyncResult,
} from "../../shared/claudeQuotaTypes";
import type {
  CodeBuddyQuotaConnectResult,
  CodeBuddyQuotaDiagnostics,
} from "../../shared/codebuddyQuotaTypes";
import type {
  CursorDashboardConnectResult,
  CursorDashboardDiagnostics,
} from "../../shared/cursorDashboardTypes";
import type {
  IntegrationDiagnostics,
  IntegrationInstallResult,
} from "../../shared/integrationTypes";
import type {
  HistoryDiagnostics,
  SessionHistoryPage,
  SessionHistoryPageRequest,
} from "../../shared/historyTypes";
import type { SessionRecord } from "../../shared/sessionTypes";
import type { AppUpdateState } from "../../shared/updateTypes";
import type { UsageOverview } from "../../shared/usageTypes";

contextBridge.exposeInMainWorld("codepal", {
  getSessions() {
    return ipcRenderer.invoke("codepal:get-sessions") as Promise<SessionRecord[]>;
  },
  clearSessionHistory() {
    return ipcRenderer.invoke("codepal:clear-session-history") as Promise<SessionRecord[]>;
  },
  onSessions(handler: (sessions: SessionRecord[]) => void) {
    const channel = "codepal:sessions";
    const listener = (
      _event: Electron.IpcRendererEvent,
      sessions: SessionRecord[],
    ) => {
      handler(sessions);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  getUsageOverview() {
    return ipcRenderer.invoke("codepal:get-usage-overview") as Promise<UsageOverview>;
  },
  getAppSettings() {
    return ipcRenderer.invoke("codepal:get-app-settings") as Promise<AppSettings>;
  },
  getHomeDir() {
    return ipcRenderer.invoke("codepal:get-home-dir") as Promise<string>;
  },
  reloadAppSettings() {
    return ipcRenderer.invoke("codepal:reload-app-settings") as Promise<AppSettings>;
  },
  getAppSettingsPath() {
    return ipcRenderer.invoke("codepal:get-app-settings-path") as Promise<string>;
  },
  updateAppSettings(settings: AppSettingsPatch) {
    return ipcRenderer.invoke("codepal:update-app-settings", settings) as Promise<AppSettings>;
  },
  getUpdateState() {
    return ipcRenderer.invoke("codepal:get-update-state") as Promise<AppUpdateState>;
  },
  checkForUpdates() {
    return ipcRenderer.invoke("codepal:check-for-updates") as Promise<AppUpdateState>;
  },
  downloadUpdate() {
    return ipcRenderer.invoke("codepal:download-update") as Promise<AppUpdateState>;
  },
  installUpdate() {
    return ipcRenderer.invoke("codepal:install-update") as Promise<AppUpdateState>;
  },
  skipUpdateVersion() {
    return ipcRenderer.invoke("codepal:skip-update-version") as Promise<AppUpdateState>;
  },
  clearSkippedUpdateVersion() {
    return ipcRenderer.invoke("codepal:clear-skipped-update-version") as Promise<AppUpdateState>;
  },
  onUpdateState(handler: (state: AppUpdateState) => void) {
    const channel = "codepal:update-state";
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: AppUpdateState,
    ) => {
      handler(state);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  onUsageOverview(handler: (overview: UsageOverview) => void) {
    const channel = "codepal:usage-overview";
    const listener = (
      _event: Electron.IpcRendererEvent,
      overview: UsageOverview,
    ) => {
      handler(overview);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  getIntegrationDiagnostics() {
    return ipcRenderer.invoke(
      "codepal:get-integration-diagnostics",
    ) as Promise<IntegrationDiagnostics>;
  },
  getHistoryDiagnostics() {
    return ipcRenderer.invoke("codepal:get-history-diagnostics") as Promise<HistoryDiagnostics>;
  },
  getSessionHistoryPage(input: SessionHistoryPageRequest) {
    return ipcRenderer.invoke(
      "codepal:get-session-history-page",
      input,
    ) as Promise<SessionHistoryPage>;
  },
  clearHistoryStore() {
    return ipcRenderer.invoke("codepal:clear-history-store") as Promise<HistoryDiagnostics>;
  },
  installIntegrationHooks(agentId: "claude" | "cursor" | "codebuddy" | "codex") {
    return ipcRenderer.invoke("codepal:install-integration-hooks", {
      agentId,
    }) as Promise<IntegrationInstallResult>;
  },
  getCursorDashboardDiagnostics() {
    return ipcRenderer.invoke(
      "codepal:get-cursor-dashboard-diagnostics",
    ) as Promise<CursorDashboardDiagnostics>;
  },
  getCodeBuddyQuotaDiagnostics() {
    return ipcRenderer.invoke(
      "codepal:get-codebuddy-quota-diagnostics",
    ) as Promise<CodeBuddyQuotaDiagnostics>;
  },
  getClaudeQuotaDiagnostics() {
    return ipcRenderer.invoke(
      "codepal:get-claude-quota-diagnostics",
    ) as Promise<ClaudeQuotaDiagnostics>;
  },
  getCodeBuddyInternalQuotaDiagnostics() {
    return ipcRenderer.invoke(
      "codepal:get-codebuddy-internal-quota-diagnostics",
    ) as Promise<CodeBuddyQuotaDiagnostics>;
  },
  connectCursorDashboard() {
    return ipcRenderer.invoke(
      "codepal:connect-cursor-dashboard",
    ) as Promise<CursorDashboardConnectResult>;
  },
  connectCodeBuddyQuota() {
    return ipcRenderer.invoke(
      "codepal:connect-codebuddy-quota",
    ) as Promise<CodeBuddyQuotaConnectResult>;
  },
  connectCodeBuddyInternalQuota() {
    return ipcRenderer.invoke(
      "codepal:connect-codebuddy-internal-quota",
    ) as Promise<CodeBuddyQuotaConnectResult>;
  },
  refreshCursorDashboardUsage() {
    return ipcRenderer.invoke(
      "codepal:refresh-cursor-dashboard-usage",
    ) as Promise<CursorDashboardConnectResult>;
  },
  refreshClaudeQuota() {
    return ipcRenderer.invoke(
      "codepal:refresh-claude-quota",
    ) as Promise<ClaudeQuotaSyncResult>;
  },
  clearCursorDashboardAuth() {
    return ipcRenderer.invoke(
      "codepal:clear-cursor-dashboard-auth",
    ) as Promise<CursorDashboardDiagnostics>;
  },
  refreshCodeBuddyQuota() {
    return ipcRenderer.invoke(
      "codepal:refresh-codebuddy-quota",
    ) as Promise<CodeBuddyQuotaConnectResult>;
  },
  clearCodeBuddyQuotaAuth() {
    return ipcRenderer.invoke(
      "codepal:clear-codebuddy-quota-auth",
    ) as Promise<CodeBuddyQuotaDiagnostics>;
  },
  refreshCodeBuddyInternalQuota() {
    return ipcRenderer.invoke(
      "codepal:refresh-codebuddy-internal-quota",
    ) as Promise<CodeBuddyQuotaConnectResult>;
  },
  clearCodeBuddyInternalQuotaAuth() {
    return ipcRenderer.invoke(
      "codepal:clear-codebuddy-internal-quota-auth",
    ) as Promise<CodeBuddyQuotaDiagnostics>;
  },
  onOpenSettings(handler: () => void) {
    const channel = "codepal:open-settings";
    const listener = () => {
      handler();
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  openExternalTarget(target: string) {
    return ipcRenderer.invoke("codepal:open-external-target", { target }) as Promise<string>;
  },
  writeClipboardText(text: string) {
    return ipcRenderer.invoke("codepal:write-clipboard-text", { text }) as Promise<void>;
  },
  respondToPendingAction(sessionId: string, actionId: string, option: string) {
    ipcRenderer.send("codepal:action-response", { sessionId, actionId, option });
  },
});
