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
