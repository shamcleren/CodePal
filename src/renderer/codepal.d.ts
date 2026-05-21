import type { AppSettings, AppSettingsPatch } from "../shared/appSettings";
import type {
  IntegrationAgentId,
  IntegrationDiagnostics,
  IntegrationInstallResult,
} from "../shared/integrationTypes";
import type {
  HistoryDiagnostics,
  SessionHistoryPage,
  SessionHistoryPageRequest,
} from "../shared/historyTypes";
import type { SessionJumpTarget, SessionRecord } from "../shared/sessionTypes";
import type { SessionActionType, SessionCapabilityManifest } from "../shared/capabilityTypes";
import type { AppUpdateState } from "../shared/updateTypes";
import type { UsageOverview, TokenStatsResult, ModelPricing, SessionStatsEntry, SessionTokenUsageResult } from "../shared/usageTypes";
import type {
  ProviderGatewayClientSetupResult,
  ProviderGatewayClientSetupTarget,
  ProviderGatewayStatus,
  ProviderGatewayTokenUpdateResult,
} from "../shared/providerGatewayTypes";

export type CodePalApi = {
  getSessions: () => Promise<SessionRecord[]>;
  clearSessionHistory: () => Promise<SessionRecord[]>;
  onSessions: (handler: (sessions: SessionRecord[]) => void) => () => void;
  getUsageOverview: () => Promise<UsageOverview>;
  getTokenStats: (startMs: number, endMs: number, agent?: string) => Promise<TokenStatsResult>;
  getSessionStats: (startMs: number, endMs: number) => Promise<SessionStatsEntry[]>;
  generateHtmlReport: (startMs: number, endMs: number, redactionOptions?: { redactSessionTitles?: boolean; redactModelNames?: boolean }) => Promise<string>;
  getModelPricing: () => Promise<ModelPricing[]>;
  upsertModelPricing: (pricing: ModelPricing) => Promise<void>;
  getAppSettings: () => Promise<AppSettings>;
  getHomeDir: () => Promise<string>;
  reloadAppSettings: () => Promise<AppSettings>;
  getAppSettingsPath: () => Promise<string>;
  updateAppSettings: (settings: AppSettingsPatch) => Promise<AppSettings>;
  getProviderGatewayStatus: () => Promise<ProviderGatewayStatus>;
  updateProviderGatewayToken: (
    providerId: string,
    token: string,
  ) => Promise<ProviderGatewayTokenUpdateResult>;
  runProviderGatewayHealthCheck: () => Promise<ProviderGatewayStatus>;
  configureProviderGatewayClient: (
    target: ProviderGatewayClientSetupTarget,
  ) => Promise<ProviderGatewayClientSetupResult>;
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
  getSessionTokenUsage: (sessionId: string) => Promise<SessionTokenUsageResult>;
  clearHistoryStore: () => Promise<HistoryDiagnostics>;
  installIntegrationHooks: (
    agentId: IntegrationAgentId,
  ) => Promise<IntegrationInstallResult>;
  onOpenSettings: (handler: () => void) => () => void;
  onFocusSession: (handler: (sessionId: string) => void) => () => void;
  openExternalTarget: (target: string) => Promise<string>;
  writeClipboardText: (text: string) => Promise<void>;
  jumpToSessionTarget: (target: SessionJumpTarget | undefined) => Promise<
    { ok: true; mode: "precise" | "activate_app" } | { ok: false; error: string }
  >;
  respondToPendingAction: (sessionId: string, actionId: string, option: string) => void;
  onActionResponseResult: (handler: (result: { sessionId: string; actionId: string; result: "success" | "error"; option: string; error?: string }) => void) => () => void;
  sendMessage: (sessionId: string, text: string) => void;
  onSendMessageResult: (handler: (result: { sessionId: string; result: "success" | "error"; error?: string }) => void) => () => void;
  getSessionCapabilities: (sessionId: string) => Promise<SessionCapabilityManifest | null>;
  executeSessionAction: (sessionId: string, actionType: SessionActionType, payload?: { text?: string }) => Promise<{ ok: boolean; action: string; sessionId: string; error?: string }>;
  deleteSession: (sessionId: string) => Promise<boolean>;
};

declare global {
  interface Window {
    codepal: CodePalApi;
  }
}

export {};
