import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "../../shared/sessionTypes";
import { createActionBroker, type ActionBrokerSessionStore } from "./actionBroker";

function baseSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s1",
    tool: "claude",
    status: "completed",
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createMockStore(session?: SessionRecord): ActionBrokerSessionStore {
  return {
    getSession: vi.fn(() => session ?? null),
  };
}

function createMockJumpService() {
  return { jumpTo: vi.fn().mockResolvedValue({ ok: true, mode: "precise" }) };
}

function createMockTerminalTextSender() {
  return { send: vi.fn().mockResolvedValue({ ok: true }) };
}

function createMockOpenPath() {
  return vi.fn().mockResolvedValue("");
}

describe("ActionBroker", () => {
  describe("executeAction", () => {
    it("returns error when session not found", async () => {
      const broker = createActionBroker({
        sessionStore: createMockStore(undefined),
        jumpService: createMockJumpService(),
        terminalTextSender: createMockTerminalTextSender(),
        openPath: createMockOpenPath(),
      });

      const result = await broker.executeAction("missing", "jump");
      expect(result).toEqual({
        ok: false,
        action: "jump",
        sessionId: "missing",
        error: "Session not found",
      });
    });
  });

  describe("jump", () => {
    it("succeeds when session has a jump target", async () => {
      const jumpService = createMockJumpService();
      const session = baseSession({
        externalApproval: {
          kind: "approval_required",
          title: "Test",
          message: "Test",
          sourceTool: "claude",
          updatedAt: Date.now(),
          jumpTarget: {
            agent: "claude",
            appName: "Claude",
            fallbackBehavior: "activate_app",
          },
        },
      });

      const broker = createActionBroker({
        sessionStore: createMockStore(session),
        jumpService,
        terminalTextSender: createMockTerminalTextSender(),
        openPath: createMockOpenPath(),
      });

      const result = await broker.executeAction("s1", "jump");
      expect(result.ok).toBe(true);
      expect(jumpService.jumpTo).toHaveBeenCalled();
    });

    it("derives jump target from terminalContext when no externalApproval", async () => {
      const jumpService = createMockJumpService();
      const session = baseSession({
        terminalContext: { tmuxPane: "%1", app: "tmux" },
      });

      const broker = createActionBroker({
        sessionStore: createMockStore(session),
        jumpService,
        terminalTextSender: createMockTerminalTextSender(),
        openPath: createMockOpenPath(),
      });

      const result = await broker.executeAction("s1", "jump");
      expect(result.ok).toBe(true);
      expect(jumpService.jumpTo).toHaveBeenCalledWith(
        expect.objectContaining({ tmuxPane: "%1", fallbackBehavior: "activate_app" }),
      );
    });

    it("fails when no jump target is available", async () => {
      const session = baseSession();
      const broker = createActionBroker({
        sessionStore: createMockStore(session),
        jumpService: createMockJumpService(),
        terminalTextSender: createMockTerminalTextSender(),
        openPath: createMockOpenPath(),
      });

      const result = await broker.executeAction("s1", "jump");
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("sendMessage", () => {
    it("delegates to terminal text sender", async () => {
      const terminalTextSender = createMockTerminalTextSender();
      const session = baseSession({
        terminalContext: { tmuxPane: "%1" },
      });

      const broker = createActionBroker({
        sessionStore: createMockStore(session),
        jumpService: createMockJumpService(),
        terminalTextSender,
        openPath: createMockOpenPath(),
      });

      const result = await broker.executeAction("s1", "sendMessage", { text: "hello" });
      expect(result.ok).toBe(true);
      expect(terminalTextSender.send).toHaveBeenCalledWith(session, "hello");
    });

    it("fails when no text is provided", async () => {
      const broker = createActionBroker({
        sessionStore: createMockStore(baseSession()),
        jumpService: createMockJumpService(),
        terminalTextSender: createMockTerminalTextSender(),
        openPath: createMockOpenPath(),
      });

      const result = await broker.executeAction("s1", "sendMessage");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("No message text");
    });
  });

  describe("openRepo", () => {
    it("opens workspacePath from jumpTarget", async () => {
      const openPath = createMockOpenPath();
      const session = baseSession({
        externalApproval: {
          kind: "approval_required",
          title: "Test",
          message: "Test",
          sourceTool: "claude",
          updatedAt: Date.now(),
          jumpTarget: {
            agent: "claude",
            workspacePath: "/Users/dev/project",
            fallbackBehavior: "activate_app",
          },
        },
      });

      const broker = createActionBroker({
        sessionStore: createMockStore(session),
        jumpService: createMockJumpService(),
        terminalTextSender: createMockTerminalTextSender(),
        openPath,
      });

      const result = await broker.executeAction("s1", "openRepo");
      expect(result.ok).toBe(true);
      expect(openPath).toHaveBeenCalledWith("/Users/dev/project");
    });

    it("fails when no workspacePath is available", async () => {
      const session = baseSession();
      const broker = createActionBroker({
        sessionStore: createMockStore(session),
        jumpService: createMockJumpService(),
        terminalTextSender: createMockTerminalTextSender(),
        openPath: createMockOpenPath(),
      });

      const result = await broker.executeAction("s1", "openRepo");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("No repository path available");
    });
  });
});
