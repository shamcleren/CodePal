import { memo } from "react";
import claudeAppIcon from "../assets/claude-app-icon.png";
import codebuddyAppIcon from "../assets/codebuddy-app-icon.png";
import codexAppIcon from "../assets/codex-app-icon.png";
import cursorAppIcon from "../assets/cursor-app-icon.png";
import jetbrainsAppIcon from "../assets/jetbrains-app-icon.png";
import pycharmAppIcon from "../assets/pycharm-app-icon.png";
import type { SessionStatus } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";
import type { MonitorSessionRow } from "../monitorSession";
import { SessionHistoryTimeline } from "./SessionHistoryTimeline";

const KNOWN_TOOLS: Record<string, { label: string }> = {
  claude: { label: "Claude" },
  cursor: { label: "Cursor" },
  codex: { label: "Codex" },
  goland: { label: "GoLand" },
  jetbrains: { label: "JetBrains" },
  pycharm: { label: "PyCharm" },
  codebuddy: { label: "CodeBuddy" },
};

function toolDisplay(tool: string): { key: string; label: string } {
  const known = KNOWN_TOOLS[tool];
  if (known) {
    return { key: tool, label: known.label };
  }
  const trimmed = tool.trim() || "unknown";
  const label =
    trimmed.length > 0
      ? trimmed.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Unknown";
  return { key: trimmed.toLowerCase(), label };
}

function ToolGlyph({ tool }: { tool: string }) {
  if (tool === "codex") {
    return (
      <img src={codexAppIcon} alt="" aria-hidden="true" className="tool-icon__img" />
    );
  }

  if (tool === "claude") {
    return (
      <img src={claudeAppIcon} alt="" aria-hidden="true" className="tool-icon__img" />
    );
  }

  if (tool === "cursor") {
    return (
      <img src={cursorAppIcon} alt="" aria-hidden="true" className="tool-icon__img" />
    );
  }

  if (tool === "codebuddy") {
    return (
      <img src={codebuddyAppIcon} alt="" aria-hidden="true" className="tool-icon__img" />
    );
  }

  if (tool === "goland" || tool === "jetbrains") {
    return (
      <img src={jetbrainsAppIcon} alt="" aria-hidden="true" className="tool-icon__img" />
    );
  }

  if (tool === "pycharm") {
    return (
      <img src={pycharmAppIcon} alt="" aria-hidden="true" className="tool-icon__img" />
    );
  }

  return (
    <span className="tool-icon__fallback" aria-hidden="true">
      {tool.slice(0, 2).toUpperCase()}
    </span>
  );
}

function statusPresentation(status: SessionStatus): { className: string; label: string } {
  switch (status) {
    case "running":
      return { className: "state-running", label: "RUNNING" };
    case "waiting":
      return { className: "state-waiting", label: "WAITING" };
    case "error":
      return { className: "state-error", label: "ERROR" };
    case "completed":
      return { className: "state-completed", label: "DONE" };
    case "idle":
      return { className: "state-idle", label: "IDLE" };
    case "offline":
      return { className: "state-offline", label: "OFFLINE" };
  }
}

function normalizeComparableText(text: string): string {
  return text
    .replace(/^(Agent|User|Assistant)\s*:\s*/i, "")
    .replace(/^(Completed|Running|Waiting|Done|Idle|Offline|Error)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

type SessionRowProps = {
  session: MonitorSessionRow;
  historyVersion?: number;
  expanded: boolean;
  showExperimentalControls?: boolean;
  onToggleExpanded: (sessionId: string) => void;
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export const SessionRow = memo(function SessionRow({
  session,
  historyVersion = 0,
  expanded,
  showExperimentalControls = true,
  onToggleExpanded,
  onRespond,
}: SessionRowProps) {
  const i18n = useI18n();
  const meta = toolDisplay(session.tool);
  const { className: stateClass, label: stateLabel } = statusPresentation(session.status);
  const showCollapsedSummary =
    normalizeComparableText(session.collapsedSummary) !== normalizeComparableText(session.titleLabel);

  return (
    <article
      className={`session-row session-row--${session.status} ${expanded ? "session-row--expanded" : ""}`}
    >
      <button
        type="button"
        className="session-row__summary"
        aria-label={`${meta.label} ${stateLabel}`}
        onClick={() => onToggleExpanded(session.id)}
      >
        <span className={`tool-icon tool-icon--${meta.key}`} title={meta.label}>
          <ToolGlyph tool={meta.key} />
        </span>
        <span className="session-row__main">
          <span className="session-row__topline">
            <span className={`tool-name tool-name--${meta.key}`}>{meta.label}</span>
            <span className="session-row__title">{session.titleLabel}</span>
            <span className={`state ${stateClass}`}>{stateLabel}</span>
            <span className="session-row__time">{session.updatedLabel}</span>
          </span>
          <span className="session-row__meta">
            {showCollapsedSummary ? (
              <span className="session-row__summary-text">{session.collapsedSummary}</span>
            ) : null}
            {session.pendingCount > 0 ? (
              <span className="session-row__pending">
                {i18n.t("session.pending", { count: session.pendingCount })}
              </span>
            ) : null}
            <span className="session-row__meta-item">{session.durationLabel}</span>
            <span className="session-row__meta-item">#{session.shortId}</span>
          </span>
        </span>
      </button>
      {expanded ? (
        <SessionHistoryTimeline
          session={session}
          historyVersion={historyVersion}
          expanded={expanded}
          showExperimentalControls={showExperimentalControls}
          onRespond={onRespond}
        />
      ) : null}
    </article>
  );
});
