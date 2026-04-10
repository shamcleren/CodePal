import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ActivityItem } from "../../shared/sessionTypes";
import type { PendingAction } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";
import type { MonitorSessionRow, TimelineItem } from "../monitorSession";
import { HoverDetails } from "./HoverDetails";

const HISTORY_PAGE_LIMIT = 100;
const HISTORY_SCROLL_TOP_THRESHOLD_PX = 72;
const HISTORY_SCROLL_BOTTOM_THRESHOLD_PX = 32;

function normalizeComparableText(text: string): string {
  return text
    .replace(/^(Agent|User|Assistant)\s*:\s*/i, "")
    .replace(/^(Completed|Running|Waiting|Done|Idle|Offline|Error)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendUniqueHistoryItems(current: ActivityItem[], next: ActivityItem[]): ActivityItem[] {
  if (next.length === 0) {
    return current;
  }

  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const item of next) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function mergeSessionTimelineItems(
  liveItems: TimelineItem[],
  persistedItems: ActivityItem[],
): TimelineItem[] {
  if (persistedItems.length === 0) {
    return liveItems;
  }

  const seen = new Set<string>();
  const merged: TimelineItem[] = [];

  for (const item of liveItems) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }

  for (const item of persistedItems) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push({
      ...item,
      label: item.title,
    });
  }

  return merged.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }
    return left.id.localeCompare(right.id);
  });
}

export function shouldLoadNextHistoryPage(options: {
  scrollTop: number;
  hasMore: boolean;
  loading: boolean;
}) {
  return (
    options.scrollTop <= HISTORY_SCROLL_TOP_THRESHOLD_PX &&
    options.hasMore &&
    !options.loading
  );
}

export function shouldStartInitialHistoryLoad(options: {
  expanded: boolean;
  initialLoadDone: boolean;
  loading: boolean;
  historyError: string | null;
}) {
  return (
    options.expanded &&
    !options.initialLoadDone &&
    !options.loading &&
    options.historyError === null
  );
}

function pendingEyebrow(
  type: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (type) {
    case "approval":
      return t("session.pending.approval");
    case "single_choice":
      return t("session.pending.single_choice");
    case "multi_choice":
      return t("session.pending.multi_choice");
    default:
      return t("session.pending.default");
  }
}

function actionDisplayOptions(
  action: PendingAction,
  t: (key: string, params?: Record<string, string | number>) => string,
): string[] {
  if (action.type === "approval") {
    return [t("session.action.allow"), t("session.action.deny")];
  }
  return action.options;
}

