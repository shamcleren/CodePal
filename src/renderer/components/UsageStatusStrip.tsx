import claudeAppIcon from "../assets/claude-app-icon.png";
import codebuddyAppIcon from "../assets/codebuddy-app-icon.png";
import codexAppIcon from "../assets/codex-app-icon.png";
import cursorAppIcon from "../assets/cursor-app-icon.png";
import type { UsageOverview } from "../../shared/usageTypes";
import type { UsageDisplaySettings } from "../usageDisplaySettings";
import { useI18n, translateWindowLabel } from "../i18n";

type UsageStatusStripProps = {
  overview: UsageOverview | null;
  settings: UsageDisplaySettings;
};

type UsageAgentSummary = {
  agent: string;
  label: string;
  iconSrc: string;
  segments: Array<{
    text: string;
    tone: "primary" | "secondary";
  }>;
  resetHints: string[];
};

function formatPercent(value: number | undefined): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function toRemainingPercent(usedPercent: number | undefined): string | null {
  return formatPercent(typeof usedPercent === "number" ? 100 - usedPercent : undefined);
}

function formatResetTime(
  resetAt: number | undefined,
  i18n: ReturnType<typeof useI18n>,
): string | null {
  if (typeof resetAt !== "number" || Number.isNaN(resetAt)) {
    return null;
  }

  return i18n.formatDateTime(resetAt * 1000, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function summarizeCodex(
  overview: UsageOverview,
  settings: UsageDisplaySettings,
  i18n: ReturnType<typeof useI18n>,
): UsageAgentSummary | null {
  const limits = overview.summary.rateLimits.filter((item) => item.agent === "codex");
  if (limits.length === 0) {
    return null;
  }

  const segments = limits
    .map((limit) => {
      const percent = toRemainingPercent(limit.usedPercent);
      const windowLabel = translateWindowLabel(limit.windowLabel, i18n.t);
      const resetTime = formatResetTime(limit.resetAt, i18n);
      if (!percent) {
        return null;
      }
      if (settings.density === "detailed" && resetTime) {
        return [
          { text: `${windowLabel} ${percent}`, tone: "primary" as const },
          { text: resetTime, tone: "secondary" as const },
        ];
      }
      return [{ text: `${windowLabel} ${percent}`, tone: "primary" as const }];
    })
    .flat()
    .filter((part): part is { text: string; tone: "primary" | "secondary" } => Boolean(part));
  const resetHints = limits
    .map((limit) => {
      const resetTime = formatResetTime(limit.resetAt, i18n);
      return resetTime
        ? i18n.t("usage.reset", {
            label: translateWindowLabel(limit.windowLabel, i18n.t),
            time: resetTime,
          })
        : null;
    })
    .filter((part): part is string => Boolean(part));

  if (segments.length === 0) {
    return null;
  }

  return {
    agent: "codex",
    label: "Codex",
    iconSrc: codexAppIcon,
    segments,
    resetHints,
  };
}

function summarizeClaude(
  overview: UsageOverview,
  settings: UsageDisplaySettings,
  i18n: ReturnType<typeof useI18n>,
): UsageAgentSummary | null {
  const limits = overview.summary.rateLimits.filter((item) => item.agent === "claude");
  if (limits.length === 0) {
    return null;
  }
  const segments = limits
    .map((limit) => {
      const percent = toRemainingPercent(limit.usedPercent);
      const windowLabel = translateWindowLabel(limit.windowLabel, i18n.t);
      const resetTime = formatResetTime(limit.resetAt, i18n);
      if (!percent) {
        return null;
      }
      if (settings.density === "detailed" && resetTime) {
        return [
          { text: `${windowLabel} ${percent}`, tone: "primary" as const },
          { text: resetTime, tone: "secondary" as const },
        ];
      }
      return [{ text: `${windowLabel} ${percent}`, tone: "primary" as const }];
    })
    .flat()
    .filter((part): part is { text: string; tone: "primary" | "secondary" } => Boolean(part));
  const resetHints = limits
    .map((limit) => {
      const resetTime = formatResetTime(limit.resetAt, i18n);
      return resetTime
        ? i18n.t("usage.reset", {
            label: translateWindowLabel(limit.windowLabel, i18n.t),
            time: resetTime,
          })
        : null;
    })
    .filter((part): part is string => Boolean(part));

  if (segments.length === 0) {
    return null;
  }

  return {
    agent: "claude",
    label: "Claude",
    iconSrc: claudeAppIcon,
    segments,
    resetHints,
  };
}

function summarizeCursor(
  overview: UsageOverview,
  settings: UsageDisplaySettings,
  i18n: ReturnType<typeof useI18n>,
): UsageAgentSummary | null {
  const limit = overview.summary.rateLimits.find((item) => item.agent === "cursor");
  if (!limit) {
    return null;
  }

  const segments: Array<{ text: string; tone: "primary" | "secondary" }> = [];
  if (limit.remaining !== undefined && limit.limit !== undefined) {
    const usedAmount = limit.limit - limit.remaining;
    if (limit.planType === "usd-cents") {
      segments.push({
        text: `${formatCompactUsdCents(usedAmount)} / ${formatCompactAmount(limit.limit)}`,
        tone: "primary",
      });
    } else {
      segments.push({ text: `${usedAmount} / ${limit.limit}`, tone: "primary" });
    }
  }
  const percent = toRemainingPercent(limit.usedPercent);
  if (percent) {
    const resetTime = formatResetTime(limit.resetAt, i18n);
    if (settings.density === "detailed" && resetTime) {
      segments.push({ text: percent, tone: "primary" });
      segments.push({ text: resetTime, tone: "secondary" });
    } else {
      segments.push({ text: percent, tone: "primary" });
    }
  }
  if (segments.length === 0) {
    return null;
  }

  return {
    agent: "cursor",
    label: "Cursor",
    iconSrc: cursorAppIcon,
    segments,
    resetHints: (() => {
      const resetTime = formatResetTime(limit.resetAt, i18n);
      return resetTime ? [i18n.t("usage.reset", { label: "", time: resetTime }).trim()] : [];
    })(),
  };
}

function summarizeCodeBuddy(
  overview: UsageOverview,
  settings: UsageDisplaySettings,
  i18n: ReturnType<typeof useI18n>,
): UsageAgentSummary | null {
  const limits = overview.summary.rateLimits.filter((item) => item.agent === "codebuddy");
  if (limits.length === 0) {
    return null;
  }

  const segments: Array<{ text: string; tone: "primary" | "secondary" }> = [];
  const resetHints: string[] = [];

  for (const limit of limits) {
    const label = translateWindowLabel(limit.windowLabel, i18n.t);
    const remainingPercent =
      typeof limit.remaining === "number" && typeof limit.limit === "number" && limit.limit > 0
        ? Math.round((limit.remaining / limit.limit) * 100)
        : toRemainingPercent(limit.usedPercent)
          ? Number.parseInt(toRemainingPercent(limit.usedPercent) ?? "", 10)
          : null;

    if (remainingPercent !== null && Number.isFinite(remainingPercent)) {
      segments.push({ text: `${label} ${remainingPercent}%`, tone: "primary" });
    }

    const resetTime = formatResetTime(limit.resetAt, i18n);
    if (settings.density === "detailed" && resetTime) {
      segments.push({ text: resetTime, tone: "secondary" });
    }

    if (resetTime) {
      resetHints.push(i18n.t("usage.reset", { label, time: resetTime }));
    }
    if (remainingPercent !== null && Number.isFinite(remainingPercent)) {
      resetHints.push(i18n.t("usage.remaining", { label, value: `${remainingPercent}%` }));
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return {
    agent: "codebuddy",
    label: "CodeBuddy",
    iconSrc: codebuddyAppIcon,
    segments,
    resetHints,
  };
}

function formatCompactUsdCents(value: number): string {
  return `$${formatCompactAmount(value)}`;
}

function formatCompactAmount(value: number): string {
  const dollars = value / 100;
  const integer = Math.round(dollars);
  if (Math.abs(dollars - integer) < 0.001) {
    return `${integer}`;
  }
  return dollars.toFixed(2);
}

function buildSummaries(
  overview: UsageOverview | null,
  settings: UsageDisplaySettings,
  i18n: ReturnType<typeof useI18n>,
): UsageAgentSummary[] {
  if (!overview) {
    return [];
  }

  return [
    summarizeClaude(overview, settings, i18n),
    summarizeCodex(overview, settings, i18n),
    summarizeCodeBuddy(overview, settings, i18n),
    summarizeCursor(overview, settings, i18n),
  ].filter((item): item is UsageAgentSummary => item !== null);
}

export function UsageStatusStrip({ overview, settings }: UsageStatusStripProps) {
  const i18n = useI18n();
  if (!settings.showInStatusBar) {
    return null;
  }

  const summaries = buildSummaries(overview, settings, i18n).filter(
    (item) => !settings.hiddenAgents.includes(item.agent as "claude" | "codex" | "cursor" | "codebuddy"),
  );

  if (summaries.length === 0) {
    return null;
  }

  return (
    <div className="usage-strip" aria-label="Usage status">
      {summaries.map((summary) => (
        <div
          key={summary.agent}
          className="usage-strip__agent"
          title={summary.resetHints.length > 0 ? summary.resetHints.join(" | ") : undefined}
        >
          <span className="usage-strip__icon" aria-hidden>
            <img src={summary.iconSrc} alt="" className="usage-strip__icon-img" />
          </span>
          <span className="usage-strip__label">{summary.label}</span>
          {summary.segments.map((segment, index) => (
            <span
              key={`${summary.agent}:${segment.tone}:${segment.text}:${index}`}
              className={
                segment.tone === "primary"
                  ? "usage-strip__value usage-strip__value--primary"
                  : "usage-strip__value usage-strip__value--secondary"
              }
            >
              {segment.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
