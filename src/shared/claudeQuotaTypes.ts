import type { MessageParams } from "./i18nTypes";

export interface ClaudeQuotaDiagnostics {
  state:
    | "connected"
    | "not_connected"
    | "error"
    | "expired";
  message: string;
  messageKey?: string;
  messageParams?: MessageParams;
  accountEmail?: string;
  organizationName?: string;
  billingType?: string;
  source?: "statusline-derived";
  lastSyncAt?: number;
  debugDetail?: string;
}

export interface ClaudeQuotaSyncResult {
  diagnostics: ClaudeQuotaDiagnostics;
  synced: boolean;
}
