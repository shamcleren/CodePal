import type { PendingCloseReason, ResponseTarget } from "../../shared/sessionTypes";
import type { ActionResponseTransport } from "./actionResponseTransport";
import { createActionResponseTransportFromResponseTarget } from "./createActionResponseTransport";

export type PendingActionResponsePrep = {
  line: string;
  responseTarget?: ResponseTarget;
};

export type ActionResponseSessionStore = {
  preparePendingActionResponse(
    sessionId: string,
    actionId: string,
    option: string,
  ): PendingActionResponsePrep | null;
  closePendingAction(sessionId: string, actionId: string, reason: PendingCloseReason): void;
  /** True when the action is no longer pending because it was already closed (e.g. first-win consumed). */
  isPendingActionClosed(sessionId: string, actionId: string): boolean;
};

const inFlightPendingActionResponseKeys = new Set<string>();

function getPendingActionResponseKey(sessionId: string, actionId: string): string {
  return `${sessionId}\u0000${actionId}`;
}

export async function dispatchActionResponse(
  sessionStore: ActionResponseSessionStore,
  fallbackTransport: ActionResponseTransport,
  broadcastSessions: () => void,
  sessionId: string,
  actionId: string,
  option: string,
): Promise<boolean> {
  const inFlightKey = getPendingActionResponseKey(sessionId, actionId);
  if (inFlightPendingActionResponseKeys.has(inFlightKey)) {
    console.warn(
      "[CodePal] action_response ignored (already in flight):",
      `sessionId=${sessionId} actionId=${actionId}`,
    );
    return false;
  }

  const prep = sessionStore.preparePendingActionResponse(sessionId, actionId, option);
  if (!prep) {
    if (sessionStore.isPendingActionClosed(sessionId, actionId)) {
      console.warn("[CodePal] duplicate action_response ignored:", sessionId, actionId);
    }
    return false;
  }

  inFlightPendingActionResponseKeys.add(inFlightKey);

  try {
    const transport =
      prep.responseTarget !== undefined
        ? createActionResponseTransportFromResponseTarget(prep.responseTarget)
        : fallbackTransport;

    await transport.send(prep.line);
    sessionStore.closePendingAction(sessionId, actionId, "consumed_local");
    broadcastSessions();
    return true;
  } finally {
    inFlightPendingActionResponseKeys.delete(inFlightKey);
  }
}
