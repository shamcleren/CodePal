import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WheelEvent } from "react";
import type { ActivityItem } from "../../shared/sessionTypes";
import type { PendingAction } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";
import type { MonitorSessionRow, TimelineItem } from "../monitorSession";
import { HoverDetails } from "./HoverDetails";

const HISTORY_INITIAL_PAGE_LIMIT = 100;
const HISTORY_INCREMENTAL_PAGE_LIMIT = 60;
const HISTORY_SCROLL_TOP_THRESHOLD_PX = 72;
const HISTORY_SCROLL_BOTTOM_THRESHOLD_PX = 32;
const HISTORY_LOADING_MIN_MS = 220;
const SUMMARY_MESSAGE_LIMIT = 10;
const LOW_VALUE_LIFECYCLE_BODIES = new Set([
  "Claude session started",
  "Claude request finished",
  "Claude session ended",
  "CodeBuddy request started",
  "CodeBuddy request finished",
]);
const DUPLICATE_HISTORY_TIME_WINDOW_MS = 5_000;

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

function shouldHideLowValueLifecycleItem(item: Pick<ActivityItem, "kind" | "source" | "body">): boolean {
  return (
    (item.kind === "system" || item.kind === "note") &&
    item.source === "system" &&
    LOW_VALUE_LIFECYCLE_BODIES.has(item.body.trim())
  );
}

function sameRenderableHistoryItem(left: TimelineItem, right: ActivityItem): boolean {
  if (left.kind !== right.kind || left.source !== right.source) {
    return false;
  }

  const leftBody = normalizeComparableText(left.body);
  const rightBody = normalizeComparableText(right.body);
  if (!leftBody || leftBody !== rightBody) {
    return false;
  }

  return Math.abs(left.timestamp - right.timestamp) <= DUPLICATE_HISTORY_TIME_WINDOW_MS;
}

export function mergeHistoryStatusState(options: {
  historyError: string | null;
  historyLoading: boolean;
  persistedCount: number;
  historyHasMore: boolean;
}): { kind: "error" | "loading-initial" | "loading-more" | "hint"; textKey: string } | null {
  if (options.historyError) {
    return { kind: "error", textKey: "session.history.error" };
  }

  if (options.historyLoading) {
    return {
      kind: options.persistedCount > 0 ? "loading-more" : "loading-initial",
      textKey:
        options.persistedCount > 0
          ? "session.history.loadingMore"
          : "session.history.loading",
    };
  }

  if (options.historyHasMore && options.persistedCount > 0) {
    return { kind: "hint", textKey: "session.history.moreAvailable" };
  }

  return null;
}

