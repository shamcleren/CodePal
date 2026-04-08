import type { AppSettings } from "../shared/appSettings";
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
import type { SessionRecord } from "../shared/sessionTypes";
import type { UsageOverview } from "../shared/usageTypes";

export type CodePalApi = {
  version: string;
  getSessions: () => Promise<SessionRecord[]>;
  clearSessionHistory: () => Promise<SessionRecord[]>;
  onSessions: (handler: (sessions: SessionRecord[]) => void) => () => void;
  getUsageOverview: () => Promise<UsageOverview>;
  getAppSettings: () => Promise<AppSettings>;
  getHomeDir: () => Promise<string>;
  reloadAppSettings: () => Promise<AppSettings>;
  getAppSettingsPath: () => Promise<string>;
  updateAppSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  onUsageOverview: (handler: (overview: UsageOverview) => void) => () => void;
  getIntegrationDiagnostics: () => Promise<IntegrationDiagnostics>;
  installIntegrationHooks: (
    agentId: "cursor" | "codebuddy" | "codex",
  ) => Promise<IntegrationInstallResult>;
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
