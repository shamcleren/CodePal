import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent } from "react";
import type { SessionHistoryPage } from "../../shared/historyTypes";
import type { ActivityItem } from "../../shared/sessionTypes";
import type { PendingAction } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";
import type { MonitorSessionRow, TimelineItem } from "../monitorSession";
import { HoverDetails } from "./HoverDetails";
import { SessionMessageInput } from "./SessionMessageInput";

const HISTORY_INITIAL_PAGE_LIMIT = 100;
const HISTORY_INCREMENTAL_PAGE_LIMIT = 60;
const HISTORY_SCROLL_TOP_THRESHOLD_PX = 72;
const HISTORY_SCROLL_BOTTOM_THRESHOLD_PX = 32;
const HISTORY_LOADING_MIN_MS = 220;
const HISTORY_PREFETCH_TRIGGER_PX = 220;
const HISTORY_CONSUME_TRIGGER_PX = 18;
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
  const bodyFingerprints = new Set<string>();
  const filteredLive: TimelineItem[] = [];

  for (const item of liveItems) {
    if (shouldHideLowValueLifecycleItem(item)) {
      continue;
    }
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    filteredLive.push(item);
    const normalized = normalizeComparableText(item.body);
    if (normalized) {
      bodyFingerprints.add(`${item.kind}:${item.source}:${normalized}`);
    }
  }

  if (persistedItems.length === 0) {
    if (filteredLive.length === liveItems.length) {
      return liveItems;
    }
    return filteredLive;
  }

  const historical: TimelineItem[] = [];
  for (const item of persistedItems) {
    if (shouldHideLowValueLifecycleItem(item)) {
      continue;
    }
    if (seen.has(item.id)) {
      continue;
    }
    if (filteredLive.some((existing) => sameRenderableHistoryItem(existing, item))) {
      continue;
    }
    const normalized = normalizeComparableText(item.body);
    const contentKey = normalized ? `${item.kind}:${item.source}:${normalized}` : "";
    if (contentKey && bodyFingerprints.has(contentKey)) {
      continue;
    }
    seen.add(item.id);
    if (contentKey) {
      bodyFingerprints.add(contentKey);
    }
    historical.push({
      ...item,
      label: item.title,
    });
  }

  if (historical.length === 0) {
    if (filteredLive.length === liveItems.length) {
      return liveItems;
    }
    return filteredLive;
  }

  const descSort = (left: TimelineItem, right: TimelineItem) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }
    return left.id.localeCompare(right.id);
  };

  // Sort each block independently by timestamp descending.
  // Live items form a stable block that stays at the front (most recent).
  // Historical items are appended after (older), so loading history
  // never reorders the items already visible on screen.
  const liveDesc = [...filteredLive].sort(descSort);
  historical.sort(descSort);

  return [...liveDesc, ...historical];
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

export function shouldPrefetchHistoryPage(options: {
  scrollTop: number;
  hasMore: boolean;
  loading: boolean;
  hasBufferedPage: boolean;
}) {
  return (
    options.scrollTop <= HISTORY_PREFETCH_TRIGGER_PX &&
    options.hasMore &&
    !options.loading &&
    !options.hasBufferedPage
  );
}

export function shouldConsumeBufferedHistoryPage(options: {
  scrollTop: number;
  hasBufferedPage: boolean;
}) {
  return options.hasBufferedPage && options.scrollTop <= HISTORY_CONSUME_TRIGGER_PX;
}

type ScrollAnchor = {
  id: string;
  offsetTop: number;
  scrollTop: number;
  scrollHeight: number;
};

function captureScrollAnchor(container: HTMLDivElement): ScrollAnchor | null {
  const containerRect = container.getBoundingClientRect();
  const anchors = Array.from(
    container.querySelectorAll<HTMLElement>("[data-timeline-anchor='true'][data-timeline-id]"),
  );

  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom <= containerRect.top + 4) {
      continue;
    }
    return {
      id: anchor.dataset.timelineId ?? "",
      offsetTop: rect.top - containerRect.top,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
    };
  }

  return {
    id: "",
    offsetTop: 0,
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
  };
}

