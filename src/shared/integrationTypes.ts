import type { SessionStatus } from "./sessionTypes";
import type { MessageParams } from "./i18nTypes";

export type IntegrationAgentId = "claude" | "cursor" | "codebuddy" | "codex" | "claude-internal" | "codex-internal";

export type IntegrationHealth =
  | "active"
  | "repair_needed"
  | "not_configured"
  | "legacy_path";

export interface IntegrationListenerDiagnostics {
  mode: "tcp" | "socket" | "unavailable";
  host?: string;
  port?: number;
  socketPath?: string;
  message?: string;
}

export interface IntegrationRuntimeDiagnostics {
  packaged: boolean;
  hookScriptsRoot: string;
  executablePath: string;
  executableLabel: string;
}

export interface IntegrationAgentDiagnostics {
  id: IntegrationAgentId;
  label: string;
  supported: boolean;
  configPath: string;
  configExists: boolean;
  hookScriptPath: string;
  hookScriptExists: boolean;
  hookInstalled: boolean;
  health: IntegrationHealth;
  healthLabel: string;
  healthLabelKey?: string;
  actionLabel: string;
  actionLabelKey?: string;
  statusMessage: string;
  statusMessageKey?: string;
  statusMessageParams?: MessageParams;
  lastEventAt?: number;
  lastEventStatus?: SessionStatus;
}

export interface IntegrationDiagnostics {
  listener: IntegrationListenerDiagnostics;
  runtime: IntegrationRuntimeDiagnostics;
  agents: IntegrationAgentDiagnostics[];
}

export interface IntegrationInstallResult {
  agentId: IntegrationAgentId;
  configPath: string;
  changed: boolean;
  hookInstalled: boolean;
  health: IntegrationHealth;
  backupPath?: string;
  message: string;
  messageKey?: string;
  messageParams?: MessageParams;
  diagnostics: IntegrationAgentDiagnostics;
}
