import type { NotificationSettings } from "../../shared/appSettings";
import { useI18n } from "../i18n";

type NotificationPreferencesPanelProps = {
  settings: NotificationSettings;
  onUpdate: (patch: Partial<NotificationSettings>) => void;
  showHeader?: boolean;
};

const STATE_TOGGLES: Array<{
  key: keyof Pick<NotificationSettings, "completed" | "waiting" | "error" | "resumed">;
  i18nKey: string;
}> = [
  { key: "completed", i18nKey: "notifications.completed" },
  { key: "waiting", i18nKey: "notifications.waiting" },
  { key: "error", i18nKey: "notifications.error" },
  { key: "resumed", i18nKey: "notifications.resumed" },
];

export function NotificationPreferencesPanel({
  settings,
  onUpdate,
  showHeader = true,
}: NotificationPreferencesPanelProps) {
  const { t } = useI18n();

  return (
    <section className="display-panel" aria-label={t("notifications.section")}>
      {showHeader ? (
        <div className="display-panel__header">
          <div className="display-panel__title">{t("notifications.title")}</div>
          <div className="display-panel__subtitle">{t("notifications.subtitle")}</div>
        </div>
      ) : null}

      <div className="display-panel__grid">
        <div className="display-panel__card">
          <label className="display-panel__toggle">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => onUpdate({ enabled: event.target.checked })}
            />
            <span>{t("notifications.enabled")}</span>
          </label>
        </div>

        {settings.enabled ? (
          <>
            <div className="display-panel__card">
              <label className="display-panel__toggle">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(event) => onUpdate({ soundEnabled: event.target.checked })}
                />
                <span>{t("notifications.soundEnabled")}</span>
              </label>
            </div>

            <div className="display-panel__card">
              <div className="display-panel__agents">
                {STATE_TOGGLES.map(({ key, i18nKey }) => (
                  <label key={key} className="display-panel__toggle">
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(event) => onUpdate({ [key]: event.target.checked })}
                    />
                    <span>{t(i18nKey)}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
