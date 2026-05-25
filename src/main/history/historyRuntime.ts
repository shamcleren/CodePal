import path from "node:path";
import type { IpcMain } from "electron";
import type { AppSettings } from "../../shared/appSettings";
import type {
  HistoryDiagnostics,
  SessionHistoryPageRequest,
  SessionHistorySummary,
  SessionHistorySummaryRequest,
} from "../../shared/historyTypes";
import { isSessionStatus, type SessionRecord, type SessionStatus } from "../../shared/sessionTypes";
import type { SessionEvent } from "../session/sessionStore";
import { createHistoryStore, type PersistedSessionWrite, type SessionSeedRecord } from "./historyStore";

type HistoryStore = ReturnType<typeof createHistoryStore>;

type HistoryStoreLike = Pick<
  HistoryStore,
  "clearAll" | "getDiagnostics" | "getSessionHistoryPage" | "writeSessionEvent"
>;

type RegisterHistoryIpcHandlersOptions = {
  ipcMain: Pick<IpcMain, "handle">;
  historyStore: Pick<
    HistoryStore,
    "clearAll" | "getDiagnostics" | "getRecentSessions" | "getSessionHistoryPage"
  > | null;
  getPersistenceEnabled: () => boolean;
};

type DeferredHistoryWriter = {
  enqueue: (write: PersistedSessionWrite) => void;
  close: () => void;
};

type QueueAcceptedSessionEventWriteOptions = {
  historyWriter: Pick<DeferredHistoryWriter, "enqueue">;
  event: SessionEvent;
  session?: SessionRecord;
  persistenceEnabled: boolean;
};

type CreateDeferredHistoryWriterOptions = {
  historyStore: Pick<HistoryStoreLike, "writeSessionEvent">;
  onError?: (error: unknown) => void;
  scheduleFlush?: (flush: () => void) => unknown;
  cancelFlush?: (handle: unknown) => void;
};

const DEFAULT_SUMMARY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SUMMARY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_SUMMARY_LIMIT = 300;
const MAX_SUMMARY_LIMIT = 500;

function normalizeSummaryMaxAgeMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.trunc(value), MAX_SUMMARY_MAX_AGE_MS)
    : DEFAULT_SUMMARY_MAX_AGE_MS;
}

function normalizeSummaryLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.trunc(value), MAX_SUMMARY_LIMIT)
    : DEFAULT_SUMMARY_LIMIT;
}

function normalizeSummaryStatus(status: string): SessionStatus {
  return isSessionStatus(status) ? status : "completed";
}

function toSessionHistorySummary(record: SessionSeedRecord): SessionHistorySummary {
  return {
    id: record.id,
    tool: record.tool,
    status: normalizeSummaryStatus(record.status),
    ...(record.title ? { title: record.title } : {}),
    ...(record.latestTask ? { task: record.latestTask } : {}),
    updatedAt: record.updatedAt,
    ...(record.lastUserMessageAt !== null ? { lastUserMessageAt: record.lastUserMessageAt } : {}),
  };
}

export function createAppHistoryStore(options: { userDataPath: string; now?: () => number }) {
  return createHistoryStore({
    dbPath: path.join(options.userDataPath, "history.sqlite"),
    now: options.now,
  });
}

export function applyHistorySettingsAtRuntime(
  historyStore: Pick<HistoryStore, "runCleanup">,
  settings: Pick<AppSettings, "history">,
) {
  return historyStore.runCleanup({
    detailRetention: settings.history.detailRetention,
    analyticsRetention: settings.history.analyticsRetention,
  });
}

export function toHistoryDiagnostics(
  historyStore: Pick<HistoryStoreLike, "getDiagnostics">,
  enabled: boolean,
): HistoryDiagnostics {
  return {
    ...historyStore.getDiagnostics(),
    enabled,
  };
}

function disabledHistoryDiagnostics(): HistoryDiagnostics {
  return {
    enabled: false,
    dbPath: "",
    dbSizeBytes: 0,
    estimatedSessionCount: 0,
    estimatedActivityCount: 0,
    lastCleanupAt: null,
  };
}

