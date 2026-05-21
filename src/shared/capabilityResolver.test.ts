import { describe, expect, it } from "vitest";
import type { SessionRecord } from "./sessionTypes";
import { resolveSessionCapabilities } from "./capabilityResolver";

function baseSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s1",
    tool: "claude",
    status: "running",
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("resolveSessionCapabilities", () => {
  describe("jump", () => {
    it("is supported when externalApproval has a jumpTarget", () => {
      const session = baseSession({
        externalApproval: {
          kind: "approval_required",
          title: "Test",
          message: "Test",
          sourceTool: "claude",
          updatedAt: Date.now(),
          jumpTarget: {
            agent: "claude",
            fallbackBehavior: "activate_app",
          },
        },
      });
      const caps = resolveSessionCapabilities(session);
      expect(caps.jump.support).toBe("supported");
    });

    it("is supported when terminalContext has a tmux pane", () => {
      const session = baseSession({
        terminalContext: { app: "tmux", tmuxPane: "%1" },
      });
      const caps = resolveSessionCapabilities(session);
      expect(caps.jump.support).toBe("supported");
    });

    it("is supported when terminalContext has a tty", () => {
      const session = baseSession({
        terminalContext: { tty: "/dev/ttys001" },
      });
      const caps = resolveSessionCapabilities(session);
      expect(caps.jump.support).toBe("supported");
    });

    it("is unsupported when no terminal context or jump target", () => {
      const session = baseSession();
      const caps = resolveSessionCapabilities(session);
      expect(caps.jump.support).toBe("unsupported");
    });
  });

  describe("sendMessage", () => {
    it("is supported when canReply returns true", () => {
      const session = baseSession({
        terminalContext: { tmuxPane: "%1" },
      });
      const caps = resolveSessionCapabilities(session);
      expect(caps.sendMessage.support).toBe("supported");
    });

    it("is best_effort when terminalContext exists but canReply is false", () => {
      const session = baseSession({
        terminalContext: { app: "Terminal" },
      });
      const caps = resolveSessionCapabilities(session);
      expect(caps.sendMessage.support).toBe("best_effort");
    });

    it("is unsupported when no terminal context", () => {
      const session = baseSession();
      const caps = resolveSessionCapabilities(session);
      expect(caps.sendMessage.support).toBe("unsupported");
    });
  });

  describe("openRepo", () => {
    it("is supported when workspacePath is in jumpTarget", () => {
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
      const caps = resolveSessionCapabilities(session);
      expect(caps.openRepo.support).toBe("supported");
    });

    it("is best_effort otherwise", () => {
      const session = baseSession();
      const caps = resolveSessionCapabilities(session);
      expect(caps.openRepo.support).toBe("best_effort");
    });
  });
});
