import type { CodeBuddyQuotaDiagnostics } from "../../shared/codebuddyQuotaTypes";
import { useI18n } from "../i18n";

type CodeBuddyQuotaPanelProps = {
  diagnostics: CodeBuddyQuotaDiagnostics | null;
  loading: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onClearAuth: () => void;
};

function lastSyncLabel(
  diagnostics: CodeBuddyQuotaDiagnostics | null,
  locale: ReturnType<typeof useI18n>,
): string {
  if (!diagnostics?.lastSyncAt) {
    return locale.t("codebuddy.notSynced");
  }
  return locale.formatDateTime(diagnostics.lastSyncAt, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CodeBuddyQuotaPanel({
  diagnostics,
  loading,
  onConnect,
  onRefresh,
  onClearAuth,
}: CodeBuddyQuotaPanelProps) {
  const i18n = useI18n();
  const connected = diagnostics?.state === "connected";
  const reconnectRequired = diagnostics?.state === "expired";
  const missingConfiguration = !diagnostics?.loginUrl || !diagnostics?.endpoint;
  const label =
    diagnostics?.kind === "internal"
      ? i18n.t("codebuddy.label.internal")
      : diagnostics?.kind === "code"
        ? i18n.t("codebuddy.label.code")
        : diagnostics?.label ?? "CodeBuddy";
  const title = `${label} ${i18n.t("codebuddy.usageSuffix")}`;
  const scopeText =
    diagnostics?.kind === "internal"
      ? i18n.t("codebuddy.subtitle.internal")
      : i18n.t("codebuddy.subtitle.code");
  const actionLabel = connected
    ? loading
      ? i18n.t("codebuddy.refreshing")
      : i18n.t("codebuddy.refresh")
    : missingConfiguration
      ? i18n.t("codebuddy.configureFirst")
    : reconnectRequired
      ? loading
        ? i18n.t("codebuddy.reloggingIn")
        : i18n.t("codebuddy.relogin")
      : loading
        ? i18n.t("codebuddy.loggingIn")
        : i18n.t("codebuddy.login");
  const helperText =
    diagnostics?.kind === "internal"
      ? missingConfiguration
        ? i18n.t("codebuddy.helper.internal.config")
        : connected || reconnectRequired
          ? i18n.t("codebuddy.helper.internal.connected")
          : i18n.t("codebuddy.helper.internal.login")
      : missingConfiguration
        ? i18n.t("codebuddy.helper.code.config")
        : connected || reconnectRequired
          ? i18n.t("codebuddy.helper.code.connected")
          : i18n.t("codebuddy.helper.code.login");

  return (
    <div className="display-panel__subsection-block" aria-label={title}>
      <div className="display-panel__header">
        <div className="display-panel__title">{title}</div>
        <div className="display-panel__subtitle">{scopeText}</div>
        <div className="display-panel__subtitle">{helperText}</div>
      </div>

      <div className="display-panel__summary">
        <span>{i18n.translateMessage(diagnostics?.message ?? i18n.t("codebuddy.message.not_connected", { label: label }), diagnostics?.messageKey, diagnostics?.messageParams)}</span>
        <span>{lastSyncLabel(diagnostics, i18n)}</span>
      </div>

      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh"
          disabled={loading || missingConfiguration}
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
            {i18n.t("codebuddy.clearAuth")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
