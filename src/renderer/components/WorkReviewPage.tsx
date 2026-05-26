import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { buildDailyWorkReview, type DailyWorkReviewDay, type DailyWorkReviewEntry } from "../dailyWorkReview";
import type { MonitorSessionRow } from "../monitorSession";
import type { SessionHistorySummary } from "../../shared/historyTypes";
import type { TokenTrendPoint } from "../../shared/analyticsTypes";
import type { ModelPricing, UsageOverview } from "../../shared/usageTypes";
import {
  UNKNOWN_PROJECT_PATH,
  isUnknownProjectPath,
  projectDisplayName,
} from "../../shared/projectAttribution";
import { moveProjectKey, orderProjectGroups } from "../projectGroups";
import { useI18n } from "../i18n";

type WorkReviewPageProps = {
  sessions: MonitorSessionRow[];
  historySessions?: SessionHistorySummary[];
  usageOverview?: UsageOverview | null;
  tokenTrendPoints?: TokenTrendPoint[];
  pricing?: ModelPricing[];
  now?: number;
  onFocusSession?: (sessionId: string) => void;
};

const SUMMARY_PREVIEW_LIMIT = 5;
const DEFAULT_VISIBLE_REVIEW_ITEMS_PER_PROJECT = 3;
const WORK_REVIEW_CLOCK_INTERVAL_MS = 1_000;

type ReviewProjectGroup = {
  key: string;
  name: string;
  path?: string;
  items: DailyWorkReviewEntry[];
};

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

function groupReviewEntriesByProject(
  items: DailyWorkReviewEntry[],
  unknownProjectLabel: string,
): ReviewProjectGroup[] {
  const groups: ReviewProjectGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const projectPath = item.projectPath?.trim() || UNKNOWN_PROJECT_PATH;
    const key = isUnknownProjectPath(projectPath) ? UNKNOWN_PROJECT_PATH : projectPath;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      groups[existingIndex].items.push(item);
      continue;
    }

    indexByKey.set(key, groups.length);
    groups.push({
      key,
      name: isUnknownProjectPath(projectPath)
        ? unknownProjectLabel
        : item.projectName?.trim() || projectDisplayName(projectPath),
      ...(isUnknownProjectPath(projectPath) ? {} : { path: projectPath }),
      items: [item],
    });
  }

  return groups;
}

