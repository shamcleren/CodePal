import type { SessionEvent } from "../session/sessionStore";

export function buildHistoryDebugSubset(event: SessionEvent): Record<string, unknown> {
  return {
    sessionId: event.sessionId,
    tool: event.tool,
    status: event.status,
    timestamp: event.timestamp,
    type: event.type ?? null,
    meta: event.meta ?? null,
    pendingAction:
      event.pendingAction && event.pendingAction !== null
        ? {
            id: event.pendingAction.id,
            type: event.pendingAction.type,
            title: event.pendingAction.title,
          }
        : null,
    pendingClosed: event.pendingClosed ?? null,
  };
}
