import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings } from "../../shared/appSettings";
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
import type { SessionRecord } from "../../shared/sessionTypes";
import type { UsageOverview } from "../../shared/usageTypes";

contextBridge.exposeInMainWorld("codepal", {
  version: "0.1.0",
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
  updateAppSettings(settings: Partial<AppSettings>) {
    return ipcRenderer.invoke("codepal:update-app-settings", settings) as Promise<AppSettings>;
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
