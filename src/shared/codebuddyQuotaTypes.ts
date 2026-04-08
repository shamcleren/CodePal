export interface CodeBuddyQuotaDiagnostics {
  kind?: "code" | "internal";
  label?: string;
  state: "connected" | "not_connected" | "error" | "expired";
  message: string;
  endpoint: string;
  loginUrl?: string;
  lastSyncAt?: number;
}

export interface CodeBuddyQuotaConnectResult {
  diagnostics: CodeBuddyQuotaDiagnostics;
  synced: boolean;
}
