import { describe, expect, it } from "vitest";
import type { ActivityItem } from "../../shared/sessionTypes";
import type { TimelineItem } from "../monitorSession";
import {
  mergeSessionTimelineItems,
  shouldStartInitialHistoryLoad,
  shouldLoadNextHistoryPage,
} from "./SessionHistoryTimeline";

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
