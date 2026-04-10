import type { ClaudeQuotaDiagnostics } from "../../shared/claudeQuotaTypes";
import type { UsageOverview } from "../../shared/usageTypes";
import { useI18n } from "../i18n";

type ClaudeQuotaPanelProps = {
  overview: UsageOverview | null;
  diagnostics: ClaudeQuotaDiagnostics | null;
  loading: boolean;
  onRefresh: () => void;
};

function hasClaudeQuotaSnapshot(overview: UsageOverview | null): boolean {
  return (overview?.summary.rateLimits ?? []).some((item) => item.agent === "claude");
}

export function ClaudeQuotaPanel({
  overview,
  diagnostics,
  loading,
  onRefresh,
}: ClaudeQuotaPanelProps) {
  const i18n = useI18n();
  const hasSnapshot = hasClaudeQuotaSnapshot(overview);
  const connected = diagnostics?.state === "connected";
  const reconnectRequired = diagnostics?.state === "expired";
  const actionLabel =
    loading
      ? i18n.t("claudeQuota.refreshing")
      : reconnectRequired
        ? i18n.t("claudeQuota.relogin")
        : connected
          ? i18n.t("claudeQuota.refresh")
          : i18n.t("claudeQuota.refresh");

  const summary = hasSnapshot
    ? i18n.t("claudeQuota.summary.synced")
    : i18n.t("claudeQuota.summary.missing");
  const helper = connected || reconnectRequired
    ? i18n.t("claudeQuota.helper.connected")
    : i18n.t("claudeQuota.helper.login");

  return (
    <div className="display-panel__subsection-block" aria-label={i18n.t("claudeQuota.title")}>
      <div className="display-panel__header">
        <div className="display-panel__title">{i18n.t("claudeQuota.title")}</div>
        <div className="display-panel__subtitle">{i18n.t("claudeQuota.subtitle")}</div>
        <div className="display-panel__subtitle">{helper}</div>
      </div>

      <div className="display-panel__summary">
        <span>{summary}</span>
        <span>
          {i18n.translateMessage(
            diagnostics?.message ?? i18n.t("claudeQuota.message.not_connected"),
            diagnostics?.messageKey,
            diagnostics?.messageParams,
          )}
        </span>
        {diagnostics?.accountEmail ? <span>{diagnostics.accountEmail}</span> : null}
        {diagnostics?.lastSyncAt ? (
          <span>
            {i18n.formatDateTime(diagnostics.lastSyncAt, {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span>{i18n.t("claudeQuota.notSynced")}</span>
        )}
      </div>

      {diagnostics?.debugDetail ? (
        <div className="display-panel__summary">
          <span>{i18n.t("claudeQuota.debugLabel")}</span>
          <span>{diagnostics.debugDetail}</span>
        </div>
      ) : null}

      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh"
          disabled={loading}
          onClick={onRefresh}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
