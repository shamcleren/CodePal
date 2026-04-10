import type { CursorDashboardDiagnostics } from "../../shared/cursorDashboardTypes";
import { useI18n } from "../i18n";

type CursorDashboardPanelProps = {
  diagnostics: CursorDashboardDiagnostics | null;
  loading: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onClearAuth: () => void;
};

function lastSyncLabel(
  diagnostics: CursorDashboardDiagnostics | null,
  locale: ReturnType<typeof useI18n>,
): string {
  if (!diagnostics?.lastSyncAt) {
    return locale.t("cursor.notSynced");
  }
  return locale.formatDateTime(diagnostics.lastSyncAt, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CursorDashboardPanel({
  diagnostics,
  loading,
  onConnect,
  onRefresh,
  onClearAuth,
}: CursorDashboardPanelProps) {
  const i18n = useI18n();
  const connected = diagnostics?.state === "connected";
  const reconnectRequired = diagnostics?.state === "expired";
  const actionLabel = connected
    ? loading
      ? i18n.t("cursor.refreshing")
      : i18n.t("cursor.refresh")
    : reconnectRequired
      ? loading
        ? i18n.t("cursor.reloggingIn")
        : i18n.t("cursor.relogin")
      : loading
        ? i18n.t("cursor.loggingIn")
        : i18n.t("cursor.login");

  return (
    <div className="display-panel__subsection-block" aria-label={i18n.t("cursor.title")}>
      <div className="display-panel__header">
        <div className="display-panel__title">{i18n.t("cursor.title")}</div>
        <div className="display-panel__subtitle">{i18n.t("cursor.subtitle")}</div>
      </div>

      <div className="display-panel__summary">
        <span>{i18n.translateMessage(diagnostics?.message ?? i18n.t("cursor.notConnected"), diagnostics?.messageKey, diagnostics?.messageParams)}</span>
        {diagnostics?.teamId ? <span>{`Team ${diagnostics.teamId}`}</span> : null}
        <span>{lastSyncLabel(diagnostics, i18n)}</span>
      </div>

      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh"
          disabled={loading}
          onClick={connected ? onRefresh : onConnect}
        >
          {actionLabel}
        </button>
        {connected || reconnectRequired ? (
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            disabled={loading}
            onClick={onClearAuth}
          >
            {i18n.t("cursor.clearAuth")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
