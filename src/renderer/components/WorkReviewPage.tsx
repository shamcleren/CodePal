import { useEffect, useMemo, useState } from "react";
import { buildDailyWorkReview, type DailyWorkReviewDay, type DailyWorkReviewEntry } from "../dailyWorkReview";
import type { MonitorSessionRow } from "../monitorSession";
import type { SessionHistorySummary } from "../../shared/historyTypes";
import { useI18n } from "../i18n";

type WorkReviewPageProps = {
  sessions: MonitorSessionRow[];
  historySessions?: SessionHistorySummary[];
  now?: number;
  onFocusSession?: (sessionId: string) => void;
};

const SUMMARY_PREVIEW_LIMIT = 4;
const WORK_REVIEW_CLOCK_INTERVAL_MS = 30_000;

function useWorkReviewNow(explicitNow?: number): number {
  const [liveNow, setLiveNow] = useState(() => explicitNow ?? Date.now());

  useEffect(() => {
    if (explicitNow !== undefined) {
      setLiveNow(explicitNow);
      return;
    }
    setLiveNow(Date.now());
    const intervalId = window.setInterval(() => {
      setLiveNow(Date.now());
    }, WORK_REVIEW_CLOCK_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [explicitNow]);

  return explicitNow ?? liveNow;
}

function sourceLabel(entry: DailyWorkReviewEntry, t: (key: string) => string): string {
  return entry.source === "managed"
    ? t("workReview.source.managed")
    : t("workReview.source.observed");
}

function agentLabel(agent: string): string {
  if (!agent.trim()) return "Agent";
  return agent.charAt(0).toUpperCase() + agent.slice(1);
}

function EntryList({
  items,
  emptyLabel,
  onFocusSession,
}: {
  items: DailyWorkReviewEntry[];
  emptyLabel: string;
  onFocusSession?: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <p className="work-review__empty-line">{emptyLabel}</p>;
  }
  return (
    <ul className="work-review__item-list">
      {items.map((entry) => (
        <li key={entry.id} className="work-review__item">
          <div className="work-review__item-main">
            <span className="work-review__item-title">{entry.title}</span>
            {entry.detail ? (
              <span className="work-review__item-detail">{entry.detail}</span>
            ) : null}
          </div>
          <div className="work-review__item-meta">
            <span>{agentLabel(entry.agent)}</span>
            <span>{sourceLabel(entry, t)}</span>
            {entry.latestRunningDurationLabel ? (
              <span>{t("workReview.duration.latestRunning", { duration: entry.latestRunningDurationLabel })}</span>
            ) : null}
            {entry.sessionDurationLabel ? (
              <span>{t("workReview.duration.session", { duration: entry.sessionDurationLabel })}</span>
            ) : null}
            {onFocusSession ? (
              <button
                type="button"
                className="work-review__link-button"
                onClick={() => onFocusSession(entry.id)}
              >
                {t("workReview.openSession")}
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SummaryBlock({
  title,
  count,
  items,
  emptyLabel,
  tone,
  onFocusSession,
}: {
  title: string;
  count: number;
  items: DailyWorkReviewEntry[];
  emptyLabel: string;
  tone: "done" | "active";
  onFocusSession?: (sessionId: string) => void;
}) {
  return (
    <section className={`work-review__summary-block work-review__summary-block--${tone}`}>
      <div className="work-review__summary-head">
        <span>{title}</span>
        <strong>{count}</strong>
      </div>
      <EntryList items={items} emptyLabel={emptyLabel} onFocusSession={onFocusSession} />
    </section>
  );
}

function DayButton({
  day,
  active,
  onClick,
}: {
  day: DailyWorkReviewDay;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`work-review__day ${active ? "work-review__day--active" : ""}`}
      onClick={onClick}
    >
      <span className="work-review__day-kicker">{day.relativeLabel}</span>
      <span className="work-review__day-date">{day.dateLabel}</span>
      <span className="work-review__day-meta">
        {day.sessionCount} · {day.agents.map(agentLabel).join(" / ")}
      </span>
      <span className="work-review__day-summary">{day.summaryText}</span>
    </button>
  );
}

export function WorkReviewPage({
  sessions,
  historySessions = [],
  now,
  onFocusSession,
}: WorkReviewPageProps) {
  const { t, locale } = useI18n();
  const reviewNow = useWorkReviewNow(now);
  const days = useMemo(
    () => buildDailyWorkReview([...historySessions, ...sessions], { locale, now: reviewNow }),
    [historySessions, sessions, locale, reviewNow],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(days[0]?.key ?? null);
  const selected = days.find((day) => day.key === selectedKey) ?? days[0] ?? null;

  if (days.length === 0 || !selected) {
    return (
      <section className="work-review" aria-label={t("workReview.title")}>
        <header className="work-review__header">
          <div>
            <div className="work-review__eyebrow">{t("workReview.eyebrow")}</div>
            <h2>{t("workReview.title")}</h2>
            <p>{t("workReview.subtitle")}</p>
          </div>
        </header>
        <div className="work-review__empty">{t("workReview.empty")}</div>
      </section>
    );
  }

  const completedPreview = selected.completed.slice(0, SUMMARY_PREVIEW_LIMIT);
  const ongoingPreview = selected.isToday
    ? selected.ongoing.slice(0, SUMMARY_PREVIEW_LIMIT)
    : [];
  const previewIds = new Set(
    [...completedPreview, ...ongoingPreview].map((entry) => entry.id),
  );
  const detailEntries = selected.entries.filter((entry) => !previewIds.has(entry.id));
  const summaryGridClass = [
    "work-review__summary-grid",
    selected.isToday ? "" : "work-review__summary-grid--single",
  ].filter(Boolean).join(" ");

  return (
    <section className="work-review" aria-label={t("workReview.title")}>
      <header className="work-review__header">
        <div>
          <div className="work-review__eyebrow">{t("workReview.eyebrow")}</div>
          <h2>{t("workReview.title")}</h2>
          <p>{t("workReview.subtitle")}</p>
        </div>
      </header>

      <div className="work-review__layout">
        <aside className="work-review__rail" aria-label={t("workReview.dayList")}>
          {days.map((day) => (
            <DayButton
              key={day.key}
              day={day}
              active={day.key === selected.key}
              onClick={() => setSelectedKey(day.key)}
            />
          ))}
        </aside>

        <div className="work-review__detail">
          <header className="work-review__detail-head">
            <div>
              <span className="work-review__detail-kicker">{selected.relativeLabel}</span>
              <h3>{selected.dateLabel} {selected.weekdayLabel}</h3>
            </div>
            <div className="work-review__sources" aria-label={t("workReview.sources")}>
              <span className="work-review__sources-label">{t("workReview.sources")}</span>
              <span className="work-review__source-pill">
                <span>{t("workReview.source.managed")}</span>
                <strong>{selected.managedCount}</strong>
              </span>
              <span className="work-review__source-pill">
                <span>{t("workReview.source.observed")}</span>
                <strong>{selected.observedCount}</strong>
              </span>
            </div>
          </header>

          <div className="work-review__digest">
            <div className="work-review__digest-title">{t("workReview.todaySummary")}</div>
            <p>{selected.summaryText}</p>
          </div>

          <div className={summaryGridClass}>
            <SummaryBlock
              title={t("workReview.completed")}
              count={selected.completedCount}
              items={completedPreview}
              emptyLabel={t("workReview.emptyCompleted")}
              tone="done"
              onFocusSession={onFocusSession}
            />
            {selected.isToday ? (
              <SummaryBlock
                title={t("workReview.ongoing")}
                count={selected.ongoingCount}
                items={ongoingPreview}
                emptyLabel={t("workReview.emptyOngoing")}
                tone="active"
                onFocusSession={onFocusSession}
              />
            ) : null}
          </div>

          {detailEntries.length > 0 ? (
            <details className="work-review__details">
              <summary>{t("workReview.viewDetails")}</summary>
              <EntryList
                items={detailEntries}
                emptyLabel={t("workReview.emptyDetails")}
                onFocusSession={onFocusSession}
              />
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
