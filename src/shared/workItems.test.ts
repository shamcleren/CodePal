import { describe, expect, it } from "vitest";
import { deriveWorkItems, attentionCount } from "./workItems";
import type { SessionRecord } from "./sessionTypes";

function makeSession(overrides: Partial<SessionRecord> & { id: string }): SessionRecord {
  return {
    tool: "claude",
    status: "running",
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("deriveWorkItems", () => {
  it("returns empty list when no sessions need attention", () => {
    const sessions: SessionRecord[] = [
      makeSession({ id: "a", status: "running", updatedAt: Date.now() }),
    ];
    const result = deriveWorkItems(sessions);
    expect(result.items).toHaveLength(0);
    expect(result.counts.waiting).toBe(0);
    expect(result.counts.failed).toBe(0);
  });

  it("derives waiting state from pending actions", () => {
    const sessions: SessionRecord[] = [
      makeSession({
        id: "a",
        status: "waiting",
        updatedAt: Date.now(),
        pendingActions: [
          { id: "p1", type: "single_choice", title: "Pick a file", options: ["a.txt", "b.txt"] },
        ],
      }),
    ];
    const result = deriveWorkItems(sessions);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].state).toBe("waiting");
    expect(result.items[0].hasPendingActions).toBe(true);
    expect(result.items[0].nextAction).toContain("Pick a file");
  });

  it("derives waiting state from external approval", () => {
    const sessions: SessionRecord[] = [
      makeSession({
        id: "a",
        status: "waiting",
        updatedAt: Date.now(),
        externalApproval: {
          kind: "approval_required",
          title: "Approve file write",
          message: "Write to /tmp/test",
          sourceTool: "claude",
          updatedAt: Date.now(),
        },
      }),
    ];
    const result = deriveWorkItems(sessions);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].state).toBe("waiting");
    expect(result.items[0].nextAction).toContain("Approve");
  });

  it("derives failed state from error status", () => {
    const sessions: SessionRecord[] = [
      makeSession({
        id: "a",
        status: "error",
        updatedAt: Date.now(),
      }),
    ];
    const result = deriveWorkItems(sessions);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].state).toBe("failed");
    expect(result.items[0].priority).toBe("critical");
  });

  it("excludes idle status because restored idle rows are not actionable", () => {
    const sessions: SessionRecord[] = [
      makeSession({
        id: "a",
        status: "idle",
        updatedAt: Date.now(),
      }),
    ];
    const result = deriveWorkItems(sessions);
    expect(result.items).toHaveLength(0);
    expect(result.byState.needs_follow_up).toHaveLength(0);
  });

  it("derives needs_follow_up from stale running session", () => {
    const now = Date.now();
    const sessions: SessionRecord[] = [
      makeSession({
        id: "a",
        status: "running",
        updatedAt: now - 15 * 60 * 1000, // 15 min ago
      }),
    ];
    const result = deriveWorkItems(sessions, now);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].state).toBe("needs_follow_up");
  });

  it("derives deferred state from offline status", () => {
    const sessions: SessionRecord[] = [
      makeSession({
        id: "a",
        status: "offline",
        updatedAt: Date.now(),
      }),
    ];
    const result = deriveWorkItems(sessions);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].state).toBe("deferred");
    expect(result.items[0].priority).toBe("low");
  });

  it("sorts critical items first", () => {
    const now = Date.now();
    const sessions: SessionRecord[] = [
      makeSession({ id: "a", status: "idle", updatedAt: now - 5 * 60 * 1000 }),
      makeSession({ id: "b", status: "error", updatedAt: now }),
      makeSession({ id: "c", status: "waiting", updatedAt: now }),
    ];
    const result = deriveWorkItems(sessions, now);
    expect(result.items[0].state).toBe("failed");
    expect(result.items[1].state).toBe("waiting");
    expect(result.items).toHaveLength(2);
  });

  it("uses title and task for display title", () => {
    const sessions: SessionRecord[] = [
      makeSession({
        id: "a",
        status: "error",
        updatedAt: Date.now(),
        title: "Fix authentication bug",
      }),
      makeSession({
        id: "b",
        status: "error",
        updatedAt: Date.now(),
        task: "Review PR #42",
      }),
    ];
    const result = deriveWorkItems(sessions);
    expect(result.items[0].title).toBe("Fix authentication bug");
    expect(result.items[1].title).toBe("Review PR #42");
  });

  it("includes recent action log entries", () => {
    const now = Date.now();
    const sessions: SessionRecord[] = [
      makeSession({
        id: "a",
        status: "error",
        updatedAt: now,
        actionLog: [
          { action: "jump", timestamp: now - 2000, ok: true },
          { action: "sendMessage", timestamp: now - 1000, ok: false, error: "no terminal" },
        ],
      }),
    ];
    const result = deriveWorkItems(sessions, now);
    expect(result.items[0].recentActions).toHaveLength(2);
    expect(result.items[0].recentActions[1].error).toBe("no terminal");
  });

  it("counts attention items correctly", () => {
    const now = Date.now();
    const sessions: SessionRecord[] = [
      makeSession({ id: "a", status: "waiting", updatedAt: now }),
      makeSession({ id: "b", status: "error", updatedAt: now }),
      makeSession({ id: "c", status: "idle", updatedAt: now - 5 * 60 * 1000 }),
      makeSession({ id: "d", status: "offline", updatedAt: now }),
    ];
    const result = deriveWorkItems(sessions, now);
    // waiting=high, failed=critical, idle=ignored, deferred=low
    // attention = critical + high
    expect(attentionCount(result)).toBe(2);
  });

  it("groups items by state", () => {
    const now = Date.now();
    const sessions: SessionRecord[] = [
      makeSession({ id: "a", status: "waiting", updatedAt: now }),
      makeSession({ id: "b", status: "error", updatedAt: now }),
      makeSession({ id: "c", status: "offline", updatedAt: now }),
    ];
    const result = deriveWorkItems(sessions, now);
    expect(result.byState.waiting).toHaveLength(1);
    expect(result.byState.failed).toHaveLength(1);
    expect(result.byState.deferred).toHaveLength(1);
    expect(result.byState.needs_follow_up).toHaveLength(0);
    expect(result.byState.completed).toHaveLength(0);
  });
});
