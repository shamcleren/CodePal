import type { ReportSettings } from "../../shared/appSettings";
import { useI18n } from "../i18n";

type ReportPreferencesPanelProps = {
  settings: ReportSettings;
  onUpdate: (patch: Partial<ReportSettings>) => void;
  showHeader?: boolean;
};

export function ReportPreferencesPanel({
  settings,
  onUpdate,
  showHeader = true,
}: ReportPreferencesPanelProps) {
  const { t } = useI18n();

  return (
    <section className="display-panel" aria-label={t("reports.section")}>
      {showHeader ? (
        <div className="display-panel__header">
          <div className="display-panel__title">{t("reports.title")}</div>
          <div className="display-panel__subtitle">{t("reports.subtitle")}</div>
        </div>
      ) : null}

      <div className="display-panel__grid">
        <div className="display-panel__card">
          <label className="display-panel__toggle">
            <input
              type="checkbox"
              checked={settings.llmEnabled}
              onChange={(event) => onUpdate({ llmEnabled: event.target.checked })}
            />
            <span>{t("reports.llmEnabled")}</span>
          </label>
        </div>

        {settings.llmEnabled ? (
          <div className="display-panel__card">
            <label className="display-panel__toggle">
              <span>{t("reports.llmDefaultModel")}</span>
            </label>
            <input
              type="text"
              className="report-prefs__model-input"
              value={settings.llmDefaultModel}
              onChange={(event) => onUpdate({ llmDefaultModel: event.target.value })}
              placeholder="claude-haiku-4-5"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