export type SessionHistoryTimelineProps = {
  session: MonitorSessionRow;
  historyVersion?: number;
  expanded: boolean;
  showExperimentalControls: boolean;
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export function SessionHistoryTimeline({
  session,
  historyVersion = 0,
  expanded,
  showExperimentalControls,
  onRespond,
}: SessionHistoryTimelineProps) {
  const i18n = useI18n();
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastExpandedRef = useRef(false);
  const requestIdRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const [initialLoadAttempt, setInitialLoadAttempt] = useState(0);
  const [persistedItems, setPersistedItems] = useState<ActivityItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const mergedItems = mergeSessionTimelineItems(session.timelineItems, persistedItems);
  const latestToolItem = mergedItems.find((item) => item.kind === "tool");
  const hasRenderablePrimaryContent = mergedItems.some(
    (item) => item.kind === "message" || item.kind === "tool",
  );
  const showLoadingPanel = session.status === "running" && !hasRenderablePrimaryContent;
  const shouldShowArtifactSummary =
    latestToolItem &&
    normalizeComparableText(latestToolItem.body) !== normalizeComparableText(session.titleLabel) &&
    normalizeComparableText(latestToolItem.body) !== normalizeComparableText(session.collapsedSummary);
  const historyStatusText = historyError
    ? i18n.t("session.history.error")
    : historyLoading
      ? persistedItems.length > 0
        ? i18n.t("session.history.loadingMore")
        : i18n.t("session.history.loading")
      : null;

  useEffect(() => {
    requestIdRef.current += 1;
    setPersistedItems([]);
    setHistoryCursor(null);
    setHistoryHasMore(false);
    setHistoryLoading(false);
    setHistoryError(null);
    initialLoadDoneRef.current = false;
    pendingScrollRestoreRef.current = null;
    shouldStickToBottomRef.current = true;
    lastExpandedRef.current = false;
  }, [historyVersion, session.id]);

  useEffect(() => {
    if (!expanded) {
      requestIdRef.current += 1;
      setHistoryLoading(false);
      if (persistedItems.length === 0) {
        initialLoadDoneRef.current = false;
      }
      return;
    }

    if (
      !shouldStartInitialHistoryLoad({
        expanded,
        initialLoadDone: initialLoadDoneRef.current,
        loading: historyLoading,
        historyError,
      })
    ) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    let cancelled = false;
    initialLoadDoneRef.current = true;

    async function loadHistoryPages() {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const page = await window.codepal.getSessionHistoryPage({
          sessionId: session.id,
          limit: HISTORY_PAGE_LIMIT,
        });

        if (cancelled || requestIdRef.current !== requestId) {
          return;
        }

        setPersistedItems((current) => appendUniqueHistoryItems(current, page.items));
        setHistoryCursor(page.nextCursor);
        setHistoryHasMore(page.hasMore);
        initialLoadDoneRef.current = true;
      } catch (error) {
        if (!cancelled && requestIdRef.current === requestId) {
          setHistoryError((error as Error).message);
          initialLoadDoneRef.current = false;
        }
      } finally {
        if (!cancelled && requestIdRef.current === requestId) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistoryPages();

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      setHistoryLoading(false);
    };
  }, [expanded, historyError, historyLoading, initialLoadAttempt, persistedItems.length, session.id]);

  useLayoutEffect(() => {
    const node = detailsRef.current;
    if (!expanded || !node) {
      lastExpandedRef.current = expanded;
      return;
    }

    const pendingScrollRestore = pendingScrollRestoreRef.current;
    if (pendingScrollRestore) {
      node.scrollTop =
        pendingScrollRestore.scrollTop +
        Math.max(0, node.scrollHeight - pendingScrollRestore.scrollHeight);
      pendingScrollRestoreRef.current = null;
      shouldStickToBottomRef.current = false;
      lastExpandedRef.current = expanded;
      return;
    }

    const justOpened = !lastExpandedRef.current;
    if (justOpened || shouldStickToBottomRef.current) {
      node.scrollTop = node.scrollHeight;
    }

    lastExpandedRef.current = expanded;
  }, [expanded, mergedItems.length, historyLoading, historyError, session.updatedAt, session.pendingCount]);

  function loadOlderHistory() {
    if (!historyCursor || historyLoading) {
      return;
    }

    const node = detailsRef.current;
    pendingScrollRestoreRef.current = node
      ? {
          scrollHeight: node.scrollHeight,
          scrollTop: node.scrollTop,
        }
      : null;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setHistoryLoading(true);
    setHistoryError(null);

    void window.codepal
      .getSessionHistoryPage({
        sessionId: session.id,
        cursor: historyCursor,
        limit: HISTORY_PAGE_LIMIT,
      })
      .then((page) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setPersistedItems((current) => appendUniqueHistoryItems(current, page.items));
        setHistoryCursor(page.nextCursor);
        setHistoryHasMore(page.hasMore);
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setHistoryError((error as Error).message);
        pendingScrollRestoreRef.current = null;
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setHistoryLoading(false);
        }
      });
  }

  function retryInitialHistoryLoad() {
    if (historyLoading) {
      return;
    }
    setHistoryError(null);
    initialLoadDoneRef.current = false;
    setInitialLoadAttempt((current) => current + 1);
  }

  function handleDetailsScroll() {
    const node = detailsRef.current;
    if (!node) {
      return;
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < HISTORY_SCROLL_BOTTOM_THRESHOLD_PX;

    if (
      shouldLoadNextHistoryPage({
        scrollTop: node.scrollTop,
        hasMore: historyHasMore,
        loading: historyLoading,
      })
    ) {
      loadOlderHistory();
    }
  }

  return (
    <div
      ref={detailsRef}
      className="session-row__details"
      onScroll={handleDetailsScroll}
    >
      {historyStatusText ? (
        historyError ? (
          <button
            type="button"
            className="session-row__history-status session-row__history-status--error session-row__history-status--action"
            onClick={retryInitialHistoryLoad}
          >
            {i18n.t("session.history.retry")}
          </button>
        ) : (
          <div
            className="session-row__history-status session-row__history-status--loading"
            role="status"
          >
            {historyStatusText}
          </div>
        )
      ) : null}
      {showLoadingPanel ? (
        <div className="session-row__loading" aria-label={i18n.t("session.loading")}>
          <div className="session-stream__item session-stream__item--message session-stream__item--message-assistant session-row__loading-bubble">
            <div className="session-stream__header">
              <span className="session-stream__label session-row__loading-label">Assistant</span>
            </div>
            <div className="session-stream__body session-row__loading-body">
              <span className="session-row__loading-text">{i18n.t("session.typing")}</span>
              <span className="session-row__loading-dots" aria-hidden="true" />
            </div>
          </div>
        </div>
      ) : null}
      {shouldShowArtifactSummary ? (
        <div className="session-row__overview-artifact">
          <span className="session-row__overview-artifact-label">{latestToolItem?.label}</span>
          <span className="session-row__overview-artifact-body">{latestToolItem?.body}</span>
        </div>
      ) : null}
      {!showLoadingPanel ? (
        <HoverDetails
          items={mergedItems}
          sessionStatus={session.status}
          scrollContainerRef={detailsRef}
        />
      ) : null}
      {showExperimentalControls && (session.pendingActions?.length ?? 0) > 0 ? (
        <div className="session-row__interaction">
          {(session.pendingActions ?? []).map((action) => (
            <div key={action.id} className="pending-action" aria-label={action.title}>
              <div className="pending-action__eyebrow">
                <span className="pending-action__kicker">
                  {pendingEyebrow(action.type, i18n.t)}
                </span>
              </div>
              <div className="pending-action__title">{action.title}</div>
              <div className="pending-action__actions">
                {actionDisplayOptions(action, i18n.t).map((option) => (
                  <button
                    key={`${action.id}:${option}`}
                    type="button"
                    className="pending-action__btn"
                    onClick={() => onRespond(session.id, action.id, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
