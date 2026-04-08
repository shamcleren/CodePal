import { useCallback, useState } from "react";
import type { MonitorSessionRow } from "../monitorSession";
import { SessionRow } from "./SessionRow";

type SessionListProps = {
  sessions: MonitorSessionRow[];
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export function SessionList({ sessions, onRespond }: SessionListProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const toggleExpanded = useCallback((sessionId: string) => {
    setExpandedSessionId((current) => (current === sessionId ? null : sessionId));
  }, []);

  return (
    <section className="session-list" aria-label="Session tasks">
      <div className="session-list__header">Sessions</div>
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          expanded={expandedSessionId === session.id}
          showExperimentalControls={false}
          onToggleExpanded={toggleExpanded}
          onRespond={onRespond}
        />
      ))}
    </section>
  );
}
