import type { AppUpdateState } from "../../shared/updateTypes";
import { useI18n } from "../i18n";

type UpdatePanelProps = {
  state: AppUpdateState | null;
  busy: boolean;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onSkip: () => void;
  onClearSkipped: () => void;
};

function progressLabel(percent: number | null) {
  return percent == null ? "" : `${percent}%`;
}

export function UpdatePanel({
  state,
  busy,
  onCheck,
  onDownload,
  onInstall,
  onSkip,
  onClearSkipped,
}: UpdatePanelProps) {
  const { t } = useI18n();
  const updateState = state;

  const phase = updateState?.phase ?? "idle";
  const releaseNotes = updateState?.releaseNotes?.trim() ?? "";
  const availableVersion = updateState?.availableVersion ?? "";
  const currentVersion = updateState?.currentVersion ?? "";

  let summary = t("update.summary.idle", { version: currentVersion || "—" });
  if (phase === "checking") {
    summary = t("update.summary.checking");
  } else if (phase === "available") {
    summary = t("update.summary.available", { version: availableVersion });
  } else if (phase === "downloading") {
    summary = t("update.summary.downloading", {
      version: availableVersion,
      percent: progressLabel(updateState?.downloadPercent ?? null),
    });
  } else if (phase === "downloaded") {
    summary = t("update.summary.downloaded", { version: availableVersion });
  } else if (phase === "skipped") {
    summary = t("update.summary.skipped", { version: availableVersion });
  } else if (phase === "error") {
    summary = updateState?.errorMessage || t("update.summary.error");
  }

  return (
    <div className="display-panel__subsection-block" aria-label={t("update.title")}>
      <div className="display-panel__header">
        <div className="display-panel__title">{t("update.title")}</div>
        <div className="display-panel__subtitle">{t("update.subtitle")}</div>
        <div className="display-panel__subtitle">{summary}</div>
        {releaseNotes ? (
          <div className="update-panel__notes">
            <div className="update-panel__notes-title">{t("update.notes")}</div>
            <div className="update-panel__notes-body">{releaseNotes}</div>
          </div>
        ) : null}
      </div>
      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh"
          disabled={busy || phase === "checking" || phase === "downloading"}
          onClick={onCheck}
        >
          {phase === "checking" ? t("update.checking") : t("update.check")}
        </button>
        {(phase === "available" || phase === "skipped" || phase === "downloading") && availableVersion ? (
          <button
            type="button"
            className="integration-panel__refresh"
            disabled={busy}
            onClick={onDownload}
          >
            {phase === "downloading" ? t("update.downloading") : t("update.download")}
          </button>
        ) : null}
        {phase === "downloaded" ? (
          <button
            type="button"
            className="integration-panel__refresh"
            disabled={busy}
            onClick={onInstall}
          >
            {t("update.install")}
          </button>
        ) : null}
        {phase === "available" ? (
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            disabled={busy}
            onClick={onSkip}
          >
            {t("update.skip")}
          </button>
        ) : null}
        {phase === "skipped" ? (
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            disabled={busy}
            onClick={onClearSkipped}
          >
            {t("update.clearSkip")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
