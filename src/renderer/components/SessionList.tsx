import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { UsageContext, UsageOverview } from "../../shared/usageTypes";
import { formatSessionDuration } from "../../shared/sessionTiming";
import {
  UNKNOWN_PROJECT_PATH,
  isUnknownProjectPath,
  projectDisplayName,
} from "../../shared/projectAttribution";
import { useI18n } from "../i18n";
import type { MonitorSessionRow } from "../monitorSession";
import { moveProjectKey, orderKeyedItems, orderProjectGroups } from "../projectGroups";
import type { DropPlacement } from "../projectGroups";
import { readSessionListPreferences, writeSessionListPreferences } from "../projectViewPreferences";
import { SessionRow } from "./SessionRow";

type SessionListProps = {
  sessions: MonitorSessionRow[];
  historyVersion: number;
  initiallyExpandedSessionId?: string;
  now?: number;
  usageOverview?: UsageOverview | null;
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

const SESSION_LIST_CLOCK_INTERVAL_MS = 1_000;
const DEFAULT_VISIBLE_SESSIONS_PER_PROJECT = 3;

type SessionProjectGroup = {
  key: string;
  name: string;
  path?: string;
  sessions: MonitorSessionRow[];
};

type SessionDragState =
  | { type: "project"; projectKey: string; overKey?: string; placement?: DropPlacement }
  | {
      type: "session";
      projectKey: string;
      sessionId: string;
      overSessionId?: string;
      placement?: DropPlacement;
    };

function normalizeContextPercent(context: UsageContext | undefined): number | undefined {
  const percent =
    typeof context?.percent === "number"
      ? context.percent
      : typeof context?.used === "number" && typeof context.max === "number" && context.max > 0
        ? (context.used / context.max) * 100
        : undefined;
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function useSessionListNow(sessions: MonitorSessionRow[], explicitNow?: number): number {
  const [liveNow, setLiveNow] = useState(() => explicitNow ?? Date.now());
  const hasRunningTimer = sessions.some(
    (session) => session.status === "running" && typeof session.latestRunningStartedAt === "number",
  );

  useEffect(() => {
    if (explicitNow !== undefined) {
      setLiveNow(explicitNow);
      return;
    }
    if (!hasRunningTimer) {
      return;
    }
    setLiveNow(Date.now());
    const intervalId = window.setInterval(() => {
      setLiveNow(Date.now());
    }, SESSION_LIST_CLOCK_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [explicitNow, hasRunningTimer]);

  return explicitNow ?? liveNow;
}

function sessionDurationLabel(
  session: MonitorSessionRow,
  now: number,
  locale: ReturnType<typeof useI18n>["locale"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (session.status === "running" && typeof session.latestRunningStartedAt === "number") {
    const duration = formatSessionDuration(now - session.latestRunningStartedAt, locale, {
      includeSeconds: true,
    });
    return duration ? t("session.meta.runningDuration", { duration }) : session.durationLabel;
  }
  if (typeof session.latestRunningDurationMs === "number") {
    const duration = formatSessionDuration(session.latestRunningDurationMs, locale, {
      includeSeconds: true,
    });
    return duration ? t("session.meta.runningDuration", { duration }) : session.durationLabel;
  }
  return session.durationLabel;
}

function groupSessionsByProject(
  sessions: MonitorSessionRow[],
  unknownProjectLabel: string,
): SessionProjectGroup[] {
  const groups: SessionProjectGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const session of sessions) {
    const projectPath = session.projectPath?.trim() || UNKNOWN_PROJECT_PATH;
    const key = isUnknownProjectPath(projectPath) ? UNKNOWN_PROJECT_PATH : projectPath;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      groups[existingIndex].sessions.push(session);
      continue;
    }

    indexByKey.set(key, groups.length);
    groups.push({
      key,
      name: isUnknownProjectPath(projectPath)
        ? unknownProjectLabel
        : session.projectName?.trim() || projectDisplayName(projectPath),
      ...(isUnknownProjectPath(projectPath) ? {} : { path: projectPath }),
      sessions: [session],
    });
  }

  return groups;
}

function toggleSetValue(current: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

function projectContentId(prefix: string, key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return `${prefix}-${hash.toString(36)}`;
}

function isPrioritySession(session: MonitorSessionRow): boolean {
  return (
    session.status === "running" ||
    session.status === "waiting" ||
    session.status === "error" ||
    session.pendingCount > 0
  );
}

function visibleSessionsForProject(
  sessions: MonitorSessionRow[],
  expanded: boolean,
): MonitorSessionRow[] {
  if (expanded || sessions.length <= DEFAULT_VISIBLE_SESSIONS_PER_PROJECT) {
    return sessions;
  }

  const visibleIds = new Set<string>();
  const visibleSessions: MonitorSessionRow[] = [];
  const addVisibleSession = (session: MonitorSessionRow) => {
    if (visibleIds.has(session.id)) return;
    visibleIds.add(session.id);
    visibleSessions.push(session);
  };

  sessions.slice(0, DEFAULT_VISIBLE_SESSIONS_PER_PROJECT).forEach(addVisibleSession);
  sessions.filter(isPrioritySession).forEach(addVisibleSession);
  return visibleSessions;
}

function dragPlacement(event: DragEvent<HTMLElement>): DropPlacement {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

export function SessionList({
  sessions,
  historyVersion,
  initiallyExpandedSessionId,
  now,
  usageOverview,
  onRespond,
}: SessionListProps) {
  const { locale, t } = useI18n();
  const clockNow = useSessionListNow(sessions, now);
  const initialPreferencesRef = useRef<ReturnType<typeof readSessionListPreferences> | null>(null);
  if (initialPreferencesRef.current === null) {
    initialPreferencesRef.current = readSessionListPreferences();
  }
  const initialPreferences = initialPreferencesRef.current;
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    initiallyExpandedSessionId ?? null,
  );
  const [projectOrder, setProjectOrder] = useState<string[]>(() => initialPreferences.projectOrder);
  const [sessionOrderByProject, setSessionOrderByProject] = useState<Record<string, string[]>>(
    () => initialPreferences.sessionOrderByProject,
  );
  const [collapsedProjectKeys, setCollapsedProjectKeys] = useState<Set<string>>(
    () => new Set(initialPreferences.collapsedProjectKeys),
  );
  const [expandedProjectSessionKeys, setExpandedProjectSessionKeys] = useState<Set<string>>(
    () => new Set(initialPreferences.expandedProjectSessionKeys),
  );
  const [dragState, setDragState] = useState<SessionDragState | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const draggedProjectKey = useRef<string | null>(null);
  const draggedSession = useRef<{ projectKey: string; sessionId: string } | null>(null);
  const projectOrderBeforeDrag = useRef<string[] | null>(null);
  const sessionOrderBeforeDrag = useRef<{ projectKey: string; order: string[] } | null>(null);
  const dropCommitted = useRef(false);
  const hasExpandedSession = expandedSessionId !== null;

  useEffect(() => {
    writeSessionListPreferences({
      projectOrder,
      sessionOrderByProject,
      collapsedProjectKeys: [...collapsedProjectKeys],
      expandedProjectSessionKeys: [...expandedProjectSessionKeys],
    });
  }, [projectOrder, sessionOrderByProject, collapsedProjectKeys, expandedProjectSessionKeys]);

  const contextPercentBySession = useMemo(() => {
    const next = new Map<string, number>();
    for (const session of usageOverview?.sessions ?? []) {
      const percent = normalizeContextPercent(session.context);
      if (percent !== undefined) {
        next.set(session.sessionId, percent);
      }
    }
    return next;
  }, [usageOverview]);
  const projectGroups = useMemo(() => {
    const groups = groupSessionsByProject(sessions, t("tokenStats.unknownProject"));
    return orderProjectGroups(groups, projectOrder).map((group) => ({
      ...group,
      sessions: orderKeyedItems(group.sessions, sessionOrderByProject[group.key] ?? []),
    }));
  }, [sessions, sessionOrderByProject, projectOrder, t]);

  const moveProjectTo = useCallback((draggedKey: string, targetKey: string, placement: DropPlacement) => {
    setProjectOrder((current) => {
      const visibleOrder = orderProjectGroups(
        groupSessionsByProject(sessions, t("tokenStats.unknownProject")),
        current,
      ).map((group) => group.key);
      const nextOrder = moveProjectKey(visibleOrder, draggedKey, targetKey, placement);
      return sameOrder(visibleOrder, nextOrder) ? current : nextOrder;
    });
  }, [sessions, t]);

  const moveSessionTo = useCallback((
    projectKey: string,
    draggedSessionId: string,
    targetSessionId: string,
    placement: DropPlacement,
  ) => {
    setSessionOrderByProject((current) => {
      const group = groupSessionsByProject(sessions, t("tokenStats.unknownProject")).find(
        (candidate) => candidate.key === projectKey,
      );
      if (!group) return current;
      const visibleOrder = orderKeyedItems(
        group.sessions,
        current[projectKey] ?? [],
      ).map((session) => session.id);
      const nextOrder = moveProjectKey(
        visibleOrder,
        draggedSessionId,
        targetSessionId,
        placement,
      );
      if (sameOrder(visibleOrder, nextOrder)) {
        return current;
      }
      return {
        ...current,
        [projectKey]: nextOrder,
      };
    });
  }, [sessions, t]);

  const toggleProjectCollapsed = useCallback((projectKey: string) => {
    setCollapsedProjectKeys((current) => toggleSetValue(current, projectKey));
  }, []);

  const toggleProjectSessionsExpanded = useCallback((projectKey: string) => {
    setExpandedProjectSessionKeys((current) => toggleSetValue(current, projectKey));
  }, []);

  const handleProjectDragStart = useCallback((projectKey: string) => {
    return (event: DragEvent<HTMLElement>) => {
      draggedProjectKey.current = projectKey;
      dropCommitted.current = false;
      projectOrderBeforeDrag.current = orderProjectGroups(
        groupSessionsByProject(sessions, t("tokenStats.unknownProject")),
        projectOrder,
      ).map((group) => group.key);
      setDragState({ type: "project", projectKey });
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", projectKey);
    };
  }, [projectOrder, sessions, t]);

  const handleProjectDragOver = useCallback((targetProjectKey: string) => {
    return (event: DragEvent<HTMLElement>) => {
      const sourceProjectKey = draggedProjectKey.current;
      if (!sourceProjectKey) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const placement = dragPlacement(event);
      setDragState({
        type: "project",
        projectKey: sourceProjectKey,
        overKey: targetProjectKey,
        placement,
      });
      moveProjectTo(sourceProjectKey, targetProjectKey, placement);
    };
  }, [moveProjectTo]);

  const handleProjectDrop = useCallback((targetProjectKey: string) => {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const sourceProjectKey = draggedProjectKey.current;
      dropCommitted.current = true;
      draggedProjectKey.current = null;
      projectOrderBeforeDrag.current = null;
      setDragState(null);
      if (sourceProjectKey) {
        moveProjectTo(sourceProjectKey, targetProjectKey, dragPlacement(event));
      }
    };
  }, [moveProjectTo]);

  const handleProjectDragEnd = useCallback(() => {
    if (!dropCommitted.current && projectOrderBeforeDrag.current) {
      setProjectOrder(projectOrderBeforeDrag.current);
    }
    projectOrderBeforeDrag.current = null;
    draggedProjectKey.current = null;
    dropCommitted.current = false;
    setDragState(null);
  }, []);

  const handleSessionDragStart = useCallback((projectKey: string, sessionId: string) => {
    return (event: DragEvent<HTMLElement>) => {
      draggedSession.current = { projectKey, sessionId };
      dropCommitted.current = false;
      const group = projectGroups.find((candidate) => candidate.key === projectKey);
      sessionOrderBeforeDrag.current = {
        projectKey,
        order: group?.sessions.map((session) => session.id) ?? [],
      };
      setDragState({ type: "session", projectKey, sessionId });
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", sessionId);
    };
  }, [projectGroups]);

  const handleSessionDragOver = useCallback((projectKey: string, targetSessionId: string) => {
    return (event: DragEvent<HTMLElement>) => {
      const source = draggedSession.current;
      if (source?.projectKey !== projectKey) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const placement = dragPlacement(event);
      setDragState({
        type: "session",
        projectKey,
        sessionId: source.sessionId,
        overSessionId: targetSessionId,
        placement,
      });
      moveSessionTo(projectKey, source.sessionId, targetSessionId, placement);
    };
  }, [moveSessionTo]);

  const handleSessionDrop = useCallback((projectKey: string, targetSessionId: string) => {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const source = draggedSession.current;
      dropCommitted.current = true;
      draggedSession.current = null;
      sessionOrderBeforeDrag.current = null;
      setDragState(null);
      if (source?.projectKey === projectKey) {
        moveSessionTo(projectKey, source.sessionId, targetSessionId, dragPlacement(event));
      }
    };
  }, [moveSessionTo]);

  const handleSessionDragEnd = useCallback(() => {
    const previous = sessionOrderBeforeDrag.current;
    if (!dropCommitted.current && previous) {
      setSessionOrderByProject((current) => ({
        ...current,
        [previous.projectKey]: previous.order,
      }));
    }
    sessionOrderBeforeDrag.current = null;
    draggedSession.current = null;
    dropCommitted.current = false;
    setDragState(null);
  }, []);

  const toggleExpanded = useCallback((sessionId: string) => {
    setExpandedSessionId((current) => (current === sessionId ? null : sessionId));
  }, []);

  useLayoutEffect(() => {
    if (!expandedSessionId) {
      return;
    }

    const row = rowRefs.current.get(expandedSessionId);
    if (!row) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    let stopObserving = 0;
    const pinToExpandedBottom = () => {
      row.scrollIntoView({ block: "end", inline: "nearest" });
      const list = row.closest<HTMLElement>(".session-list");
      if (
        list &&
        row.nextElementSibling === null &&
        row.parentElement?.nextElementSibling === null
      ) {
        list.scrollTop = list.scrollHeight;
      }
    };

    firstFrame = window.requestAnimationFrame(() => {
      pinToExpandedBottom();
      secondFrame = window.requestAnimationFrame(pinToExpandedBottom);
    });

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(pinToExpandedBottom)
        : null;
    observer?.observe(row);
    stopObserving = window.setTimeout(() => {
      observer?.disconnect();
    }, 800);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(stopObserving);
      observer?.disconnect();
    };
  }, [expandedSessionId]);

  useEffect(() => {
    return window.codepal.onFocusSession((sessionId) => {
      setExpandedSessionId(sessionId);
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && expandedSessionId) {
        const target = e.target as HTMLElement;
        if (target.closest('[role="dialog"]')) return;
        e.preventDefault();
        setExpandedSessionId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedSessionId]);

  const prevPendingCounts = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const session of sessions) {
      const prev = prevPendingCounts.current[session.id] ?? 0;
      const next = session.pendingCount ?? 0;
      if (prev === 0 && next > 0) {
        setExpandedSessionId(session.id);
      }
      prevPendingCounts.current[session.id] = next;
    }
  }, [sessions]);

  const registerRow = useCallback((sessionId: string) => {
    return (node: HTMLElement | null) => {
      if (!node) {
        rowRefs.current.delete(sessionId);
        return;
      }
      rowRefs.current.set(sessionId, node);
    };
  }, []);

  return (
    <section
      className={`session-list ${hasExpandedSession ? "session-list--focus" : ""}`}
      aria-label="Session tasks"
    >
      <div className="session-list__header">Sessions</div>
      {projectGroups.map((group) => {
        const projectCollapsed = collapsedProjectKeys.has(group.key);
        const sessionsExpanded = expandedProjectSessionKeys.has(group.key);
        const visibleSessions = visibleSessionsForProject(group.sessions, sessionsExpanded);
        const hiddenSessionCount = group.sessions.length - visibleSessions.length;
        const contentId = projectContentId("session-project", group.key);

        return (
          <section
            key={group.key}
            className={`session-list__project-group${
              projectCollapsed ? " session-list__project-group--collapsed" : ""
            }${
              dragState?.type === "project" && dragState.projectKey === group.key
                ? " session-list__project-group--dragging"
                : ""
            }${
              dragState?.type === "project" &&
              dragState.overKey === group.key &&
              dragState.projectKey !== group.key
                ? ` session-list__project-group--drop-${dragState.placement}`
                : ""
            }`}
            aria-label={group.name}
            onDragOver={handleProjectDragOver(group.key)}
            onDrop={handleProjectDrop(group.key)}
          >
            <div
              className="session-list__project-heading"
              title={group.path}
            >
              <button
                type="button"
                className="session-list__project-drag"
                draggable
                aria-label={t("projectGroup.dragProject")}
                title={t("projectGroup.dragProject")}
                onDragStart={handleProjectDragStart(group.key)}
                onDragEnd={handleProjectDragEnd}
              >
                <span aria-hidden="true">::</span>
              </button>
              <button
                type="button"
                className="session-list__project-toggle"
                aria-expanded={!projectCollapsed}
                aria-controls={contentId}
                aria-label={projectCollapsed ? t("projectGroup.expand") : t("projectGroup.collapse")}
                title={projectCollapsed ? t("projectGroup.expand") : t("projectGroup.collapse")}
                onClick={() => toggleProjectCollapsed(group.key)}
              >
                <span aria-hidden="true" />
              </button>
              <span className="session-list__project-marker" aria-hidden="true" />
              <span className="session-list__project-name">{group.name}</span>
              <span className="session-list__project-count">{group.sessions.length}</span>
            </div>
            {!projectCollapsed ? (
              <div id={contentId} className="session-list__project-sessions">
                {visibleSessions.map((session) => {
                  const durationLabel = sessionDurationLabel(session, clockNow, locale, t);
                  const displaySession =
                    durationLabel === session.durationLabel ? session : { ...session, durationLabel };
                  return (
                    <div
                      key={session.id}
                      className={`session-list__session-shell${
                        dragState?.type === "session" && dragState.sessionId === session.id
                          ? " session-list__session-shell--dragging"
                          : ""
                      }${
                        dragState?.type === "session" &&
                        dragState.projectKey === group.key &&
                        dragState.overSessionId === session.id &&
                        dragState.sessionId !== session.id
                          ? ` session-list__session-shell--drop-${dragState.placement}`
                          : ""
                      }`}
                      draggable
                      onDragStart={handleSessionDragStart(group.key, session.id)}
                      onDragOver={handleSessionDragOver(group.key, session.id)}
                      onDrop={handleSessionDrop(group.key, session.id)}
                      onDragEnd={handleSessionDragEnd}
                    >
                      <span
                        className="session-list__session-drag"
                        title={t("projectGroup.dragSession")}
                        aria-label={t("projectGroup.dragSession")}
                      >
                        ::
                      </span>
                      <SessionRow
                        ref={registerRow(session.id)}
                        session={displaySession}
                        contextPercent={contextPercentBySession.get(session.id)}
                        historyVersion={historyVersion}
                        expanded={expandedSessionId === session.id}
                        deemphasized={false}
                        onToggleExpanded={toggleExpanded}
                        onRespond={onRespond}
                      />
                    </div>
                  );
                })}
                {hiddenSessionCount > 0 || sessionsExpanded ? (
                  <button
                    type="button"
                    className="session-list__project-more"
                    aria-expanded={sessionsExpanded}
                    onClick={() => toggleProjectSessionsExpanded(group.key)}
                  >
                    {sessionsExpanded
                      ? t("projectGroup.showLess")
                      : t("projectGroup.showMore", { count: hiddenSessionCount })}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </section>
  );
}
