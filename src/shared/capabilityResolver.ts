import { SESSION_REPLY_CHANNEL_ENABLED, canUseSessionReply, type SessionRecord } from "./sessionTypes";
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

const REPLY_DISABLED_REASON =
  "Reply channel disabled until CodePal can avoid affecting the original agent flow";

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

    sendMessage: SESSION_REPLY_CHANNEL_ENABLED && canUseSessionReply(session)
      ? supported()
      : unsupported(REPLY_DISABLED_REASON),

    openRepo: session.externalApproval?.jumpTarget?.workspacePath
      ? supported()
      : bestEffort("Workspace path inferred from session metadata"),
  };
}
