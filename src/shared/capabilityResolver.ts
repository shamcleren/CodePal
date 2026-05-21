import { canReply, type SessionRecord } from "./sessionTypes";
import type {
  ActionCapability,
  SessionCapabilityManifest,
} from "./capabilityTypes";

function supported(confidence: ActionCapability["confidence"] = "high"): ActionCapability {
  return { support: "supported", confidence };
}

function bestEffort(reason?: string): ActionCapability {
  return { support: "best_effort", confidence: "low", reason };
}

function unsupported(reason?: string): ActionCapability {
  return { support: "unsupported", confidence: "high", reason };
}

function hasJumpTarget(session: SessionRecord): boolean {
  if (session.externalApproval?.jumpTarget) return true;
  const ctx = session.terminalContext;
  if (!ctx) return false;
  return Boolean(
    ctx.tmuxPane || ctx.weztermPane || ctx.kittyWindow || ctx.terminalSessionId || ctx.tty,
  );
}

export function resolveSessionCapabilities(
  session: SessionRecord,
): SessionCapabilityManifest {
  return {
    jump: hasJumpTarget(session)
      ? supported()
      : unsupported("No terminal context available"),

    sendMessage: canReply(session)
      ? supported()
      : session.terminalContext
        ? bestEffort("Terminal context present but no reliable text delivery path")
        : unsupported("No terminal context"),

    openRepo: session.externalApproval?.jumpTarget?.workspacePath
      ? supported()
      : bestEffort("Workspace path inferred from session metadata"),
  };
}
