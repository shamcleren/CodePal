import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MonitorSessionRow } from "../monitorSession";
import { SessionRow } from "./SessionRow";

type SessionListProps = {
  sessions: MonitorSessionRow[];
  historyVersion: number;
  initiallyExpandedSessionId?: string;
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export function SessionList({
  sessions,
  historyVersion,
  initiallyExpandedSessionId,
  onRespond,
}: SessionListProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    initiallyExpandedSessionId ?? null,
  );
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const hasExpandedSession = expandedSessionId !== null;

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
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          ref={registerRow(session.id)}
          session={session}
          historyVersion={historyVersion}
          expanded={expandedSessionId === session.id}
          deemphasized={hasExpandedSession && expandedSessionId !== session.id}
          showExperimentalControls={false}
          onToggleExpanded={toggleExpanded}
          onRespond={onRespond}
        />
      ))}
    </section>
  );
}
