import type { AppSettings, AppSettingsPatch } from "../shared/appSettings";
import type {
  ClaudeQuotaDiagnostics,
  ClaudeQuotaSyncResult,
} from "../shared/claudeQuotaTypes";
import type {
  CodeBuddyQuotaConnectResult,
  CodeBuddyQuotaDiagnostics,
} from "../shared/codebuddyQuotaTypes";
import type {
  CursorDashboardConnectResult,
  CursorDashboardDiagnostics,
} from "../shared/cursorDashboardTypes";
import type {
  IntegrationDiagnostics,
  IntegrationInstallResult,
} from "../shared/integrationTypes";
import type {
  HistoryDiagnostics,
  SessionHistoryPage,
  SessionHistoryPageRequest,
} from "../shared/historyTypes";
import type { SessionRecord } from "../shared/sessionTypes";
import type { AppUpdateState } from "../shared/updateTypes";
import type { UsageOverview } from "../shared/usageTypes";

export type CodePalApi = {
  getSessions: () => Promise<SessionRecord[]>;
  clearSessionHistory: () => Promise<SessionRecord[]>;
  onSessions: (handler: (sessions: SessionRecord[]) => void) => () => void;
  getUsageOverview: () => Promise<UsageOverview>;
  getAppSettings: () => Promise<AppSettings>;
  getHomeDir: () => Promise<string>;
  reloadAppSettings: () => Promise<AppSettings>;
  getAppSettingsPath: () => Promise<string>;
  updateAppSettings: (settings: AppSettingsPatch) => Promise<AppSettings>;
  getUpdateState: () => Promise<AppUpdateState>;
  checkForUpdates: () => Promise<AppUpdateState>;
  downloadUpdate: () => Promise<AppUpdateState>;
  installUpdate: () => Promise<AppUpdateState>;
  skipUpdateVersion: () => Promise<AppUpdateState>;
  clearSkippedUpdateVersion: () => Promise<AppUpdateState>;
  onUpdateState: (handler: (state: AppUpdateState) => void) => () => void;
  onUsageOverview: (handler: (overview: UsageOverview) => void) => () => void;
  getIntegrationDiagnostics: () => Promise<IntegrationDiagnostics>;
  getHistoryDiagnostics: () => Promise<HistoryDiagnostics>;
  getSessionHistoryPage: (input: SessionHistoryPageRequest) => Promise<SessionHistoryPage>;
  clearHistoryStore: () => Promise<HistoryDiagnostics>;
  installIntegrationHooks: (
    agentId: "claude" | "cursor" | "codebuddy" | "codex",
  ) => Promise<IntegrationInstallResult>;
  getClaudeQuotaDiagnostics: () => Promise<ClaudeQuotaDiagnostics>;
  refreshClaudeQuota: () => Promise<ClaudeQuotaSyncResult>;
  getCodeBuddyQuotaDiagnostics: () => Promise<CodeBuddyQuotaDiagnostics>;
  getCodeBuddyInternalQuotaDiagnostics: () => Promise<CodeBuddyQuotaDiagnostics>;
  connectCodeBuddyQuota: () => Promise<CodeBuddyQuotaConnectResult>;
  connectCodeBuddyInternalQuota: () => Promise<CodeBuddyQuotaConnectResult>;
  refreshCodeBuddyQuota: () => Promise<CodeBuddyQuotaConnectResult>;
  refreshCodeBuddyInternalQuota: () => Promise<CodeBuddyQuotaConnectResult>;
  clearCodeBuddyQuotaAuth: () => Promise<CodeBuddyQuotaDiagnostics>;
  clearCodeBuddyInternalQuotaAuth: () => Promise<CodeBuddyQuotaDiagnostics>;
  getCursorDashboardDiagnostics: () => Promise<CursorDashboardDiagnostics>;
  connectCursorDashboard: () => Promise<CursorDashboardConnectResult>;
  refreshCursorDashboardUsage: () => Promise<CursorDashboardConnectResult>;
  clearCursorDashboardAuth: () => Promise<CursorDashboardDiagnostics>;
  onOpenSettings: (handler: () => void) => () => void;
  onFocusSession: (handler: (sessionId: string) => void) => () => void;
  openExternalTarget: (target: string) => Promise<string>;
  writeClipboardText: (text: string) => Promise<void>;
  respondToPendingAction: (sessionId: string, actionId: string, option: string) => void;
};

declare global {
  interface Window {
    codepal: CodePalApi;
  }
}

export {};
