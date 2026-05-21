import type { SessionRecord } from "../../shared/sessionTypes";
import type { SessionActionType } from "../../shared/capabilityTypes";
import type { SessionJumpService } from "../jump/sessionJumpService";
import type { TerminalTextSender } from "../terminal/terminalTextSender";

export type ActionResult = {
  ok: boolean;
  action: SessionActionType;
  sessionId: string;
  error?: string;
};

export type ActionBrokerSessionStore = {
  getSession(sessionId: string): SessionRecord | null;
};

export type ActionBrokerDeps = {
  sessionStore: ActionBrokerSessionStore;
  jumpService: SessionJumpService;
  terminalTextSender: TerminalTextSender;
  openPath: (path: string) => Promise<string>;
};

export function createActionBroker(deps: ActionBrokerDeps) {
  async function executeAction(
    sessionId: string,
    action: SessionActionType,
    payload?: { text?: string },
  ): Promise<ActionResult> {
    const session = deps.sessionStore.getSession(sessionId);
    if (!session) {
      return { ok: false, action, sessionId, error: "Session not found" };
    }

    switch (action) {
      case "jump":
        return handleJump(session);
      case "sendMessage":
        return handleSendMessage(session, payload?.text);
      case "openRepo":
        return handleOpenRepo(session);
      default:
        return { ok: false, action, sessionId, error: `Unknown action: ${action}` };
    }
  }

  async function handleJump(session: SessionRecord): Promise<ActionResult> {
    const target =
      session.externalApproval?.jumpTarget ??
      buildJumpTargetFromTerminalContext(session);
    if (!target) {
      return { ok: false, action: "jump", sessionId: session.id, error: "No jump target available" };
    }
    const result = await deps.jumpService.jumpTo(target);
    return result.ok
      ? { ok: true, action: "jump", sessionId: session.id }
      : { ok: false, action: "jump", sessionId: session.id, error: result.error };
  }

  async function handleSendMessage(
    session: SessionRecord,
    text?: string,
  ): Promise<ActionResult> {
    if (!text?.trim()) {
      return { ok: false, action: "sendMessage", sessionId: session.id, error: "No message text" };
    }
    const result = await deps.terminalTextSender.send(session, text);
    return result.ok
      ? { ok: true, action: "sendMessage", sessionId: session.id }
      : { ok: false, action: "sendMessage", sessionId: session.id, error: result.error };
  }

  async function handleOpenRepo(session: SessionRecord): Promise<ActionResult> {
    const path = session.externalApproval?.jumpTarget?.workspacePath;
    if (!path) {
      return { ok: false, action: "openRepo", sessionId: session.id, error: "No repository path available" };
    }
    try {
      await deps.openPath(path);
      return { ok: true, action: "openRepo", sessionId: session.id };
    } catch (err) {
      return {
        ok: false,
        action: "openRepo",
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { executeAction };
}

function buildJumpTargetFromTerminalContext(
  session: SessionRecord,
): import("../../shared/sessionTypes").SessionJumpTarget | null {
  const ctx = session.terminalContext;
  if (!ctx) return null;
  return {
    agent: session.tool as import("../../shared/sessionTypes").JumpTargetAgent,
    appName: ctx.app,
    tty: ctx.tty,
    terminalSessionId: ctx.terminalSessionId,
    tmuxPane: ctx.tmuxPane,
    tmuxSocket: ctx.tmuxSocket,
    weztermPane: ctx.weztermPane,
    kittyWindow: ctx.kittyWindow,
    fallbackBehavior: "activate_app",
  };
}
