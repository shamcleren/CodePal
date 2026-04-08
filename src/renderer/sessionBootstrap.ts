import type { SessionRecord } from "../shared/sessionTypes";
import type { MonitorSessionRow } from "./monitorSession";
import { sessionRecordToRow } from "./sessionRows";

export function compareMonitorSessionRows(a: MonitorSessionRow, b: MonitorSessionRow): number {
  const aUserTs = a.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
  const bUserTs = b.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
  if (aUserTs !== bUserTs) {
    return bUserTs - aUserTs;
  }
  if (a.updatedAt !== b.updatedAt) {
    return b.updatedAt - a.updatedAt;
  }
  return a.id.localeCompare(b.id);
}

export function rowsFromSessions(sessions: SessionRecord[]): MonitorSessionRow[] {
  return sessions.map(sessionRecordToRow).sort(compareMonitorSessionRows);
}

function sameStringArray(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a?.length ? a : undefined;
  const right = b?.length ? b : undefined;
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function sameActivityItems(
  a: SessionRecord["activityItems"],
  b: SessionRecord["activityItems"],
): boolean {
  const left = a?.length ? a : undefined;
  const right = b?.length ? b : undefined;
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }
    return (
      item.id === other.id &&
      item.kind === other.kind &&
      item.source === other.source &&
      item.title === other.title &&
      item.body === other.body &&
      item.timestamp === other.timestamp &&
      item.tone === other.tone &&
      item.toolName === other.toolName &&
      item.toolPhase === other.toolPhase &&
      JSON.stringify(item.meta ?? null) === JSON.stringify(other.meta ?? null)
    );
  });
}

function samePendingActions(
  a: SessionRecord["pendingActions"],
  b: SessionRecord["pendingActions"],
): boolean {
  const left = a?.length ? a : undefined;
  const right = b?.length ? b : undefined;
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }
    return (
      item.id === other.id &&
      item.type === other.type &&
      item.title === other.title &&
      sameStringArray(item.options, other.options)
    );
  });
}

function sessionMatchesRow(row: MonitorSessionRow, session: SessionRecord): boolean {
  return (
    row.id === session.id &&
    row.tool === session.tool &&
    row.status === session.status &&
    row.title === session.title &&
    row.task === session.task &&
    row.updatedAt === session.updatedAt &&
    row.lastUserMessageAt === session.lastUserMessageAt &&
    sameActivityItems(row.activityItems, session.activityItems) &&
    sameStringArray(row.activities, session.activities) &&
    samePendingActions(row.pendingActions, session.pendingActions)
  );
}

export function reconcileRows(
  currentRows: MonitorSessionRow[],
  sessions: SessionRecord[],
): MonitorSessionRow[] {
  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  return sessions
    .map((session) => {
      const existing = currentById.get(session.id);
      return existing && sessionMatchesRow(existing, session)
        ? existing
        : sessionRecordToRow(session);
    })
    .sort(compareMonitorSessionRows);
}

export function hydrateRowsIfEmpty(
  currentRows: MonitorSessionRow[],
  sessions: SessionRecord[],
): MonitorSessionRow[] {
  return currentRows.length === 0 ? rowsFromSessions(sessions) : currentRows;
}
