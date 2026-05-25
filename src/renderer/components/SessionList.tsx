import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UsageContext, UsageOverview } from "../../shared/usageTypes";
import { formatSessionDuration } from "../../shared/sessionTiming";
import { useI18n } from "../i18n";
import type { MonitorSessionRow } from "../monitorSession";
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
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    initiallyExpandedSessionId ?? null,
  );
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const hasExpandedSession = expandedSessionId !== null;
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
      {sessions.map((session) => {
        const durationLabel = sessionDurationLabel(session, clockNow, locale, t);
        const displaySession =
          durationLabel === session.durationLabel ? session : { ...session, durationLabel };
        return (
          <SessionRow
            key={session.id}
            ref={registerRow(session.id)}
            session={displaySession}
            contextPercent={contextPercentBySession.get(session.id)}
            historyVersion={historyVersion}
            expanded={expandedSessionId === session.id}
            deemphasized={hasExpandedSession && expandedSessionId !== session.id}
            onToggleExpanded={toggleExpanded}
            onRespond={onRespond}
          />
        );
      })}
    </section>
  );
}
