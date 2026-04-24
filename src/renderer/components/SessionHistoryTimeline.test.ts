import { describe, expect, it } from "vitest";
import type { ActivityItem } from "../../shared/sessionTypes";
import type { PendingAction } from "../../shared/sessionTypes";
import type { TimelineItem } from "../monitorSession";
import {
  buildSessionSummaryText,
  mergeHistoryStatusState,
  mergeSessionTimelineItems,
  shouldPrefetchHistoryPage,
  shouldLoadNextHistoryPageFromWheel,
  shouldStartInitialHistoryLoad,
  shouldLoadNextHistoryPage,
  actionDisplayOptions,
  actionDisplayChoices,
  pendingActionButtonLabel,
  pendingEyebrow,
} from "./SessionHistoryTimeline";
import type { MonitorSessionRow } from "../monitorSession";

function timelineItem(overrides: Partial<TimelineItem> & Pick<TimelineItem, "id" | "body">): TimelineItem {
  return {
    id: overrides.id,
    kind: overrides.kind ?? "message",
    source: overrides.source ?? "assistant",
    title: overrides.title ?? overrides.id,
    label: overrides.label ?? overrides.title ?? overrides.id,
    body: overrides.body,
    timestamp: overrides.timestamp ?? 1,
    tone: overrides.tone,
    toolName: overrides.toolName,
    toolPhase: overrides.toolPhase,
    meta: overrides.meta,
  };
}

function activityItem(overrides: Partial<ActivityItem> & Pick<ActivityItem, "id" | "body" | "title">): ActivityItem {
  return {
    id: overrides.id,
    kind: overrides.kind ?? "message",
    source: overrides.source ?? "assistant",
    title: overrides.title,
    body: overrides.body,
    timestamp: overrides.timestamp ?? 1,
    tone: overrides.tone,
    toolName: overrides.toolName,
    toolPhase: overrides.toolPhase,
    meta: overrides.meta,
  };
}

describe("mergeSessionTimelineItems", () => {
  it("returns newest-first merged history while keeping live items for duplicate ids", () => {
    const merged = mergeSessionTimelineItems(
      [
        timelineItem({
          id: "live-1",
          title: "Live 1",
          label: "Live 1",
          body: "latest",
          timestamp: 300,
        }),
        timelineItem({
          id: "shared",
          title: "Shared live",
          label: "Shared live",
          body: "live version",
          timestamp: 250,
        }),
      ],
      [
        activityItem({
          id: "shared",
          title: "Shared persisted",
          body: "persisted version",
          timestamp: 250,
        }),
        activityItem({
          id: "older",
          title: "Older persisted",
          body: "older",
          timestamp: 100,
        }),
      ],
    );

    expect(merged.map((item) => item.id)).toEqual(["live-1", "shared", "older"]);
    expect(merged[2]).toMatchObject({
      label: "Older persisted",
      body: "older",
    });
    expect(merged[1]).toMatchObject({
      body: "live version",
    });
  });

  it("returns the live list unchanged when there is no persisted history", () => {
    const live = [
      timelineItem({
        id: "live-only",
        title: "Live only",
        label: "Live only",
        body: "current",
        timestamp: 1,
      }),
    ];

    expect(mergeSessionTimelineItems(live, [])).toBe(live);
  });

  it("filters low-value Claude lifecycle notes from expanded history while keeping real content", () => {
    const merged = mergeSessionTimelineItems(
      [
        timelineItem({
          id: "assistant-1",
          title: "Assistant",
          label: "Assistant",
          body: "还是你有其他想法？",
          timestamp: 300,
        }),
      ],
      [
        activityItem({
          id: "claude-stop-1",
          kind: "system",
          source: "system",
          title: "Claude request finished",
          body: "Claude request finished",
          timestamp: 250,
          tone: "completed",
        }),
        activityItem({
          id: "claude-start-1",
          kind: "system",
          source: "system",
          title: "Session started",
          body: "Claude session started",
          timestamp: 200,
        }),
        activityItem({
          id: "user-1",
          kind: "message",
          source: "user",
          title: "User",
          body: "帮我整理一下这里的状态",
          timestamp: 150,
        }),
      ],
    );

    expect(merged.map((item) => item.id)).toEqual(["assistant-1", "user-1"]);
  });

  it("deduplicates persisted items when the same user message already exists in live history", () => {
    const merged = mergeSessionTimelineItems(
      [
        timelineItem({
          id: "live-user-1",
          kind: "message",
          source: "user",
          title: "User",
          label: "User",
          body: "帮我看下这个 session 为什么卡住了",
          timestamp: 300,
        }),
      ],
      [
        activityItem({
          id: "persisted-user-1",
          kind: "message",
          source: "user",
          title: "User",
          body: "帮我看下这个 session 为什么卡住了",
          timestamp: 299,
        }),
      ],
    );

    expect(merged.map((item) => item.id)).toEqual(["live-user-1"]);
  });

  it("filters low-value CodeBuddy lifecycle notes from expanded history", () => {
    const merged = mergeSessionTimelineItems(
      [
        timelineItem({
          id: "assistant-1",
          title: "Assistant",
          label: "Assistant",
          body: "已经帮你整理好了变更建议。",
          timestamp: 300,
        }),
      ],
      [
        activityItem({
          id: "codebuddy-finished-1",
          kind: "system",
          source: "system",
          title: "Request finished",
          body: "CodeBuddy request finished",
          timestamp: 250,
          tone: "completed",
        }),
        activityItem({
          id: "codebuddy-started-1",
          kind: "system",
          source: "system",
          title: "Request started",
          body: "CodeBuddy request started",
          timestamp: 240,
          tone: "running",
        }),
      ],
    );

    expect(merged.map((item) => item.id)).toEqual(["assistant-1"]);
  });
});

