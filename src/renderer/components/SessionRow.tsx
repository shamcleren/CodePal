import { memo, useLayoutEffect, useRef } from "react";
import claudeAppIcon from "../assets/claude-app-icon.png";
import codebuddyAppIcon from "../assets/codebuddy-app-icon.png";
import codexAppIcon from "../assets/codex-app-icon.png";
import cursorAppIcon from "../assets/cursor-app-icon.png";
import jetbrainsAppIcon from "../assets/jetbrains-app-icon.png";
import pycharmAppIcon from "../assets/pycharm-app-icon.png";
import type { SessionStatus } from "../../shared/sessionTypes";
import type { PendingAction } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";
import type { MonitorSessionRow } from "../monitorSession";
import { HoverDetails } from "./HoverDetails";

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

function pendingEyebrow(
  type: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (type) {
    case "approval":
      return t("session.pending.approval");
    case "single_choice":
      return t("session.pending.single_choice");
    case "multi_choice":
      return t("session.pending.multi_choice");
    default:
      return t("session.pending.default");
  }
}

function actionDisplayOptions(
  action: PendingAction,
  t: (key: string, params?: Record<string, string | number>) => string,
): string[] {
  if (action.type === "approval") {
    return [t("session.action.allow"), t("session.action.deny")];
  }
  return action.options;
}

type SessionRowProps = {
  session: MonitorSessionRow;
  expanded: boolean;
  showExperimentalControls?: boolean;
  onToggleExpanded: (sessionId: string) => void;
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export const SessionRow = memo(function SessionRow({
  session,
  expanded,
  showExperimentalControls = true,
  onToggleExpanded,
  onRespond,
}: SessionRowProps) {
  const i18n = useI18n();
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastExpandedRef = useRef(false);
  const pendingActions = session.pendingActions ?? [];
  const meta = toolDisplay(session.tool);
  const { className: stateClass, label: stateLabel } = statusPresentation(session.status);
  const latestToolItem = session.timelineItems.find((item) => item.kind === "tool");
  const showCollapsedSummary =
    normalizeComparableText(session.collapsedSummary) !== normalizeComparableText(session.titleLabel);
  const latestToolText = latestToolItem ? normalizeComparableText(latestToolItem.body) : null;
  const shouldShowArtifactSummary =
    latestToolItem &&
    latestToolText !== normalizeComparableText(session.titleLabel) &&
    latestToolText !== normalizeComparableText(session.collapsedSummary);
  const hasRenderablePrimaryContent = session.timelineItems.some(
    (item) => item.kind === "message" || item.kind === "tool",
  );
  const showLoadingPanel = session.status === "running" && !hasRenderablePrimaryContent;

  useLayoutEffect(() => {
    const node = detailsRef.current;
    if (!expanded || !node) {
      lastExpandedRef.current = expanded;
      return;
    }

    const justOpened = !lastExpandedRef.current;
    if (justOpened || shouldStickToBottomRef.current) {
      node.scrollTop = node.scrollHeight;
    }

    lastExpandedRef.current = expanded;
  }, [expanded, session.updatedAt, session.timelineItems.length, session.pendingCount]);

  function handleDetailsScroll() {
    const node = detailsRef.current;
    if (!node) {
      return;
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 32;
  }

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
        <div
          ref={detailsRef}
          className="session-row__details"
          onScroll={handleDetailsScroll}
        >
          {showLoadingPanel ? (
            <div className="session-row__loading" aria-label={i18n.t("session.loading")}>
              <div className="session-stream__item session-stream__item--message session-stream__item--message-assistant session-row__loading-bubble">
                <div className="session-stream__header">
                  <span className="session-stream__label session-row__loading-label">Assistant</span>
                </div>
                <div className="session-stream__body session-row__loading-body">
                  <span className="session-row__loading-text">{i18n.t("session.typing")}</span>
                  <span className="session-row__loading-dots" aria-hidden="true" />
                </div>
              </div>
            </div>
          ) : null}
          {shouldShowArtifactSummary ? (
            <div className="session-row__overview-artifact">
              <span className="session-row__overview-artifact-label">{latestToolItem.label}</span>
              <span className="session-row__overview-artifact-body">{latestToolItem.body}</span>
            </div>
          ) : null}
          {!showLoadingPanel ? (
            <HoverDetails
              items={session.timelineItems}
              sessionStatus={session.status}
              scrollContainerRef={detailsRef}
            />
          ) : null}
          {showExperimentalControls && pendingActions.length > 0 ? (
            <div className="session-row__interaction">
              {pendingActions.map((action) => (
                <div key={action.id} className="pending-action" aria-label={action.title}>
                  <div className="pending-action__eyebrow">
                    <span className="pending-action__kicker">
                      {pendingEyebrow(action.type, i18n.t)}
                    </span>
                  </div>
                  <div className="pending-action__title">{action.title}</div>
                  <div className="pending-action__actions">
                    {actionDisplayOptions(action, i18n.t).map((option) => (
                      <button
                        key={`${action.id}:${option}`}
                        type="button"
                        className="pending-action__btn"
                        onClick={() => onRespond(session.id, action.id, option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
});
