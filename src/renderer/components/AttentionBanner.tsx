import { useState } from "react";
import type { WorkItemList, WorkItem, WorkItemState } from "../../shared/workItems";
import { useI18n } from "../i18n";

const ACTIVE_STATES: WorkItemState[] = ["failed", "waiting", "needs_follow_up"];

const STATE_LABELS: Record<WorkItemState, string> = {
  failed: "attentionBanner.state.failed",
  waiting: "attentionBanner.state.waiting",
  needs_follow_up: "attentionBanner.state.needsFollowUp",
  completed: "attentionBanner.state.completed",
  deferred: "attentionBanner.state.deferred",
};

const PRIORITY_CLASS: Record<string, string> = {
  critical: "attention-banner__priority-dot--critical",
  high: "attention-banner__priority-dot--high",
  medium: "attention-banner__priority-dot--medium",
  low: "attention-banner__priority-dot--low",
};

export function AttentionBanner({
  workItemList,
  onJumpToSession,
  initialExpanded = false,
}: {
  workItemList: WorkItemList;
  onJumpToSession: (sessionId: string) => void;
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const i18n = useI18n();

  const activeItems = workItemList.items.filter((item) =>
    ACTIVE_STATES.includes(item.state),
  );

  if (activeItems.length === 0) return null;

  const grouped = ACTIVE_STATES.map((state) => ({
    state,
    label: i18n.t(STATE_LABELS[state]),
    items: workItemList.byState[state] ?? [],
  })).filter((g) => g.items.length > 0);

  return (
    <section className="attention-banner">
      <button
        type="button"
        className="attention-banner__summary"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="attention-banner__summary-count">{activeItems.length}</span>
        <span className="attention-banner__summary-label">
          {i18n.t("attentionBanner.needAttention")}
        </span>
        <span className={`attention-banner__chevron${expanded ? " attention-banner__chevron--open" : ""}`}>
          &#x25B6;
        </span>
      </button>
      {expanded ? (
        <div className="attention-banner__body">
          {grouped.map((group) => (
            <div key={group.state} className="attention-banner__group">
              <div className="attention-banner__group-label">{group.label}</div>
              {group.items.map((item) => (
                <AttentionItem
                  key={item.id}
                  item={item}
                  onJump={onJumpToSession}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AttentionItem({
  item,
  onJump,
}: {
  item: WorkItem;
  onJump: (sessionId: string) => void;
}) {
  return (
    <button
      type="button"
      className="attention-banner__item"
      onClick={() => onJump(item.sessionId)}
    >
      <span className={`attention-banner__priority-dot ${PRIORITY_CLASS[item.priority] ?? ""}`} />
      <span className="attention-banner__item-title">{item.title}</span>
      {item.nextAction ? (
        <span className="attention-banner__item-action">{item.nextAction}</span>
      ) : null}
    </button>
  );
}
