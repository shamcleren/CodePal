import { useI18n } from "../i18n";

type SupportPanelProps = {
  diagnosticsReport: string;
  onCopyDiagnostics: () => void;
  onOpenPrivacy: () => void;
  onOpenSupportScope: () => void;
  onOpenTroubleshooting: () => void;
  onOpenIssues: () => void;
  showHeader?: boolean;
};

export function SupportPanel({
  diagnosticsReport,
  onCopyDiagnostics,
  onOpenPrivacy,
  onOpenSupportScope,
  onOpenTroubleshooting,
  onOpenIssues,
  showHeader = true,
}: SupportPanelProps) {
  const { t } = useI18n();

  return (
    <div className="display-panel__subsection-block" aria-label={t("support.title")}>
      {showHeader ? (
        <div className="display-panel__header">
          <div className="display-panel__title">{t("support.title")}</div>
          <div className="display-panel__subtitle">{t("support.subtitle")}</div>
        </div>
      ) : null}
      <div className="display-panel__actions support-panel__actions">
        <button type="button" className="integration-panel__refresh" onClick={onCopyDiagnostics}>
          {t("support.copyDiagnostics")}
        </button>
        <button
          type="button"
          className="integration-panel__refresh integration-panel__refresh--secondary"
          onClick={onOpenIssues}
        >
          {t("support.reportIssue")}
        </button>
      </div>
      <div className="display-panel__summary">
        <span>{t("support.summary")}</span>
      </div>
      <div className="display-panel__actions support-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh integration-panel__refresh--secondary"
          onClick={onOpenPrivacy}
        >
          {t("support.privacy")}
        </button>
        <button
          type="button"
          className="integration-panel__refresh integration-panel__refresh--secondary"
          onClick={onOpenSupportScope}
        >
          {t("support.scope")}
        </button>
        <button
          type="button"
          className="integration-panel__refresh integration-panel__refresh--secondary"
          onClick={onOpenTroubleshooting}
        >
          {t("support.troubleshooting")}
        </button>
      </div>
      <details className="display-panel__details">
        <summary className="display-panel__details-summary">{t("support.preview")}</summary>
        <pre className="display-panel__diagnostics">{diagnosticsReport}</pre>
      </details>
    </div>
  );
}
