import { describe, expect, it, vi } from "vitest";
import * as createActionResponseTransportModule from "./createActionResponseTransport";
import { createSessionStore } from "../session/sessionStore";
import { dispatchActionResponse } from "./dispatchActionResponse";

describe("dispatchActionResponse", () => {
  it("when pending matches without responseTarget: uses fallback transport, send then close then broadcast", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
    });

    const expectedLine = JSON.stringify({
      type: "action_response",
      sessionId: "s1",
      actionId: "act-1",
      response: { kind: "option", value: "A" },
    });

    const callOrder: string[] = [];
    const origClose = store.closePendingAction.bind(store);
    vi.spyOn(store, "closePendingAction").mockImplementation((sid, aid, reason) => {
      callOrder.push("close");
      origClose(sid, aid, reason);
    });

    const fromTargetSpy = vi.spyOn(
      createActionResponseTransportModule,
      "createActionResponseTransportFromResponseTarget",
    );

    const transport = {
      send: vi.fn(async (line: string) => {
        callOrder.push("send");
        expect(line).toBe(expectedLine);
      }),
    };

    const broadcastSessions = vi.fn(() => {
      callOrder.push("broadcast");
    });

    const result = await dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "act-1",
      "A",
    );

    expect(result).toBe(true);
    expect(callOrder).toEqual(["send", "close", "broadcast"]);
    expect(store.getSessions()[0].pendingActions).toBeUndefined();
    expect(transport.send).toHaveBeenCalledWith(expectedLine);
    expect(broadcastSessions).toHaveBeenCalledTimes(1);
    expect(fromTargetSpy).not.toHaveBeenCalled();

    fromTargetSpy.mockRestore();
  });

  it("when prepare returns responseTarget: builds transport from target and does not use fallback send", async () => {
    const store = createSessionStore();
    const sockPath = "/tmp/codepal-dispatch-target.sock";
    const target = { mode: "socket" as const, socketPath: sockPath, timeoutMs: 750 };

    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
      responseTarget: target,
    });

    const expectedLine = JSON.stringify({
      type: "action_response",
      sessionId: "s1",
      actionId: "act-1",
      response: { kind: "option", value: "A" },
    });

    const targetSend = vi.fn(async () => {});
    const fromTargetSpy = vi
      .spyOn(createActionResponseTransportModule, "createActionResponseTransportFromResponseTarget")
      .mockReturnValue({ send: targetSend });

    const fallbackTransport = {
      send: vi.fn(async () => {
        throw new Error("fallback should not run");
      }),
    };
    const broadcastSessions = vi.fn();

    const result = await dispatchActionResponse(
      store,
      fallbackTransport,
      broadcastSessions,
      "s1",
      "act-1",
      "A",
    );

    expect(result).toBe(true);
    expect(fromTargetSpy).toHaveBeenCalledWith(target);
    expect(targetSend).toHaveBeenCalledWith(expectedLine);
    expect(fallbackTransport.send).not.toHaveBeenCalled();
    expect(broadcastSessions).toHaveBeenCalledTimes(1);
    expect(store.getSessions()[0].pendingActions).toBeUndefined();

    fromTargetSpy.mockRestore();
  });

  it("when send fails: does not complete, does not broadcast", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
    });

    const closeSpy = vi.spyOn(store, "closePendingAction");
    const transport = {
      send: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const broadcastSessions = vi.fn();

    await expect(
      dispatchActionResponse(store, transport, broadcastSessions, "s1", "act-1", "A"),
    ).rejects.toThrow("network down");

    expect(closeSpy).not.toHaveBeenCalled();
    expect(broadcastSessions).not.toHaveBeenCalled();
    expect(store.getSessions()[0].pendingActions).toHaveLength(1);
  });

  it("when send succeeds: closePendingAction is called only for (sessionId, actionId, consumed_local)", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "keep",
        type: "approval",
        title: "K",
        options: ["Allow", "Deny"],
      },
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: {
        id: "remove-me",
        type: "approval",
        title: "R",
        options: ["Allow", "Deny"],
      },
    });

    const closeSpy = vi.spyOn(store, "closePendingAction");
    const transport = { send: vi.fn(async () => {}) };
    const broadcastSessions = vi.fn();

    await dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "remove-me",
      "Allow",
    );

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith("s1", "remove-me", "consumed_local");
    const rec = store.getSessions()[0];
    expect(rec.pendingActions).toEqual([expect.objectContaining({ id: "keep" })]);
  });

  it("when action was already closed remotely: emits an error result, warns, no send or broadcast", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingClosed: {
        actionId: "act-1",
        reason: "consumed_remote",
      },
    });

    const transport = { send: vi.fn(async () => {}) };
    const broadcastSessions = vi.fn();
    const emitResult = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "act-1",
      "A",
      emitResult,
    );

    expect(result).toBe(false);
    expect(transport.send).not.toHaveBeenCalled();
    expect(broadcastSessions).not.toHaveBeenCalled();
    expect(emitResult).toHaveBeenCalledWith({
      sessionId: "s1",
      actionId: "act-1",
      result: "error",
      option: "A",
      error: "Action was already handled.",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[CodePal] duplicate action_response ignored:",
      "s1",
      "act-1",
    );

    warnSpy.mockRestore();
  });

  it("when the same action is already in flight: emits an error for the second request before a second send", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
    });

    let resolveSend: (() => void) | undefined;
    const sendGate = new Promise<void>((resolve) => {
      resolveSend = resolve;
    });
    const transport = {
      send: vi.fn(async () => {
        await sendGate;
      }),
    };
    const broadcastSessions = vi.fn();
    const emitResult = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "act-1",
      "A",
      emitResult,
    );
    const second = await dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "act-1",
      "A",
      emitResult,
    );

    expect(second).toBe(false);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(broadcastSessions).not.toHaveBeenCalled();
    expect(emitResult).toHaveBeenCalledWith({
      sessionId: "s1",
      actionId: "act-1",
      result: "error",
      option: "A",
      error: "Action response is already being sent.",
    });

    resolveSend?.();

    await expect(first).resolves.toBe(true);
    expect(broadcastSessions).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it("when send succeeds: calls emitResult with success result", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
    });

    const transport = { send: vi.fn(async () => {}) };
    const broadcastSessions = vi.fn();
    const emitResult = vi.fn();

    await dispatchActionResponse(store, transport, broadcastSessions, "s1", "act-1", "Allow", emitResult);

    expect(emitResult).toHaveBeenCalledWith({
      sessionId: "s1",
      actionId: "act-1",
      result: "success",
      option: "Allow",
    });
  });

  it("when send fails: calls emitResult with error result then rethrows", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
    });

    const transport = { send: vi.fn(async () => { throw new Error("socket refused"); }) };
    const broadcastSessions = vi.fn();
    const emitResult = vi.fn();

    await expect(
      dispatchActionResponse(store, transport, broadcastSessions, "s1", "act-1", "Allow", emitResult),
    ).rejects.toThrow("socket refused");

    expect(emitResult).toHaveBeenCalledWith({
      sessionId: "s1",
      actionId: "act-1",
      result: "error",
      option: "Allow",
      error: "socket refused",
    });
  });

  it("when preparing the response payload fails: emits an error result then rethrows", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
    });

    const transport = { send: vi.fn(async () => {}) };
    const broadcastSessions = vi.fn();
    const emitResult = vi.fn();

    await expect(
      dispatchActionResponse(store, transport, broadcastSessions, "s1", "act-1", "允许", emitResult),
    ).rejects.toThrow("invalid approval option: 允许");

    expect(transport.send).not.toHaveBeenCalled();
    expect(broadcastSessions).not.toHaveBeenCalled();
    expect(emitResult).toHaveBeenCalledWith({
      sessionId: "s1",
      actionId: "act-1",
      result: "error",
      option: "允许",
      error: "invalid approval option: 允许",
    });
  });

  it("when emitResult is omitted: does not throw", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "act-1", type: "approval", title: "Run?", options: ["Allow", "Deny"] },
    });
    const transport = { send: vi.fn(async () => {}) };
    await expect(
      dispatchActionResponse(store, { send: transport.send }, vi.fn(), "s1", "act-1", "Allow"),
    ).resolves.toBe(true);
  });

  it("when pending does not match: emits an error result and does not call transport.send", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
    });

    const transport = {
      send: vi.fn(async () => {}),
    };
    const broadcastSessions = vi.fn();
    const emitResult = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "wrong-id",
      "A",
      emitResult,
    );

    expect(result).toBe(false);
    expect(transport.send).not.toHaveBeenCalled();
    expect(broadcastSessions).not.toHaveBeenCalled();
    expect(emitResult).toHaveBeenCalledWith({
      sessionId: "s1",
      actionId: "wrong-id",
      result: "error",
      option: "A",
      error: "Pending action was not found.",
    });
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
