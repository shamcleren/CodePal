import {
  HISTORY_RETENTION_PRESETS,
  type HistoryRetentionPreset,
  type HistorySettings,
} from "../../shared/appSettings";
import type { HistoryDiagnostics } from "../../shared/historyTypes";
import { useI18n } from "../i18n";

type HistorySettingsPanelProps = {
  settings: HistorySettings;
  diagnostics: HistoryDiagnostics | null;
  loading: boolean;
  sessionHistoryLoading?: boolean;
  onUpdate: (patch: Partial<HistorySettings>) => void;
  onClear: () => void;
  onClearSessionHistory?: () => void;
};

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

export function HistorySettingsPanel({
  settings,
  diagnostics,
  loading,
  sessionHistoryLoading = false,
  onUpdate,
  onClear,
  onClearSessionHistory,
}: HistorySettingsPanelProps) {
  const { t, formatDateTime } = useI18n();

  function retentionLabel(preset: HistoryRetentionPreset): string {
    return t(`history.retention.${preset}`);
  }

  return (
    <div className="display-panel__subsection-block" aria-label={t("history.title")}>
      <div className="display-panel__header">
        <div className="display-panel__title">{t("history.title")}</div>
        <div className="display-panel__subtitle">{t("history.subtitle")}</div>
      </div>

      <label className="display-panel__toggle">
        <input
          type="checkbox"
          checked={settings.persistenceEnabled}
          onChange={(event) => onUpdate({ persistenceEnabled: event.target.checked })}
        />
        <span>{t("history.persistence")}</span>
      </label>

      <div className="display-panel__agents">
        <label className="display-panel__toggle">
          <span>{t("history.detailRetention")}</span>
          <select
            value={settings.detailRetention}
            onChange={(event) =>
              onUpdate({ detailRetention: event.target.value as HistoryRetentionPreset })
            }
          >
            {HISTORY_RETENTION_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {retentionLabel(preset)}
              </option>
            ))}
          </select>
        </label>
        <label className="display-panel__toggle">
          <span>{t("history.analyticsRetention")}</span>
          <select
            value={settings.analyticsRetention}
            onChange={(event) =>
              onUpdate({ analyticsRetention: event.target.value as HistoryRetentionPreset })
            }
          >
            {HISTORY_RETENTION_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {retentionLabel(preset)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="display-panel__summary">
        <span>{t("history.currentSize", { value: formatBytes(diagnostics?.dbSizeBytes ?? 0) })}</span>
        <span>{t("history.sessions", { value: diagnostics?.estimatedSessionCount ?? 0 })}</span>
        <span>{t("history.events", { value: diagnostics?.estimatedActivityCount ?? 0 })}</span>
        <span>{t("history.storeState", { value: diagnostics?.enabled ? t("history.enabled") : t("history.disabled") })}</span>
        <span>
          {t("history.lastCleanup", {
            value: diagnostics?.lastCleanupAt ? formatDateTime(diagnostics.lastCleanupAt) : t("history.notYet"),
          })}
        </span>
      </div>

      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh integration-panel__refresh--secondary"
          disabled={loading}
          onClick={onClear}
        >
          {loading ? t("history.clearing") : t("history.clear")}
        </button>
        {onClearSessionHistory ? (
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            disabled={sessionHistoryLoading}
            onClick={onClearSessionHistory}
          >
            {sessionHistoryLoading ? t("sessionHistory.clearing") : t("sessionHistory.clear")}
          </button>
        ) : null}
      </div>
      <div className="display-panel__summary">
        <span>{t("history.clearHelp")}</span>
        {onClearSessionHistory ? <span>{t("sessionHistory.subtitle")}</span> : null}
      </div>
    </div>
  );
}
