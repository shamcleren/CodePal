import { isValidElement } from "react";
import type { ReactNode } from "react";
import { createI18nValue, resolveLocale } from "../i18n";
import { UsageStatusStrip, hasVisibleUsageStatus } from "./UsageStatusStrip";

type StatusBarProps = {
  usage?: ReactNode;
};

export function StatusBar({ usage }: StatusBarProps) {
  if (!usage) {
    return null;
  }

  if (
    isValidElement(usage) &&
    usage.type === UsageStatusStrip &&
    !hasVisibleUsageStatus(
      usage.props.overview,
      usage.props.settings,
      createI18nValue(resolveLocale("system")),
    )
  ) {
    return null;
  }

  return (
    <section className="status-bar" aria-label="Usage summary">
      <div className="status-bar__usage">
        {usage}
      </div>
    </section>
  );
}
