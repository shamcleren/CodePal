import { beforeEach, describe, expect, it, vi } from "vitest";

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
    removeListener,
  },
}));

describe("preload history bridge", () => {
  beforeEach(() => {
    exposeInMainWorld.mockReset();
    invoke.mockReset();
    on.mockReset();
    removeListener.mockReset();
  });

  it("exposes history IPC methods to the renderer bridge", async () => {
    await import("./index");

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    const api = exposeInMainWorld.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(typeof api.getHistoryDiagnostics).toBe("function");
    expect(typeof api.getSessionHistoryPage).toBe("function");
    expect(typeof api.clearHistoryStore).toBe("function");

    (api.getHistoryDiagnostics as () => Promise<unknown>)();
    (api.getSessionHistoryPage as (input: unknown) => Promise<unknown>)({
      sessionId: "session-1",
      limit: 25,
    });
    (api.clearHistoryStore as () => Promise<unknown>)();

    expect(invoke).toHaveBeenNthCalledWith(1, "codepal:get-history-diagnostics");
    expect(invoke).toHaveBeenNthCalledWith(2, "codepal:get-session-history-page", {
      sessionId: "session-1",
      limit: 25,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "codepal:clear-history-store");
  });
});
