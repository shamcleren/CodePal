import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttentionBanner } from "./AttentionBanner";
import type { WorkItemList, WorkItem } from "../../shared/workItems";
import { I18nProvider } from "../i18n";

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(<I18nProvider locale="en">{ui}</I18nProvider>);
}

function makeItem(overrides: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    sessionId: "sess-1",
    agent: "claude",
    state: "waiting",
    priority: "high",
    title: "Test item",
    nextAction: null,
    project: null,
    since: Date.now(),
    lastActivity: Date.now(),
    durationMs: 60_000,
    recentActions: [],
    hasPendingActions: false,
    ...overrides,
  };
}

function makeList(items: WorkItem[]): WorkItemList {
  const byState = {
    waiting: items.filter((i) => i.state === "waiting"),
    needs_follow_up: items.filter((i) => i.state === "needs_follow_up"),
    failed: items.filter((i) => i.state === "failed"),
    completed: items.filter((i) => i.state === "completed"),
    deferred: items.filter((i) => i.state === "deferred"),
  };
  const counts = {
    waiting: byState.waiting.length,
    needs_follow_up: byState.needs_follow_up.length,
    failed: byState.failed.length,
    completed: byState.completed.length,
    deferred: byState.deferred.length,
  };
  return { items, byState, counts, generatedAt: Date.now() };
}

describe("AttentionBanner", () => {
  it("renders nothing when no items", () => {
    const html = render(
      <AttentionBanner workItemList={makeList([])} onJumpToSession={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when only deferred items exist", () => {
    const list = makeList([
      makeItem({ id: "a", state: "deferred", priority: "low" }),
    ]);
    const html = render(
      <AttentionBanner workItemList={list} onJumpToSession={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("renders summary count when active items exist", () => {
    const list = makeList([
      makeItem({ id: "a", state: "failed", priority: "critical" }),
      makeItem({ id: "b", state: "waiting", priority: "high" }),
    ]);
    const html = render(
      <AttentionBanner workItemList={list} onJumpToSession={() => {}} />,
    );
    expect(html).toContain("2");
    expect(html).toContain("need attention");
    expect(html).toContain("attention-banner");
  });

  it("does not render expanded body by default", () => {
    const list = makeList([
      makeItem({ id: "a", state: "failed", priority: "critical" }),
    ]);
    const html = render(
      <AttentionBanner workItemList={list} onJumpToSession={() => {}} />,
    );
    expect(html).not.toContain("attention-banner__body");
  });

  it("renders expanded body with initialExpanded", () => {
    const list = makeList([
      makeItem({ id: "a", state: "failed", priority: "critical" }),
    ]);
    const html = render(
      <AttentionBanner
        workItemList={list}
        onJumpToSession={() => {}}
        initialExpanded
      />,
    );
    expect(html).toContain("attention-banner__body");
  });

  it("shows priority dot with correct class when expanded", () => {
    const list = makeList([
      makeItem({ id: "a", state: "failed", priority: "critical" }),
    ]);
    const html = render(
      <AttentionBanner
        workItemList={list}
        onJumpToSession={() => {}}
        initialExpanded
      />,
    );
    expect(html).toContain("attention-banner__priority-dot--critical");
  });

  it("shows item title when expanded", () => {
    const list = makeList([
      makeItem({ id: "a", state: "waiting", title: "Fix auth bug" }),
    ]);
    const html = render(
      <AttentionBanner
        workItemList={list}
        onJumpToSession={() => {}}
        initialExpanded
      />,
    );
    expect(html).toContain("Fix auth bug");
  });

  it("shows next action when expanded", () => {
    const list = makeList([
      makeItem({
        id: "a",
        state: "waiting",
        nextAction: "Respond to: Pick a file",
      }),
    ]);
    const html = render(
      <AttentionBanner
        workItemList={list}
        onJumpToSession={() => {}}
        initialExpanded
      />,
    );
    expect(html).toContain("Respond to: Pick a file");
  });

  it("shows group labels when expanded", () => {
    const list = makeList([
      makeItem({ id: "a", state: "failed", priority: "critical" }),
      makeItem({ id: "b", state: "needs_follow_up", priority: "medium" }),
    ]);
    const html = render(
      <AttentionBanner
        workItemList={list}
        onJumpToSession={() => {}}
        initialExpanded
      />,
    );
    expect(html).toContain("Failed");
    expect(html).toContain("Needs follow-up");
  });

  it("only shows active state groups, not deferred or completed", () => {
    const list = makeList([
      makeItem({ id: "a", state: "failed", priority: "critical" }),
      makeItem({ id: "b", state: "deferred", priority: "low" }),
      makeItem({ id: "c", state: "completed", priority: "low" }),
    ]);
    const html = render(
      <AttentionBanner
        workItemList={list}
        onJumpToSession={() => {}}
        initialExpanded
      />,
    );
    expect(html).toContain("Failed");
    expect(html).not.toContain("Deferred");
  });

  it("maps high priority to correct CSS class", () => {
    const list = makeList([
      makeItem({ id: "a", state: "waiting", priority: "high" }),
    ]);
    const html = render(
      <AttentionBanner
        workItemList={list}
        onJumpToSession={() => {}}
        initialExpanded
      />,
    );
    expect(html).toContain("attention-banner__priority-dot--high");
  });
});