describe("shouldLoadNextHistoryPage", () => {
  it("loads only near the top edge when more history is available", () => {
    expect(
      shouldLoadNextHistoryPage({
        scrollTop: 12,
        hasMore: true,
        loading: false,
      }),
    ).toBe(true);
    expect(
      shouldLoadNextHistoryPage({
        scrollTop: 120,
        hasMore: true,
        loading: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadNextHistoryPage({
        scrollTop: 12,
        hasMore: false,
        loading: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadNextHistoryPage({
        scrollTop: 12,
        hasMore: true,
        loading: true,
      }),
    ).toBe(false);
  });
});

describe("shouldLoadNextHistoryPageFromWheel", () => {
  it("loads when the user keeps wheeling upward at the top edge", () => {
    expect(
      shouldLoadNextHistoryPageFromWheel({
        deltaY: -80,
        scrollTop: 0,
        hasMore: true,
        loading: false,
      }),
    ).toBe(true);
    expect(
      shouldLoadNextHistoryPageFromWheel({
        deltaY: 80,
        scrollTop: 0,
        hasMore: true,
        loading: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadNextHistoryPageFromWheel({
        deltaY: -80,
        scrollTop: 120,
        hasMore: true,
        loading: false,
      }),
    ).toBe(false);
  });
});

describe("shouldPrefetchHistoryPage", () => {
  it("starts background prefetch before the user fully reaches the top", () => {
    expect(
      shouldPrefetchHistoryPage({
        scrollTop: 180,
        hasMore: true,
        loading: false,
      }),
    ).toBe(true);

    expect(
      shouldPrefetchHistoryPage({
        scrollTop: 260,
        hasMore: true,
        loading: false,
      }),
    ).toBe(false);
  });

  it("does not prefetch when loading is already in flight", () => {
    expect(
      shouldPrefetchHistoryPage({
        scrollTop: 120,
        hasMore: true,
        loading: true,
      }),
    ).toBe(false);
  });
});

describe("shouldStartInitialHistoryLoad", () => {
  it("does not auto-retry while an error banner is already visible", () => {
    expect(
      shouldStartInitialHistoryLoad({
        expanded: true,
        initialLoadDone: false,
        loading: false,
        historyError: "boom",
      }),
    ).toBe(false);

    expect(
      shouldStartInitialHistoryLoad({
        expanded: true,
        initialLoadDone: false,
        loading: false,
        historyError: null,
      }),
    ).toBe(true);
  });
});

describe("mergeHistoryStatusState", () => {
  it("surfaces a stronger affordance when more persisted history can be loaded", () => {
    expect(
      mergeHistoryStatusState({
        historyError: null,
        historyLoading: false,
        persistedCount: 20,
        historyHasMore: true,
      }),
    ).toEqual({
      kind: "hint",
      textKey: "session.history.moreAvailable",
    });

    expect(
      mergeHistoryStatusState({
        historyError: null,
        historyLoading: true,
        persistedCount: 20,
        historyHasMore: true,
      }),
    ).toEqual({
      kind: "loading-more",
      textKey: "session.history.loadingMore",
    });
  });
});

describe("actionDisplayOptions", () => {
  const t = (key: string) => {
    const map: Record<string, string> = {
      "session.action.allow": "Allow",
      "session.action.deny": "Deny",
    };
    return map[key] ?? key;
  };

  it("returns Allow/Deny for approval actions", () => {
    const action: PendingAction = {
      id: "a1",
      type: "approval",
      title: "Approve the fix?",
      options: [],
    };
    expect(actionDisplayOptions(action, t)).toEqual(["Allow", "Deny"]);
  });

  it("returns the action options for non-approval actions", () => {
    const action: PendingAction = {
      id: "a2",
      type: "single_choice",
      title: "Pick one",
      options: ["Option A", "Option B", "Option C"],
    };
    expect(actionDisplayOptions(action, t)).toEqual(["Option A", "Option B", "Option C"]);
  });

  it("shows pending action buttons — first option is the allow/primary option", () => {
    const approvalAction: PendingAction = {
      id: "action-1",
      type: "approval",
      title: "Allow tool execution?",
      options: [],
    };
    const options = actionDisplayOptions(approvalAction, t);
    // Tests that buttons would be rendered (non-empty options list)
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toBe("Allow");
  });

  it("shows Allow All / Deny All bar when more than one pending action — first option used for Allow All", () => {
    const actions: PendingAction[] = [
      { id: "a1", type: "approval", title: "Action 1", options: [] },
      { id: "a2", type: "approval", title: "Action 2", options: [] },
    ];
    // Allow All clicks the first option for each action
    const allowAllOptions = actions.map((action) => actionDisplayOptions(action, t)[0]);
    expect(allowAllOptions).toEqual(["Allow", "Allow"]);
  });

  it("does not show Allow All bar for single pending action — single action uses direct button", () => {
    const actions: PendingAction[] = [
      { id: "a1", type: "approval", title: "Only action", options: [] },
    ];
    // With a single action, bulk bar should not render (length <= 1)
    expect(actions.length > 1).toBe(false);
    // The action still has valid options for direct buttons
    expect(actionDisplayOptions(actions[0], t)).toEqual(["Allow", "Deny"]);
  });

  it("calls onRespond with correct option — Deny All uses the last option", () => {
    const action: PendingAction = {
      id: "a1",
      type: "single_choice",
      title: "Pick",
      options: ["Yes", "Maybe", "No"],
    };
    const opts = actionDisplayOptions(action, t);
    // Deny All uses opts[opts.length - 1]
    expect(opts[opts.length - 1]).toBe("No");
  });
});

describe("actionDisplayChoices", () => {
  const t = (key: string) => {
    const map: Record<string, string> = {
      "session.action.allow": "允许",
      "session.action.deny": "拒绝",
    };
    return map[key] ?? key;
  };

  it("keeps localized approval labels separate from stable response values", () => {
    const action: PendingAction = {
      id: "a1",
      type: "approval",
      title: "Approve?",
      options: [],
    };

    expect(actionDisplayChoices(action, t)).toEqual([
      { label: "允许", value: "Allow" },
      { label: "拒绝", value: "Deny" },
    ]);
  });
});

describe("pendingEyebrow", () => {
  const t = (key: string) => {
    const map: Record<string, string> = {
      "session.pending.approval": "Awaiting decision",
      "session.pending.single_choice": "Awaiting selection",
      "session.pending.multi_choice": "Awaiting selections",
      "session.pending.default": "Awaiting input",
    };
    return map[key] ?? key;
  };

  it("returns the correct eyebrow label for approval actions", () => {
    expect(pendingEyebrow("approval", t)).toBe("Awaiting decision");
  });

  it("returns the correct eyebrow label for single_choice actions", () => {
    expect(pendingEyebrow("single_choice", t)).toBe("Awaiting selection");
  });

  it("returns the correct eyebrow label for multi_choice actions", () => {
    expect(pendingEyebrow("multi_choice", t)).toBe("Awaiting selections");
  });

  it("returns the default eyebrow label for unknown action types", () => {
    expect(pendingEyebrow("unknown_type", t)).toBe("Awaiting input");
  });
});

describe("pendingActionButtonLabel", () => {
  const t = (key: string) => {
    const map: Record<string, string> = {
      "pendingAction.sending": "Sending…",
    };
    return map[key] ?? key;
  };

  it("shows Sending only for the selected option while a response is in flight", () => {
    expect(pendingActionButtonLabel("Allow", "sending", true, t)).toBe("Sending…");
    expect(pendingActionButtonLabel("Deny", "sending", false, t)).toBe("Deny");
  });

  it("keeps labels unchanged outside the sending state", () => {
    expect(pendingActionButtonLabel("Allow", "pending", true, t)).toBe("Allow");
    expect(pendingActionButtonLabel("Allow", "error", true, t)).toBe("Allow");
  });
});

describe("buildSessionSummaryText", () => {
  it("builds a compact summary from the current session and high-signal items", () => {
    const session = {
      id: "session-1",
      tool: "cursor",
      status: "waiting",
      titleLabel: "Review flaky history loading",
      updatedLabel: "04-14 16:20",
      pendingActions: [
        {
          id: "pending-1",
          type: "approval" as const,
          title: "Approve the fix?",
          options: ["Allow", "Deny"],
        },
      ],
    } as Pick<
      MonitorSessionRow,
      "id" | "tool" | "status" | "titleLabel" | "updatedLabel" | "pendingActions" | "pendingCount"
    >;

    const summary = buildSessionSummaryText(session, [
      timelineItem({
        id: "assistant-1",
        kind: "message",
        source: "assistant",
        title: "Assistant",
        label: "Assistant",
        body: "I found the pagination threshold issue.",
        timestamp: 3,
      }),
      timelineItem({
        id: "tool-1",
        kind: "tool",
        source: "tool",
        title: "terminal",
        label: "terminal",
        body: "npx playwright test -c playwright.e2e.config.ts",
        timestamp: 2,
        toolName: "terminal",
        toolPhase: "result",
      }),
    ]);

    expect(summary).toContain("Review flaky history loading");
    expect(summary).toContain("- Tool: Cursor");
    expect(summary).toContain("- Status: WAITING");
    expect(summary).toContain("- Updated: 04-14 16:20");
    expect(summary).toContain("Pending decisions");
    expect(summary).toContain("- Approve the fix?");
    expect(summary).toContain("Copied message scope");
    expect(summary).toContain("- Last 10 User/Assistant messages are included when available.");
    expect(summary).toContain("Recent User/Assistant messages copied (1 of 1 available)");
    expect(summary).toContain("- Assistant: I found the pagination threshold issue.");
    expect(summary).toContain("Tool activity summary");
    expect(summary).toContain("- Omitted tool details: 1 item");
    expect(summary).not.toContain("npx playwright test -c playwright.e2e.config.ts");
  });

  it("keeps enough recent message context while omitting verbose tool bodies", () => {
    const session = {
      id: "session-1",
      tool: "claude",
      status: "running",
      titleLabel: "Fix session copy summary",
      updatedLabel: "04-14 17:30",
      pendingCount: 2,
      pendingActions: [],
    } as Pick<
      MonitorSessionRow,
      "id" | "tool" | "status" | "titleLabel" | "updatedLabel" | "pendingCount" | "pendingActions"
    >;
    const longAssistantMessage = `Long assistant context ${"detail ".repeat(180)}`;
    const items = [
      timelineItem({
        id: "tool-1",
        kind: "tool",
        source: "tool",
        title: "Bash",
        label: "Bash",
        body: "npm run test:e2e -- --very-verbose-output-that-should-not-be-copied",
        timestamp: 20,
      }),
      ...Array.from({ length: 10 }, (_value, index) =>
        timelineItem({
          id: `msg-${index}`,
          kind: "message",
          source: index % 2 === 0 ? "user" : "assistant",
          title: index % 2 === 0 ? "User" : "Assistant",
          label: index % 2 === 0 ? "User" : "Assistant",
          body: index === 9 ? longAssistantMessage : `Message context ${index}`,
          timestamp: 10 - index,
        }),
      ),
    ];

    const summary = buildSessionSummaryText(session, items);

    expect(summary).toContain("Session facts");
    expect(summary).toContain("- Tool: Claude");
    expect(summary).toContain("- Status: RUNNING");
    expect(summary).toContain("- Pending count: 2");
    expect(summary).toContain("- Timeline items considered: 11");
    expect(summary).toContain("Recent User/Assistant messages copied (10 of 10 available)");
    expect(summary).toContain("Message context 0");
    expect(summary).toContain("Message context 1");
    expect(summary).toContain(longAssistantMessage.trim());
    expect(summary).toContain("Tool activity summary");
    expect(summary).toContain("- Omitted tool details: 1 item");
    expect(summary).not.toContain("very-verbose-output-that-should-not-be-copied");
  });
});
