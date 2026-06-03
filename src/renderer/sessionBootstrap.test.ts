import { describe, expect, it } from "vitest";
import type { ActivityItem, SessionRecord } from "../shared/sessionTypes";
import { hydrateRowsIfEmpty, reconcileRows, rowsFromSessions } from "./sessionBootstrap";

const waitingActivity: ActivityItem = {
  id: "activity-1",
  kind: "note",
  source: "system",
  title: "Waiting",
  body: "review change",
  timestamp: 1_700_000_000_000,
  tone: "waiting",
};

const currentSessions: SessionRecord[] = [
  {
    id: "s1",
    tool: "cursor",
    status: "waiting",
    task: "review change",
    updatedAt: 1_700_000_000_000,
    activityItems: [waitingActivity],
    pendingActions: [
      {
        id: "a1",
        type: "single_choice",
        title: "Pick one",
        options: ["Approve", "Reject"],
      },
    ],
  },
];

describe("sessionBootstrap", () => {
  it("hydrates empty rows from the current sessions snapshot", () => {
    const rows = hydrateRowsIfEmpty([], currentSessions);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "s1",
      titleLabel: "review change",
      shortId: "s1",
      task: "review change",
      collapsedSummary: "Pick one",
      pendingCount: 1,
      hoverSummary: "review change",
      activityItems: [waitingActivity],
    });
    expect(rows[0].timelineItems[0]?.kind).toBe("note");
    expect(rows[0].pendingActions).toEqual([
      {
        id: "a1",
        type: "single_choice",
        title: "Pick one",
        options: ["Approve", "Reject"],
      },
    ]);
  });

  it("does not overwrite rows that already arrived from push updates", () => {
    const pushedRows = rowsFromSessions(currentSessions);

    expect(hydrateRowsIfEmpty(pushedRows, [])).toBe(pushedRows);
  });

  it("maps a pushed snapshot with no pendingActions to rows with no pending cards (matches onSessions replace)", () => {
    const withPending = rowsFromSessions(currentSessions);
    expect(withPending).toHaveLength(1);
    expect(withPending[0].pendingActions).toEqual([
      {
        id: "a1",
        type: "single_choice",
        title: "Pick one",
        options: ["Approve", "Reject"],
      },
    ]);

    const snapshotNoPending: SessionRecord[] = [
      {
        id: "s1",
        tool: "cursor",
        status: "running",
        task: "review change",
        updatedAt: 1_700_000_001_000,
      },
    ];
    const afterPush = rowsFromSessions(snapshotNoPending);

    expect(afterPush).toHaveLength(1);
    expect(afterPush[0].id).toBe("s1");
    expect(afterPush[0].pendingActions ?? []).toEqual([]);
  });

  it("prefers shared title metadata over fallback title generation", () => {
    const rows = rowsFromSessions([
      {
        id: "codex-123456",
        tool: "codex",
        status: "running",
        title: "Repository audit",
        task: "scan src tree",
        updatedAt: 1_700_000_010_000,
      },
    ]);

    expect(rows[0]).toMatchObject({
      titleLabel: "Repository audit",
      shortId: "3456",
    });
  });

  it("prioritizes sessions that are waiting on the user ahead of ordinary running work", () => {
    const rows = rowsFromSessions([
      {
        id: "running-newer",
        tool: "codex",
        status: "running",
        task: "keep working",
        updatedAt: 1_700_000_020_000,
        lastUserMessageAt: 1_700_000_020_000,
      },
      {
        id: "waiting-older",
        tool: "codex",
        status: "waiting",
        task: "choose whether to continue",
        updatedAt: 1_700_000_010_000,
        lastUserMessageAt: 1_700_000_010_000,
      },
      {
        id: "pending-older",
        tool: "cursor",
        status: "running",
        task: "approve tool use",
        updatedAt: 1_700_000_005_000,
        lastUserMessageAt: 1_700_000_005_000,
        pendingActions: [
          {
            id: "approval-1",
            type: "approval",
            title: "Allow command?",
            options: ["Allow", "Deny"],
          },
        ],
      },
    ]);

    expect(rows.map((row) => row.id)).toEqual([
      "waiting-older",
      "pending-older",
      "running-newer",
    ]);
  });

  it("reuses existing row objects when the incoming session snapshot is unchanged", () => {
    const previousRows = rowsFromSessions(currentSessions);
    const nextRows = reconcileRows(previousRows, currentSessions);

    expect(nextRows).toHaveLength(1);
    expect(nextRows[0]).toBe(previousRows[0]);
  });

  it("recomputes a row when the concrete model changes", () => {
    const previousRows = rowsFromSessions(currentSessions);
    const nextRows = reconcileRows(previousRows, [
      {
        ...currentSessions[0],
        model: "gpt-5.5",
      },
    ]);

    expect(nextRows).toHaveLength(1);
    expect(nextRows[0]).not.toBe(previousRows[0]);
    expect(nextRows[0].model).toBe("gpt-5.5");
  });

  it("recomputes only the rows whose session payload changed", () => {
    const previousRows = rowsFromSessions([
      ...currentSessions,
      {
        id: "s2",
        tool: "claude",
        status: "running",
        task: "draft release notes",
        updatedAt: 1_700_000_000_100,
      },
    ]);

    const nextRows = reconcileRows(previousRows, [
      {
        ...currentSessions[0],
        updatedAt: 1_700_000_000_500,
        task: "review final change",
      },
      {
        id: "s2",
        tool: "claude",
        status: "running",
        task: "draft release notes",
        updatedAt: 1_700_000_000_100,
      },
    ]);

    expect(nextRows).toHaveLength(2);
    expect(nextRows.find((row) => row.id === "s1")).not.toBe(previousRows.find((row) => row.id === "s1"));
    expect(nextRows.find((row) => row.id === "s2")).toBe(previousRows.find((row) => row.id === "s2"));
  });
});
