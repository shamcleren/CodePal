export type ActionCapabilitySupport =
  | "supported"
  | "partial"
  | "best_effort"
  | "unsupported";

export type ActionCapabilityConfidence = "high" | "medium" | "low";

export interface ActionCapability {
  support: ActionCapabilitySupport;
  confidence: ActionCapabilityConfidence;
  reason?: string;
}

export type SessionActionType =
  | "jump"
  | "sendMessage"
  | "openRepo";

export const SESSION_ACTION_TYPES: readonly SessionActionType[] = [
  "jump",
  "sendMessage",
  "openRepo",
] as const;

export interface SessionCapabilityManifest {
  jump: ActionCapability;
  sendMessage: ActionCapability;
  openRepo: ActionCapability;
}

export function isSessionCapabilityManifest(
  value: unknown,
): value is SessionCapabilityManifest {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  for (const key of SESSION_ACTION_TYPES) {
    const cap = o[key];
    if (!cap || typeof cap !== "object") return false;
    const c = cap as Record<string, unknown>;
    if (typeof c.support !== "string") return false;
    if (typeof c.confidence !== "string") return false;
  }
  return true;
}
