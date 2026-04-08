import type { MessageParams } from "./i18nTypes";

export interface CodeBuddyQuotaDiagnostics {
  kind?: "code" | "internal";
  label?: string;
  state: "connected" | "not_connected" | "error" | "expired";
  message: string;
  messageKey?: string;
  messageParams?: MessageParams;
  endpoint: string;
  loginUrl?: string;
  lastSyncAt?: number;
}

export interface CodeBuddyQuotaConnectResult {
  diagnostics: CodeBuddyQuotaDiagnostics;
  synced: boolean;
}
