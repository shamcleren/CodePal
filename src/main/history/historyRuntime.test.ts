import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryDiagnostics, SessionHistoryPageRequest } from "../../shared/historyTypes";
import type { SessionRecord } from "../../shared/sessionTypes";
import type { SessionEvent } from "../session/sessionStore";
import {
  applyHistorySettingsAtRuntime,
  createDeferredHistoryWriter,
  createAppHistoryStore,
  registerHistoryIpcHandlers,
  queueAcceptedSessionEventWrite,
} from "./historyRuntime";

describe("historyRuntime", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("creates the app history store inside the userData directory", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-history-runtime-"));

    const store = createAppHistoryStore({ userDataPath: tmpDir, now: () => 1_000 });
    const diagnostics = store.getDiagnostics();

    expect(diagnostics.dbPath).toBe(path.join(tmpDir, "history.sqlite"));
    expect(fs.existsSync(diagnostics.dbPath)).toBe(true);

    store.close();
  });

  it("applies current history settings to runtime cleanup", () => {
    const historyStore = {
      runCleanup: vi.fn(),
    };

    applyHistorySettingsAtRuntime(historyStore, {
      history: {
        persistenceEnabled: false,
        retentionDays: 7,
        maxStorageMb: 250,
      },
    });

    expect(historyStore.runCleanup).toHaveBeenCalledWith({
      retentionDays: 7,
      maxStorageMb: 250,
    });
  });

  it("writes accepted session events from the event payload before any session summary fallback", async () => {
    const historyStore = {
      writeSessionEvent: vi.fn(),
    };
    const event: SessionEvent = {
      sessionId: "session-1",
      tool: "codex",
      status: "running",
      title: "Agent Session",
      task: "Answer the user",
      timestamp: 123,
      activityItems: [
        {
          id: "item-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "Working on it",
          timestamp: 123,
        },
        {
          id: "item-2",
          kind: "tool",
          source: "tool",
          title: "Read",
          body: "Used the full event payload",
          timestamp: 124,
        },
      ],
    };
    const session: SessionRecord = {
      id: "session-1",
      tool: "codex",
      status: "running",
      title: "Agent Session",
      task: "Answer the user",
      updatedAt: 123,
      lastUserMessageAt: 120,
      activityItems: [
        {
          id: "item-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "Truncated session summary",
          timestamp: 123,
        },
      ],
      pendingActions: [{ id: "pending-1", type: "approval", title: "Approve", options: ["allow"] }],
    };
    const writer = createDeferredHistoryWriter({ historyStore });

    queueAcceptedSessionEventWrite({
      historyWriter: writer,
      event,
      session,
      persistenceEnabled: true,
    });

    writer.close();

    expect(historyStore.writeSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          id: "session-1",
          hasPendingActions: true,
          lastUserMessageAt: 120,
        }),
        activityItems: event.activityItems,
      }),
    );
  });

  it("flushes deferred writes before shutdown closes the history store", () => {
    let scheduledFlush: (() => void) | null = null;
    const historyStore = {
      writeSessionEvent: vi.fn(),
    };
    const writer = createDeferredHistoryWriter({
      historyStore,
      scheduleFlush: (flush) => {
        scheduledFlush = flush;
        return "token";
      },
      cancelFlush: () => {
        scheduledFlush = null;
      },
    });

    queueAcceptedSessionEventWrite({
      historyWriter: writer,
      persistenceEnabled: true,
      event: {
        sessionId: "session-1",
        tool: "codex",
        status: "running",
        timestamp: 123,
        activityItems: [
          {
            id: "item-1",
            kind: "message",
            source: "assistant",
            title: "Assistant",
            body: "Pending write",
            timestamp: 123,
          },
        ],
      },
    });

    expect(historyStore.writeSessionEvent).not.toHaveBeenCalled();
    expect(scheduledFlush).toBeTypeOf("function");

    writer.close();

    expect(historyStore.writeSessionEvent).toHaveBeenCalledTimes(1);
    expect(scheduledFlush).toBeNull();
  });

  it("registers history IPC handlers with settings-backed diagnostics", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
    };
    const diagnostics: HistoryDiagnostics = {
      enabled: true,
      dbPath: "/tmp/history.sqlite",
      dbSizeBytes: 42,
      estimatedSessionCount: 3,
      estimatedActivityCount: 9,
      lastCleanupAt: 123,
    };
    const historyStore = {
      getDiagnostics: vi.fn(() => diagnostics),
      getSessionHistoryPage: vi.fn((request: SessionHistoryPageRequest) => ({
        items: [],
        nextCursor: request.cursor ?? null,
        hasMore: false,
      })),
      clearAll: vi.fn(() => diagnostics),
    };

    registerHistoryIpcHandlers({
      ipcMain,
      historyStore,
      getPersistenceEnabled: () => false,
    });

    expect(handlers.has("codepal:get-history-diagnostics")).toBe(true);
    expect(handlers.has("codepal:get-session-history-page")).toBe(true);
    expect(handlers.has("codepal:clear-history-store")).toBe(true);

    const getDiagnostics = handlers.get("codepal:get-history-diagnostics");
    const getPage = handlers.get("codepal:get-session-history-page");
    const clearStore = handlers.get("codepal:clear-history-store");

    expect(getDiagnostics).toBeTruthy();
    expect(getPage).toBeTruthy();
    expect(clearStore).toBeTruthy();

    expect(getDiagnostics?.()).toEqual({ ...diagnostics, enabled: false });
    expect(
      getPage?.({}, { sessionId: "session-1", limit: 20, cursor: "next" }),
    ).toEqual({
      items: [],
      nextCursor: "next",
      hasMore: false,
    });
    expect(await clearStore?.()).toEqual({ ...diagnostics, enabled: false });
  });
});
