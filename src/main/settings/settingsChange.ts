import type { AppSettings } from "../../shared/appSettings";

export function shouldApplyHistorySettingsAtRuntime(
  previousSettings: Pick<AppSettings, "history">,
  nextSettings: Pick<AppSettings, "history">,
): boolean {
  return (
    previousSettings.history.detailRetention !== nextSettings.history.detailRetention ||
    previousSettings.history.analyticsRetention !== nextSettings.history.analyticsRetention
  );
}
