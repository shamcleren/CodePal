import type { PendingCloseReason, ResponseTarget } from "../../shared/sessionTypes";
import type { ActionResponseTransport } from "./actionResponseTransport";
import { createActionResponseTransportFromResponseTarget } from "./createActionResponseTransport";

export type ActionResponseResult = {
  sessionId: string;
  actionId: string;
  result: "success" | "error";
  option: string;
  error?: string;
};

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

function emitActionResponseError(
  emitResult: ((result: ActionResponseResult) => void) | undefined,
  sessionId: string,
  actionId: string,
  option: string,
  error: string,
): void {
  emitResult?.({
    sessionId,
    actionId,
    result: "error",
    option,
    error,
  });
}

export async function dispatchActionResponse(
  sessionStore: ActionResponseSessionStore,
  fallbackTransport: ActionResponseTransport,
  broadcastSessions: () => void,
  sessionId: string,
  actionId: string,
  option: string,
  emitResult?: (result: ActionResponseResult) => void,
): Promise<boolean> {
  const inFlightKey = getPendingActionResponseKey(sessionId, actionId);
  if (inFlightPendingActionResponseKeys.has(inFlightKey)) {
    console.warn(
      "[CodePal] action_response ignored (already in flight):",
      `sessionId=${sessionId} actionId=${actionId}`,
    );
    emitActionResponseError(
      emitResult,
      sessionId,
      actionId,
      option,
      "Action response is already being sent.",
    );
    return false;
  }

  let prep: PendingActionResponsePrep | null;
  try {
    prep = sessionStore.preparePendingActionResponse(sessionId, actionId, option);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emitActionResponseError(emitResult, sessionId, actionId, option, error);
    throw err;
  }

  if (!prep) {
    if (sessionStore.isPendingActionClosed(sessionId, actionId)) {
      console.warn("[CodePal] duplicate action_response ignored:", sessionId, actionId);
      emitActionResponseError(
        emitResult,
        sessionId,
        actionId,
        option,
        "Action was already handled.",
      );
    } else {
      emitActionResponseError(
        emitResult,
        sessionId,
        actionId,
        option,
        "Pending action was not found.",
      );
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
    emitResult?.({ sessionId, actionId, result: "success", option });
    return true;
  } catch (err) {
    emitResult?.({
      sessionId,
      actionId,
      result: "error",
      option,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    inFlightPendingActionResponseKeys.delete(inFlightKey);
  }
}
