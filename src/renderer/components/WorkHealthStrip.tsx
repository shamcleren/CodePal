import type { WorkHealthSignal, WorkHealthSignalKind, WorkHealthSummary } from "../../shared/analyticsTypes";
import { useI18n } from "../i18n";

export function WorkHealthStrip({
  summary,
  activeKind,
  onSignalClick,
}: {
  summary: WorkHealthSummary;
  activeKind: WorkHealthSignalKind | null;
  onSignalClick: (signal: WorkHealthSignal) => void;
}) {
  const { t } = useI18n();

  return (
    <section className="work-health-panel" aria-label={t("workHealth.title")}>
      <div className="work-health-panel__header">
        <h3 className="work-health-panel__title">{t("workHealth.title")}</h3>
      </div>
      <div className="work-health-strip">
        {summary.signals.map((signal) => {
          const disabled = Boolean(signal.disabledReason);
          const display = displayCopy(signal, t);
          return (
            <button
              key={signal.kind}
              type="button"
              disabled={disabled}
              title={signal.disabledReason ?? signal.detail}
              className={[
                "work-health-strip__item",
                `work-health-strip__item--${signal.tone}`,
                activeKind === signal.kind ? "work-health-strip__item--active" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => onSignalClick(signal)}
            >
              <span className="work-health-strip__label">{display.label}</span>
              <span className="work-health-strip__value">{signal.value}</span>
              <span className="work-health-strip__detail">{display.detail}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function displayCopy(
  signal: WorkHealthSignal,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const targetCount = signal.sessionIds.length;
  const label = t(`workHealth.signal.${signal.kind}`);
  switch (signal.kind) {
    case "attention":
      return {
        label,
        detail: targetCount > 0
          ? t("workHealth.detail.attention", { count: targetCount })
          : t("workHealth.detail.attentionZero"),
      };
    case "longest_wait":
      return {
        label,
        detail: targetCount > 0
          ? t("workHealth.detail.longestWait")
          : t("workHealth.detail.longestWaitZero"),
      };
    case "unrecovered_failure":
      return {
        label,
        detail: targetCount > 0
          ? t("workHealth.detail.failure", { count: targetCount })
          : t("workHealth.detail.failureZero"),
      };
    case "context_near_full":
      return {
        label,
        detail: targetCount > 0
          ? t("workHealth.detail.context", { count: targetCount })
          : t("workHealth.detail.contextMissing"),
      };
    case "cost_anomaly":
      return {
        label,
        detail: signal.value === "New"
          ? t("workHealth.detail.costNew")
          : t("workHealth.detail.costAnomaly"),
      };
  }
}
