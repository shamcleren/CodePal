import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import type { HistorySettings } from "../../shared/appSettings";
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

type HistoryNumberField = "retentionDays" | "maxStorageMb";

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

export function commitHistoryNumberDraft(
  draft: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const trimmed = draft.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
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
  const [drafts, setDrafts] = useState({
    retentionDays: String(settings.retentionDays),
    maxStorageMb: String(settings.maxStorageMb),
  });

  useEffect(() => {
    setDrafts({
      retentionDays: String(settings.retentionDays),
      maxStorageMb: String(settings.maxStorageMb),
    });
  }, [settings.maxStorageMb, settings.retentionDays]);

  function setDraft(field: HistoryNumberField, value: string) {
    setDrafts((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function commitDraft(field: HistoryNumberField) {
    const nextValue =
      field === "retentionDays"
        ? commitHistoryNumberDraft(drafts.retentionDays, settings.retentionDays, 1, 30)
        : commitHistoryNumberDraft(drafts.maxStorageMb, settings.maxStorageMb, 10, 1024);

    setDraft(field, String(nextValue));

    if (field === "retentionDays") {
      if (nextValue !== settings.retentionDays) {
        onUpdate({ retentionDays: nextValue });
      }
      return;
    }

    if (nextValue !== settings.maxStorageMb) {
      onUpdate({ maxStorageMb: nextValue });
    }
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>, field: HistoryNumberField) {
    if (event.key === "Enter") {
      commitDraft(field);
      event.currentTarget.blur();
    }
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
          <span>{t("history.retentionDays")}</span>
          <input
            type="number"
            min={1}
            max={30}
            value={drafts.retentionDays}
            onChange={(event) => setDraft("retentionDays", event.target.value)}
            onBlur={() => commitDraft("retentionDays")}
            onKeyDown={(event) => handleDraftKeyDown(event, "retentionDays")}
          />
        </label>
        <label className="display-panel__toggle">
          <span>{t("history.maxStorageMb")}</span>
          <input
            type="number"
            min={10}
            max={1024}
            value={drafts.maxStorageMb}
            onChange={(event) => setDraft("maxStorageMb", event.target.value)}
            onBlur={() => commitDraft("maxStorageMb")}
            onKeyDown={(event) => handleDraftKeyDown(event, "maxStorageMb")}
          />
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