function toggleSetValue(current: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

function projectContentId(prefix: string, key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return `${prefix}-${hash.toString(36)}`;
}

function isPriorityReviewEntry(entry: DailyWorkReviewEntry): boolean {
  return entry.status === "running" || entry.status === "waiting" || entry.status === "error";
}

function visibleReviewItemsForProject(
  items: DailyWorkReviewEntry[],
  expanded: boolean,
): DailyWorkReviewEntry[] {
  if (expanded || items.length <= DEFAULT_VISIBLE_REVIEW_ITEMS_PER_PROJECT) {
    return items;
  }

  const visibleIds = new Set<string>();
  const visibleItems: DailyWorkReviewEntry[] = [];
  const addVisibleItem = (entry: DailyWorkReviewEntry) => {
    if (visibleIds.has(entry.id)) return;
    visibleIds.add(entry.id);
    visibleItems.push(entry);
  };

  items.slice(0, DEFAULT_VISIBLE_REVIEW_ITEMS_PER_PROJECT).forEach(addVisibleItem);
  items.filter(isPriorityReviewEntry).forEach(addVisibleItem);
  return visibleItems;
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
  const [projectOrder, setProjectOrder] = useState<string[]>([]);
  const [collapsedProjectKeys, setCollapsedProjectKeys] = useState<Set<string>>(() => new Set());
  const [expandedProjectItemKeys, setExpandedProjectItemKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const draggedProjectKey = useRef<string | null>(null);
  const rawGroups = useMemo(
    () => groupReviewEntriesByProject(items, t("tokenStats.unknownProject")),
    [items, t],
  );
  const groups = useMemo(
    () => orderProjectGroups(rawGroups, projectOrder),
    [rawGroups, projectOrder],
  );

  const moveProjectBefore = useCallback((draggedKey: string, targetKey: string) => {
    setProjectOrder((current) => {
      const visibleOrder = orderProjectGroups(rawGroups, current).map((group) => group.key);
      return moveProjectKey(visibleOrder, draggedKey, targetKey);
    });
  }, [rawGroups]);

  const toggleProjectCollapsed = useCallback((projectKey: string) => {
    setCollapsedProjectKeys((current) => toggleSetValue(current, projectKey));
  }, []);

  const toggleProjectItemsExpanded = useCallback((projectKey: string) => {
    setExpandedProjectItemKeys((current) => toggleSetValue(current, projectKey));
  }, []);

  const handleProjectDragStart = useCallback((projectKey: string) => {
    return (event: DragEvent<HTMLElement>) => {
      draggedProjectKey.current = projectKey;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", projectKey);
    };
  }, []);

  const handleProjectDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (draggedProjectKey.current) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleProjectDrop = useCallback((targetProjectKey: string) => {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const sourceProjectKey = draggedProjectKey.current;
      draggedProjectKey.current = null;
      if (sourceProjectKey) {
        moveProjectBefore(sourceProjectKey, targetProjectKey);
      }
    };
  }, [moveProjectBefore]);

  const handleProjectDragEnd = useCallback(() => {
    draggedProjectKey.current = null;
  }, []);

  if (items.length === 0) {
    return <p className="work-review__empty-line">{emptyLabel}</p>;
  }
  return (
    <div className="work-review__project-groups">
      {groups.map((group) => {
        const projectCollapsed = collapsedProjectKeys.has(group.key);
        const itemsExpanded = expandedProjectItemKeys.has(group.key);
        const visibleItems = visibleReviewItemsForProject(group.items, itemsExpanded);
        const hiddenItemCount = group.items.length - visibleItems.length;
        const contentId = projectContentId("work-review-project", group.key);

        return (
        <section
          key={group.key}
          className={`work-review__project-group${
            projectCollapsed ? " work-review__project-group--collapsed" : ""
          }`}
          aria-label={group.name}
          onDragOver={handleProjectDragOver}
          onDrop={handleProjectDrop(group.key)}
        >
          <div className="work-review__project-heading" title={group.path}>
            <button
              type="button"
              className="work-review__project-drag"
              draggable
              aria-label={t("projectGroup.dragProject")}
              title={t("projectGroup.dragProject")}
              onDragStart={handleProjectDragStart(group.key)}
              onDragEnd={handleProjectDragEnd}
            >
              <span aria-hidden="true">::</span>
            </button>
            <button
              type="button"
              className="work-review__project-toggle"
              aria-expanded={!projectCollapsed}
              aria-controls={contentId}
              aria-label={projectCollapsed ? t("projectGroup.expand") : t("projectGroup.collapse")}
              title={projectCollapsed ? t("projectGroup.expand") : t("projectGroup.collapse")}
              onClick={() => toggleProjectCollapsed(group.key)}
            >
              <span aria-hidden="true" />
            </button>
            <span className="work-review__project-marker" aria-hidden="true" />
            <span className="work-review__project-name">{group.name}</span>
            <strong>{group.items.length}</strong>
          </div>
          {!projectCollapsed ? (
            <div id={contentId} className="work-review__project-items">
              <ul className="work-review__item-list">
            {visibleItems.map((entry) => (
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
                  {entry.availability === "history" ? (
                    <span>{t("workReview.availability.history")}</span>
                  ) : null}
                  {entry.latestRunningDurationLabel ? (
                    <span>{t("workReview.duration.latestRunning", { duration: entry.latestRunningDurationLabel })}</span>
                  ) : null}
                  {entry.sessionDurationLabel ? (
                    <span>{t("workReview.duration.session", { duration: entry.sessionDurationLabel })}</span>
                  ) : null}
                  {onFocusSession && entry.availability === "current" ? (
                    <button
                      type="button"
                      className="work-review__link-button"
                      onClick={() => onFocusSession(entry.sessionId)}
                    >
                      {t("workReview.openSession")}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
              </ul>
              {hiddenItemCount > 0 || itemsExpanded ? (
                <button
                  type="button"
                  className="work-review__project-more"
                  aria-expanded={itemsExpanded}
                  onClick={() => toggleProjectItemsExpanded(group.key)}
                >
                  {itemsExpanded
                    ? t("projectGroup.showLess")
                    : t("projectGroup.showMore", { count: hiddenItemCount })}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
        );
      })}
    </div>
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
  usageOverview,
  tokenTrendPoints,
  pricing,
  now,
  onFocusSession,
}: WorkReviewPageProps) {
  const { t, locale } = useI18n();
  const reviewNow = useWorkReviewNow(now);
  const reviewSources = useMemo(() => [...historySessions, ...sessions], [historySessions, sessions]);
  const days = useMemo(
    () => buildDailyWorkReview(reviewSources, {
      locale,
      now: reviewNow,
      usageOverview,
      tokenTrendPoints,
      pricing,
    }),
    [reviewSources, locale, reviewNow, usageOverview, tokenTrendPoints, pricing],
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
