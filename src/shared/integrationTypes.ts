import type { SessionStatus } from "./sessionTypes";

export type IntegrationAgentId = "claude" | "cursor" | "codebuddy" | "codex";

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
  actionLabel: string;
  statusMessage: string;
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
  diagnostics: IntegrationAgentDiagnostics;
}
