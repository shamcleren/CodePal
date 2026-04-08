import type { MessageParams } from "./i18nTypes";

export interface CursorDashboardDiagnostics {
  state: "connected" | "not_connected" | "error" | "expired";
  message: string;
  messageKey?: string;
  messageParams?: MessageParams;
  teamId?: string;
  lastSyncAt?: number;
}

export interface CursorDashboardConnectResult {
  diagnostics: CursorDashboardDiagnostics;
  synced: boolean;
}
