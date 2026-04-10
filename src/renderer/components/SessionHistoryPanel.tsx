import { useI18n } from "../i18n";

type SessionHistoryPanelProps = {
  loading: boolean;
  onClearHistory: () => void;
};

export function SessionHistoryPanel({
  loading,
  onClearHistory,
}: SessionHistoryPanelProps) {
  const { t } = useI18n();

  return (
    <div className="display-panel__subsection-block" aria-label={t("sessionHistory.title")}>
      <div className="display-panel__header">
        <div className="display-panel__title">{t("sessionHistory.title")}</div>
        <div className="display-panel__subtitle">{t("sessionHistory.subtitle")}</div>
      </div>

      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh integration-panel__refresh--secondary"
          disabled={loading}
          onClick={onClearHistory}
        >
          {loading ? t("sessionHistory.clearing") : t("sessionHistory.clear")}
        </button>
      </div>
    </div>
  );
}
