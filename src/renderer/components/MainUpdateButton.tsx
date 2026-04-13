import type { AppUpdateState } from "../../shared/updateTypes";
import { useI18n } from "../i18n";

type MainUpdateButtonProps = {
  state: AppUpdateState | null;
  busy: boolean;
  onOpenMaintenance: () => void;
  onInstall: () => void;
};

function formatPercent(value: number | null): string | null {
  return value == null ? null : `${Math.round(value)}%`;
}

export function MainUpdateButton({
  state,
  busy,
  onOpenMaintenance,
  onInstall,
}: MainUpdateButtonProps) {
  const { t } = useI18n();

  if (!state?.supported) {
    return null;
  }

  let label: string | null = null;
  let tone = "neutral";
  let onClick = onOpenMaintenance;

  if (state.phase === "available" && state.availableVersion) {
    label = t("update.main.available", { version: state.availableVersion });
  } else if (state.phase === "downloading") {
    const percent = formatPercent(state.downloadPercent);
    label = percent
      ? t("update.main.downloading", { percent })
      : t("update.main.downloadingNoPercent");
  } else if (state.phase === "downloaded") {
    label = t("update.main.downloaded");
    onClick = onInstall;
  } else if (state.phase === "error") {
    label = t("update.main.error");
    tone = "error";
  }

  if (!label) {
    return null;
  }

  return (
    <button
      type="button"
      className={`app-update-button app-update-button--${tone}`}
      disabled={busy && state.phase !== "error"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