export function mergeSessionTimelineItems(
  liveItems: TimelineItem[],
  persistedItems: ActivityItem[],
): TimelineItem[] {
  const seen = new Set<string>();
  const merged: TimelineItem[] = [];

  for (const item of liveItems) {
    if (shouldHideLowValueLifecycleItem(item)) {
      continue;
    }
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }

  for (const item of persistedItems) {
    if (shouldHideLowValueLifecycleItem(item)) {
      continue;
    }
    if (seen.has(item.id)) {
      continue;
    }
    if (merged.some((existing) => sameRenderableHistoryItem(existing, item))) {
      continue;
    }
    seen.add(item.id);
    merged.push({
      ...item,
      label: item.title,
    });
  }

  if (persistedItems.length === 0 && merged.length === liveItems.length) {
    return liveItems;
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

export function shouldLoadNextHistoryPageFromWheel(options: {
  deltaY: number;
  scrollTop: number;
  hasMore: boolean;
  loading: boolean;
}) {
  return (
    options.deltaY < 0 &&
    shouldLoadNextHistoryPage({
      scrollTop: options.scrollTop,
      hasMore: options.hasMore,
      loading: options.loading,
    })
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

function summarizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sessionToolLabel(tool: string): string {
  const normalized = tool.trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function sessionStatusLabel(status: MonitorSessionRow["status"]): string {
  switch (status) {
    case "running":
      return "RUNNING";
    case "waiting":
      return "WAITING";
    case "error":
      return "ERROR";
    case "completed":
      return "DONE";
    case "idle":
      return "IDLE";
    case "offline":
      return "OFFLINE";
  }
}

function summaryLabelForItem(item: TimelineItem): string | null {
  if (item.kind === "tool") {
    return "Tool";
  }

  if (item.kind !== "message") {
    return null;
  }

  if (item.source === "assistant") {
    return "Assistant";
  }

  if (item.source === "user") {
    return "User";
  }

  return item.label || item.title || "Agent";
}

export function buildSessionSummaryText(
  session: Pick<
    MonitorSessionRow,
    "tool" | "status" | "titleLabel" | "updatedLabel" | "pendingActions" | "pendingCount"
  >,
  items: TimelineItem[],
): string {
  const pendingActionCount = session.pendingActions?.length ?? 0;
  const pendingCount = pendingActionCount > 0 ? pendingActionCount : session.pendingCount;
  const messageItems = items.filter((item) => item.kind === "message");
  const selectedMessageItems = messageItems.slice(-SUMMARY_MESSAGE_LIMIT);
  const messageLines = selectedMessageItems
    .map((item) => {
      const label = summaryLabelForItem(item);
      if (!label) {
        return null;
      }

      const body = summarizeText(item.body);
      return body ? `- ${label}: ${body}` : null;
    })
    .filter((line): line is string => line !== null);
  const toolCount = items.filter((item) => item.kind === "tool").length;
  const lines = [
    session.titleLabel,
    "",
    "Session facts",
    `- Tool: ${sessionToolLabel(session.tool)}`,
    `- Status: ${sessionStatusLabel(session.status)}`,
    `- Updated: ${session.updatedLabel}`,
    `- Pending count: ${pendingCount}`,
    `- Timeline items considered: ${items.length}`,
  ];

  lines.push("");
  lines.push("Copied message scope");
  lines.push(`- Last ${SUMMARY_MESSAGE_LIMIT} User/Assistant messages are included when available.`);
  lines.push("- Tool details are intentionally omitted.");

  if ((session.pendingActions?.length ?? 0) > 0) {
    lines.push("");
    lines.push("Pending decisions");
    for (const action of session.pendingActions ?? []) {
      lines.push(`- ${summarizeText(action.title)}`);
    }
  }

  if (messageLines.length > 0) {
    lines.push("");
    lines.push(
      `Recent User/Assistant messages copied (${messageLines.length} of ${messageItems.length} available)`,
    );
    lines.push(...messageLines);
  }

  if (toolCount > 0) {
    lines.push("");
    lines.push("Tool activity summary");
    lines.push(`- Omitted tool details: ${toolCount} ${toolCount === 1 ? "item" : "items"}`);
  }

  return lines.join("\n").trim();
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
  const [summaryCopied, setSummaryCopied] = useState(false);

  const mergedItems = mergeSessionTimelineItems(session.timelineItems, persistedItems);
  const summaryText = buildSessionSummaryText(session, mergedItems);
  const latestToolItem = mergedItems.find((item) => item.kind === "tool");
  const hasRenderablePrimaryContent = mergedItems.some(
    (item) => item.kind === "message" || item.kind === "tool",
  );
  const showLoadingPanel = session.status === "running" && !hasRenderablePrimaryContent;
  const shouldShowArtifactSummary =
    latestToolItem &&
    normalizeComparableText(latestToolItem.body) !== normalizeComparableText(session.titleLabel) &&
    normalizeComparableText(latestToolItem.body) !== normalizeComparableText(session.collapsedSummary);
  const historyStatus = mergeHistoryStatusState({
    historyError,
    historyLoading,
    persistedCount: persistedItems.length,
    historyHasMore,
  });

  async function withMinimumLoadingVisibility<T>(startedAt: number, task: Promise<T>): Promise<T> {
    try {
      return await task;
    } finally {
      const remaining = HISTORY_LOADING_MIN_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
    }
  }

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

    async function loadHistoryPages() {
      const startedAt = Date.now();
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const page = await withMinimumLoadingVisibility(
          startedAt,
          window.codepal.getSessionHistoryPage({
            sessionId: session.id,
            limit: HISTORY_INITIAL_PAGE_LIMIT,
          }),
        );

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
  }, [expanded, historyError, initialLoadAttempt, session.id]);

  useLayoutEffect(() => {
    const node = detailsRef.current;
    if (!expanded || !node) {
      lastExpandedRef.current = expanded;
      return;
    }

    const pendingScrollRestore = pendingScrollRestoreRef.current;
    if (pendingScrollRestore) {
      if (node.scrollHeight <= pendingScrollRestore.scrollHeight) {
        lastExpandedRef.current = expanded;
        return;
      }

      let firstFrame = 0;
      let secondFrame = 0;
      let stopObserving = 0;
      const restoreScrollPosition = () => {
        node.scrollTop =
          pendingScrollRestore.scrollTop +
          Math.max(0, node.scrollHeight - pendingScrollRestore.scrollHeight);
      };

      restoreScrollPosition();
      firstFrame = window.requestAnimationFrame(() => {
        restoreScrollPosition();
        secondFrame = window.requestAnimationFrame(restoreScrollPosition);
      });

      const observer =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(restoreScrollPosition)
          : null;
      observer?.observe(node);
      stopObserving = window.setTimeout(() => {
        observer?.disconnect();
      }, 800);

      pendingScrollRestoreRef.current = null;
      shouldStickToBottomRef.current = false;
      lastExpandedRef.current = expanded;
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
        window.clearTimeout(stopObserving);
        observer?.disconnect();
      };
    }

    const justOpened = !lastExpandedRef.current;
    if (justOpened || shouldStickToBottomRef.current) {
      let firstFrame = 0;
      let secondFrame = 0;
      let stopObserving = 0;
      const pinToBottom = () => {
        node.scrollTop = node.scrollHeight;
      };

      pinToBottom();
      firstFrame = window.requestAnimationFrame(() => {
        pinToBottom();
        secondFrame = window.requestAnimationFrame(pinToBottom);
      });

      const observer =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(pinToBottom)
          : null;
      observer?.observe(node);
      stopObserving = window.setTimeout(() => {
        observer?.disconnect();
      }, 800);

      lastExpandedRef.current = expanded;

      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
        window.clearTimeout(stopObserving);
        observer?.disconnect();
      };
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
    const startedAt = Date.now();
    setHistoryLoading(true);
    setHistoryError(null);

    void withMinimumLoadingVisibility(
      startedAt,
      window.codepal.getSessionHistoryPage({
        sessionId: session.id,
        cursor: historyCursor,
        limit: HISTORY_INCREMENTAL_PAGE_LIMIT,
      }),
    )
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

  function handleDetailsWheel(event: WheelEvent<HTMLDivElement>) {
    const node = detailsRef.current;
    if (!node) {
      return;
    }

    if (
      shouldLoadNextHistoryPageFromWheel({
        deltaY: event.deltaY,
        scrollTop: node.scrollTop,
        hasMore: historyHasMore,
        loading: historyLoading,
      })
    ) {
      event.preventDefault();
      loadOlderHistory();
    }
  }

  function scrollToLatest() {
    const node = detailsRef.current;
    if (!node) {
      return;
    }

    shouldStickToBottomRef.current = true;
    node.scrollTop = node.scrollHeight;
  }

  async function copySummary() {
    await window.codepal.writeClipboardText(summaryText);
    setSummaryCopied(true);
    window.setTimeout(() => {
      setSummaryCopied(false);
    }, 1200);
  }

  const footer = (
    <div className="session-row__footer">
      <div className="session-row__footer-meta">
        <span className="session-row__footer-chip">
          {i18n.t("session.footer.items", { count: mergedItems.length })}
        </span>
        {session.pendingCount > 0 ? (
          <span className="session-row__footer-chip session-row__footer-chip--pending">
            {i18n.t("session.pending", { count: session.pendingCount })}
          </span>
        ) : null}
      </div>
      <div className="session-row__footer-actions">
        <button
          type="button"
          className="session-row__footer-button session-row__footer-button--ghost"
          onClick={scrollToLatest}
        >
          {i18n.t("session.footer.backToLatest")}
        </button>
        <button
          type="button"
          className="session-row__footer-button"
          onClick={() => {
            void copySummary();
          }}
        >
          {summaryCopied ? i18n.t("common.copied") : i18n.t("session.footer.copySummary")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="session-row__details-shell">
      <div
        ref={detailsRef}
        className="session-row__details"
        onScroll={handleDetailsScroll}
        onWheel={handleDetailsWheel}
      >
      {historyStatus ? (
        historyStatus.kind === "error" ? (
          <button
            type="button"
            className="session-row__history-status session-row__history-status--error session-row__history-status--action"
            onClick={retryInitialHistoryLoad}
          >
            {i18n.t("session.history.retry")}
          </button>
        ) : (
          <div
            className={`session-row__history-status ${
              historyStatus.kind === "hint"
                ? "session-row__history-status--hint"
                : "session-row__history-status--loading"
            }`}
            role="status"
          >
            {i18n.t(historyStatus.textKey)}
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
      {footer}
    </div>
  );
}
