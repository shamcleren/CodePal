import type { UsageAgentId, UsageDisplaySettings } from "../usageDisplaySettings";
import type { AppLocale } from "../../shared/i18nTypes";
import { useI18n } from "../i18n";

type DisplayPreferencesPanelProps = {
  settings: UsageDisplaySettings;
  onToggleStrip: (nextValue: boolean) => void;
  onToggleAgent: (agent: UsageAgentId) => void;
  onDensityChange: (nextValue: UsageDisplaySettings["density"]) => void;
  localeSetting: AppLocale;
  onLocaleChange: (nextValue: AppLocale) => void;
  showHeader?: boolean;
};

const AGENTS: Array<{ id: UsageAgentId; label: string }> = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "codebuddy", label: "CodeBuddy" },
];

export function DisplayPreferencesPanel({
  settings,
  onToggleStrip,
  onToggleAgent,
  onDensityChange,
  localeSetting,
  onLocaleChange,
  showHeader = true,
}: DisplayPreferencesPanelProps) {
  const { t } = useI18n();

  return (
    <section className="display-panel" aria-label={t("display.section")}>
      {showHeader ? (
        <div className="display-panel__header">
          <div className="display-panel__title">{t("display.title")}</div>
          <div className="display-panel__subtitle">{t("display.subtitle")}</div>
        </div>
      ) : null}

      <div className="display-panel__grid">
        <div className="display-panel__card">
          <div className="display-panel__title">{t("display.panel.title")}</div>
          <label className="display-panel__toggle">
            <input
              type="checkbox"
              checked={settings.showInStatusBar}
              onChange={(event) => onToggleStrip(event.target.checked)}
            />
            <span>{t("display.showQuota")}</span>
          </label>
        </div>

        <div className="display-panel__card">
          <div className="display-panel__title">{t("display.agents.title")}</div>
          <div className="display-panel__agents">
            {AGENTS.map((agent) => (
              <label key={agent.id} className="display-panel__toggle">
                <input
                  type="checkbox"
                  checked={!settings.hiddenAgents.includes(agent.id)}
                  onChange={() => onToggleAgent(agent.id)}
                />
                <span>{agent.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="display-panel__card">
          <div className="display-panel__title">{t("display.density.title")}</div>
          <div className="display-panel__agents">
            <label className="display-panel__toggle">
              <input
                type="radio"
                name="usage-density"
                checked={settings.density === "compact"}
                onChange={() => onDensityChange("compact")}
              />
              <span>{t("display.density.compact")}</span>
            </label>
            <label className="display-panel__toggle">
              <input
                type="radio"
                name="usage-density"
                checked={settings.density === "detailed"}
                onChange={() => onDensityChange("detailed")}
              />
              <span>{t("display.density.detailed")}</span>
            </label>
          </div>
        </div>

        <div className="display-panel__card">
          <div className="display-panel__title">{t("display.language.title")}</div>
          <div className="display-panel__agents">
            {(["system", "en", "zh-CN"] as const).map((locale) => (
              <label key={locale} className="display-panel__toggle">
                <input
                  type="radio"
                  name="app-locale"
                  checked={localeSetting === locale}
                  onChange={() => onLocaleChange(locale)}
                />
                <span>{t(`display.language.${locale}`)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