function restoreScrollAnchor(container: HTMLDivElement, anchor: ScrollAnchor): void {
  if (anchor.id) {
    const target = Array.from(
      container.querySelectorAll<HTMLElement>("[data-timeline-anchor='true'][data-timeline-id]"),
    ).find((candidate) => candidate.dataset.timelineId === anchor.id);
    if (target) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      container.scrollTop += targetRect.top - containerRect.top - anchor.offsetTop;
      return;
    }
  }

  container.scrollTop =
    anchor.scrollTop + Math.max(0, container.scrollHeight - anchor.scrollHeight);
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

export function pendingEyebrow(
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

export function actionDisplayOptions(
  action: PendingAction,
  t: (key: string, params?: Record<string, string | number>) => string,
): string[] {
  return actionDisplayChoices(action, t).map((choice) => choice.label);
}

export type PendingActionDisplayChoice = {
  label: string;
  value: string;
};

export function actionDisplayChoices(
  action: PendingAction,
  t: (key: string, params?: Record<string, string | number>) => string,
): PendingActionDisplayChoice[] {
  if (action.type === "approval") {
    return [
      { label: t("session.action.allow"), value: "Allow" },
      { label: t("session.action.deny"), value: "Deny" },
    ];
  }
  return action.options.map((option) => ({ label: option, value: option }));
}

export function pendingActionButtonLabel(
  label: string,
  cardState: "pending" | "sending" | "success" | "error",
  isSelected: boolean,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (cardState === "sending" && isSelected) {
    return t("pendingAction.sending");
  }
  return label;
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
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export function SessionHistoryTimeline({
  session,
  historyVersion = 0,
  expanded,
  onRespond,
}: SessionHistoryTimelineProps) {
  type ActionCardState = "pending" | "sending" | "success" | "error";

  const [cardStates, setCardStates] = useState<Record<string, ActionCardState>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  // 追踪每个 actionId 最后一次选择的 option，供重试使用
  const [cardLastOptions, setCardLastOptions] = useState<Record<string, string>>({});

  const i18n = useI18n();
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastExpandedRef = useRef(false);
  const requestIdRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  const pendingScrollRestoreRef = useRef<ScrollAnchor | null>(null);
  const isRestoringScrollRef = useRef(false);
  const [initialLoadAttempt, setInitialLoadAttempt] = useState(0);
  const [persistedItems, setPersistedItems] = useState<ActivityItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [bufferedHistoryPage, setBufferedHistoryPage] = useState<SessionHistoryPage | null>(null);
  const [isNearHistoryTop, setIsNearHistoryTop] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [localUserMessages, setLocalUserMessages] = useState<ActivityItem[]>([]);

  const mergedItemsBase = useMemo(
    () => mergeSessionTimelineItems(session.timelineItems, persistedItems),
    [session.timelineItems, persistedItems],
  );

  const mergedItems = useMemo(() => {
    if (localUserMessages.length === 0) return mergedItemsBase;
    const realIds = new Set(mergedItemsBase.map((item) => item.id));
    const realBodies = new Set(
      mergedItemsBase
        .filter((item) => item.source === "user")
        .map((item) => item.body.trim()),
    );
    const remaining = localUserMessages.filter(
      (msg) => !realIds.has(msg.id) && !realBodies.has(msg.body.trim()),
    );
    if (remaining.length === 0) return mergedItemsBase;
    return [
      ...mergedItemsBase,
      ...remaining.map((item): TimelineItem => ({
        ...item,
        label: "",
      })),
    ];
  }, [mergedItemsBase, localUserMessages]);
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
    setBufferedHistoryPage(null);
    setIsNearHistoryTop(false);
    initialLoadDoneRef.current = false;
    pendingScrollRestoreRef.current = null;
    shouldStickToBottomRef.current = true;
    lastExpandedRef.current = false;
  }, [historyVersion, session.id]);

  useEffect(() => {
    if (!expanded) {
      requestIdRef.current += 1;
      setHistoryLoading(false);
      setBufferedHistoryPage(null);
      setIsNearHistoryTop(false);
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

        if (detailsRef.current && !shouldStickToBottomRef.current) {
          pendingScrollRestoreRef.current = captureScrollAnchor(detailsRef.current);
        }
        setPersistedItems((current) => appendUniqueHistoryItems(current, page.items));
        setHistoryCursor(page.nextCursor);
        setHistoryHasMore(page.hasMore);
        setBufferedHistoryPage(null);
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

  useEffect(() => {
    if (!expanded || historyLoading || bufferedHistoryPage !== null) {
      return;
    }
    const node = detailsRef.current;
    if (!node) {
      return;
    }
    if (!isNearHistoryTop) {
      return;
    }
    maybePrefetchHistory(node);
  }, [bufferedHistoryPage, expanded, historyCursor, historyHasMore, historyLoading, isNearHistoryTop]);

  useEffect(() => {
    if (!expanded || !bufferedHistoryPage) {
      return;
    }
    const node = detailsRef.current;
    if (!node) {
      return;
    }
    if (
      shouldConsumeBufferedHistoryPage({
        scrollTop: node.scrollTop,
        hasBufferedPage: true,
      })
    ) {
      applyBufferedHistoryPage(node);
    }
  }, [bufferedHistoryPage, expanded]);

  useEffect(() => {
    return window.codepal.onActionResponseResult((result) => {
      if (result.sessionId !== session.id) return;
      const { actionId } = result;
      if (result.result === "success") {
        setCardStates((prev) => ({ ...prev, [actionId]: "success" }));
        setCardErrors((prev) => {
          const next = { ...prev };
          delete next[actionId];
          return next;
        });
        setTimeout(() => {
          setCardStates((prev) => {
            const next = { ...prev };
            delete next[actionId];
            return next;
          });
        }, 1000);
      } else {
        setCardStates((prev) => ({ ...prev, [actionId]: "error" }));
        setCardErrors((prev) => ({ ...prev, [actionId]: result.error ?? "发送失败" }));
      }
    });
  }, [session.id]);

  function handleRespond(sessionId: string, actionId: string, option: string) {
    setCardStates((prev) => ({ ...prev, [actionId]: "sending" }));
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
    setCardLastOptions((prev) => ({ ...prev, [actionId]: option }));
    onRespond(sessionId, actionId, option);
  }

  function handleSendMessage(sessionId: string, text: string) {
    const localItem: ActivityItem = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "message",
      source: "user",
      title: "",
      body: text,
      timestamp: Date.now(),
    };
    setLocalUserMessages((prev) => [...prev, localItem]);
    shouldStickToBottomRef.current = true;
    window.codepal.sendMessage(sessionId, text);
  }

  async function handleJumpToOriginalTool() {
    const result = await window.codepal.jumpToSessionTarget(session.externalApproval?.jumpTarget);
    if (!result.ok) {
      console.warn("[CodePal] failed to jump to original tool:", result.error);
    }
  }

  function maybePrefetchHistory(node: HTMLDivElement) {
    if (
      !shouldPrefetchHistoryPage({
        scrollTop: node.scrollTop,
        hasMore: historyHasMore,
        loading: historyLoading,
        hasBufferedPage: bufferedHistoryPage !== null,
      })
    ) {
      return;
    }

    if (!historyCursor) {
      return;
    }

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
        setBufferedHistoryPage(page);
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setHistoryError((error as Error).message);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setHistoryLoading(false);
        }
      });
  }

  function applyBufferedHistoryPage(node: HTMLDivElement) {
    if (!bufferedHistoryPage) {
      return;
    }

    pendingScrollRestoreRef.current = captureScrollAnchor(node);
    setPersistedItems((current) => appendUniqueHistoryItems(current, bufferedHistoryPage.items));
    setHistoryCursor(bufferedHistoryPage.nextCursor);
    setHistoryHasMore(bufferedHistoryPage.hasMore);
    setBufferedHistoryPage(null);
    setHistoryError(null);
  }

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

      // Suppress scroll handlers during restoration to prevent cascading
      // state updates (e.g. setIsNearHistoryTop) that trigger extra renders.
      isRestoringScrollRef.current = true;

      // Single synchronous restoration in useLayoutEffect is sufficient —
      // React has committed the DOM at this point, so scrollHeight is final.
      restoreScrollAnchor(node, pendingScrollRestore);

      // One safety RAF to handle any deferred layout (e.g. font loading),
      // then clear the suppression flag.
      const frame = window.requestAnimationFrame(() => {
        restoreScrollAnchor(node, pendingScrollRestore);
        isRestoringScrollRef.current = false;
      });

      pendingScrollRestoreRef.current = null;
      shouldStickToBottomRef.current = false;
      lastExpandedRef.current = expanded;
      return () => {
        window.cancelAnimationFrame(frame);
        isRestoringScrollRef.current = false;
      };
    }

    const justOpened = !lastExpandedRef.current;
    if (justOpened || shouldStickToBottomRef.current) {
      const pinToBottom = () => {
        node.scrollTop = node.scrollHeight;
      };

      pinToBottom();
      const frame = window.requestAnimationFrame(pinToBottom);

      lastExpandedRef.current = expanded;

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    lastExpandedRef.current = expanded;
  }, [expanded, mergedItems.length, historyLoading, historyError, session.updatedAt, session.pendingCount]);

  if (!expanded) {
    return null;
  }

  function loadOlderHistory() {
    const node = detailsRef.current;
    if (!node) {
      return;
    }

    if (shouldConsumeBufferedHistoryPage({ scrollTop: node.scrollTop, hasBufferedPage: bufferedHistoryPage !== null })) {
      applyBufferedHistoryPage(node);
      return;
    }

    maybePrefetchHistory(node);
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
    if (isRestoringScrollRef.current) {
      return;
    }
    const node = detailsRef.current;
    if (!node) {
      return;
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < HISTORY_SCROLL_BOTTOM_THRESHOLD_PX;
    const nearTop = node.scrollTop <= HISTORY_PREFETCH_TRIGGER_PX;
    if (nearTop !== isNearHistoryTop) {
      setIsNearHistoryTop(nearTop);
    }
    loadOlderHistory();
  }

  function handleDetailsWheel(event: WheelEvent<HTMLDivElement>) {
    if (isRestoringScrollRef.current) {
      return;
    }
    const node = detailsRef.current;
    if (!node) {
      return;
    }

    if (event.deltaY < 0) {
      const nearTop = node.scrollTop <= HISTORY_PREFETCH_TRIGGER_PX;
      if (nearTop !== isNearHistoryTop) {
        setIsNearHistoryTop(nearTop);
      }
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

  const showTopHistoryLoadingHint =
    isNearHistoryTop &&
    historyLoading &&
    persistedItems.length > 0 &&
    bufferedHistoryPage === null &&
    historyError === null;

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
      {showTopHistoryLoadingHint ? (
        <div className="session-row__history-peek" aria-hidden="true">
          <div className="session-row__history-peek-dot" />
          <div className="session-row__history-peek-label">{i18n.t("session.history.loadingMore")}</div>
        </div>
      ) : null}
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
        ) : historyStatus.kind === "loading-more" ? null : (
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
      {(session.pendingActions?.length ?? 0) > 0 ? (
        <div className="session-row__interaction">
          {(session.pendingActions?.length ?? 0) > 1 ? (
            <div className="pending-action-bulk">
              <span className="pending-action-bulk__count">
                {session.pendingActions?.length} {i18n.t("session.pending", { count: session.pendingActions?.length ?? 0 })}
              </span>
              <button
                type="button"
                className="pending-action-bulk__btn pending-action-bulk__btn--allow"
                onClick={() => {
                  for (const action of session.pendingActions ?? []) {
                    const state = cardStates[action.id];
                    if (!state || state === "pending" || state === "error") {
                      handleRespond(session.id, action.id, actionDisplayChoices(action, i18n.t)[0].value);
                    }
                  }
                }}
              >
                {i18n.t("pendingAction.allowAll")}
              </button>
              <button
                type="button"
                className="pending-action-bulk__btn pending-action-bulk__btn--deny"
                onClick={() => {
                  for (const action of session.pendingActions ?? []) {
                    const state = cardStates[action.id];
                    if (!state || state === "pending" || state === "error") {
                      const opts = actionDisplayChoices(action, i18n.t);
                      handleRespond(session.id, action.id, opts[opts.length - 1].value);
                    }
                  }
                }}
              >
                {i18n.t("pendingAction.denyAll")}
              </button>
            </div>
          ) : null}
          {(session.pendingActions ?? []).map((action) => {
            const cardState = cardStates[action.id] ?? "pending";
            const cardError = cardErrors[action.id];
            const isSending = cardState === "sending";
            const isSuccess = cardState === "success";
            const isError = cardState === "error";
            const selectedOption = cardLastOptions[action.id];

            return (
              <div
                key={action.id}
                className={`pending-action pending-action--${cardState}`}
                aria-label={action.title}
              >
                {isSuccess ? (
                  <div className="pending-action__success">
                    ✓ {i18n.t("pendingAction.sent")}
                  </div>
                ) : isError ? (
                  <>
                    <div className="pending-action__error-msg">⚠ {cardError}</div>
                    <div className="pending-action__actions">
                      <button
                        type="button"
                        className="pending-action__btn pending-action__btn--retry"
                        onClick={() => handleRespond(session.id, action.id, cardLastOptions[action.id] ?? actionDisplayChoices(action, i18n.t)[0].value)}
                      >
                        {i18n.t("pendingAction.retry")}
                      </button>
                      <button
                        type="button"
                        className="pending-action__btn pending-action__btn--abandon"
                        onClick={() => {
                          setCardStates((prev) => {
                            const next = { ...prev };
                            delete next[action.id];
                            return next;
                          });
                        }}
                      >
                        {i18n.t("pendingAction.abandon")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pending-action__eyebrow">
                      <span className="pending-action__kicker">
                        {pendingEyebrow(action.type, i18n.t)}
                      </span>
                    </div>
                    <div className="pending-action__title">{action.title}</div>
                    <div className="pending-action__actions">
                      {actionDisplayChoices(action, i18n.t).map((option) => (
                        <button
                          key={`${action.id}:${option.value}`}
                          type="button"
                          className="pending-action__btn"
                          disabled={isSending}
                          onClick={() => handleRespond(session.id, action.id, option.value)}
                        >
                          {pendingActionButtonLabel(option.label, cardState, selectedOption === option.value, i18n.t)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      {session.externalApproval ? (
        <div className="session-row__interaction">
          <div
            className="external-approval-card"
            aria-label={session.externalApproval.title}
          >
            <div className="external-approval-card__eyebrow">
              {i18n.t("session.externalApproval.eyebrow")}
            </div>
            <div className="external-approval-card__title">{session.externalApproval.title}</div>
            <div className="external-approval-card__message">{session.externalApproval.message}</div>
            <button
              type="button"
              className="external-approval-card__btn"
              onClick={() => {
                void handleJumpToOriginalTool();
              }}
            >
              {i18n.t("session.externalApproval.goToTool")}
            </button>
            <div className="external-approval-card__hint">
              {i18n.t("session.externalApproval.readonlyHint")}
            </div>
          </div>
        </div>
      ) : null}
      </div>
      {(session.status === "running" || session.status === "waiting") ? (
        <SessionMessageInput
          sessionId={session.id}
          status={session.status}
          hasInputChannel={session.hasInputChannel ?? false}
          tool={session.tool}
          onSend={handleSendMessage}
        />
      ) : null}
      {footer}
    </div>
  );
}
