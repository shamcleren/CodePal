export interface CursorDashboardDiagnostics {
  state: "connected" | "not_connected" | "error" | "expired";
  message: string;
  teamId?: string;
  lastSyncAt?: number;
}

export interface CursorDashboardConnectResult {
  diagnostics: CursorDashboardDiagnostics;
  synced: boolean;
}
