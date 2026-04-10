import path from "node:path";
import type { IpcMain } from "electron";
import type { AppSettings } from "../../shared/appSettings";
import type { HistoryDiagnostics, SessionHistoryPageRequest } from "../../shared/historyTypes";
import type { SessionRecord } from "../../shared/sessionTypes";
import type { SessionEvent } from "../session/sessionStore";
import { createHistoryStore, type PersistedSessionWrite } from "./historyStore";

type HistoryStore = ReturnType<typeof createHistoryStore>;

type HistoryStoreLike = Pick<
  HistoryStore,
  "clearAll" | "getDiagnostics" | "getSessionHistoryPage" | "writeSessionEvent"
>;

type RegisterHistoryIpcHandlersOptions = {
  ipcMain: Pick<IpcMain, "handle">;
  historyStore: Pick<HistoryStore, "clearAll" | "getDiagnostics" | "getSessionHistoryPage">;
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
    retentionDays: settings.history.retentionDays,
    maxStorageMb: settings.history.maxStorageMb,
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
    toHistoryDiagnostics(options.historyStore, options.getPersistenceEnabled()),
  );
  options.ipcMain.handle("codepal:get-session-history-page", (_event, payload: unknown) => {
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
  options.ipcMain.handle("codepal:clear-history-store", () => {
    options.historyStore.clearAll();
    return toHistoryDiagnostics(options.historyStore, options.getPersistenceEnabled());
  });
}