export function buildPersistedSessionWrite(
  event: SessionEvent,
  session?: SessionRecord,
): PersistedSessionWrite {
  const activityItems = event.activityItems ?? session?.activityItems ?? [];

  return {
    session: {
      id: session?.id ?? event.sessionId,
      tool: session?.tool ?? event.tool,
      status: session?.status ?? event.status,
      title: session?.title ?? event.title,
      latestTask: session?.task ?? event.task,
      updatedAt: session?.updatedAt ?? event.timestamp,
      lastUserMessageAt: session?.lastUserMessageAt,
      hasPendingActions: (session?.pendingActions?.length ?? 0) > 0,
    },
    activityItems,
    debugEvent: {
      timestamp: event.timestamp,
      tool: event.tool,
      status: event.status,
      eventType: typeof event.type === "string" ? event.type : undefined,
      rawSubset: {
        sessionId: event.sessionId,
        ...(event.title ? { title: event.title } : {}),
        ...(event.task ? { task: event.task } : {}),
        ...(event.meta ? { meta: event.meta } : {}),
      },
    },
  };
}

export function createDeferredHistoryWriter(
  options: CreateDeferredHistoryWriterOptions,
): DeferredHistoryWriter {
  const scheduleFlush = options.scheduleFlush ?? ((flush: () => void) => setImmediate(flush));
  const cancelFlush = options.cancelFlush ?? ((handle: unknown) => clearImmediate(handle as NodeJS.Immediate));
  let scheduledHandle: unknown = null;
  let pendingWrites: PersistedSessionWrite[] = [];
  let isClosed = false;

  function flushPending() {
    scheduledHandle = null;
    if (pendingWrites.length === 0) {
      return;
    }
    const writes = pendingWrites;
    pendingWrites = [];
    for (const write of writes) {
      try {
        options.historyStore.writeSessionEvent(write);
      } catch (error) {
        options.onError?.(error);
      }
    }
  }

  return {
    enqueue(write: PersistedSessionWrite) {
      if (isClosed) {
        return;
      }
      pendingWrites.push(write);
      if (scheduledHandle === null) {
        scheduledHandle = scheduleFlush(flushPending);
      }
    },
    close() {
      isClosed = true;
      if (scheduledHandle !== null) {
        cancelFlush(scheduledHandle);
        scheduledHandle = null;
      }
      flushPending();
    },
  };
}

export function queueAcceptedSessionEventWrite(
  options: QueueAcceptedSessionEventWriteOptions,
) {
  if (!options.persistenceEnabled) {
    return;
  }

  const write = buildPersistedSessionWrite(options.event, options.session);
  options.historyWriter.enqueue(write);
}

export function registerHistoryIpcHandlers(options: RegisterHistoryIpcHandlersOptions) {
  const failOnceSessionId = process.env.CODEPAL_E2E_HISTORY_FAIL_ONCE_SESSION?.trim() || "";
  const failedSessionIds = new Set<string>();

  options.ipcMain.handle("codepal:get-history-diagnostics", () =>
    options.historyStore
      ? toHistoryDiagnostics(options.historyStore, options.getPersistenceEnabled())
      : disabledHistoryDiagnostics(),
  );
  options.ipcMain.handle("codepal:get-session-history-page", (_event, payload: unknown) => {
    if (!options.historyStore) {
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
      };
    }
    const request = payload as SessionHistoryPageRequest;
    if (
      failOnceSessionId &&
      request.sessionId === failOnceSessionId &&
      !request.cursor &&
      !failedSessionIds.has(request.sessionId)
    ) {
      failedSessionIds.add(request.sessionId);
      throw new Error("e2e first history load fails");
    }
    return options.historyStore.getSessionHistoryPage(request);
  });
  options.ipcMain.handle("codepal:get-session-history-summaries", (_event, payload: unknown) => {
    if (!options.historyStore) {
      return [];
    }
    const request = (payload ?? {}) as SessionHistorySummaryRequest;
    return options.historyStore
      .getRecentSessions({
        maxAgeMs: normalizeSummaryMaxAgeMs(request.maxAgeMs),
        limit: normalizeSummaryLimit(request.limit),
      })
      .map(toSessionHistorySummary);
  });
  options.ipcMain.handle("codepal:clear-history-store", () => {
    if (!options.historyStore) {
      return disabledHistoryDiagnostics();
    }
    options.historyStore.clearAll();
    return toHistoryDiagnostics(options.historyStore, options.getPersistenceEnabled());
  });
}
