import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MonitorSessionRow } from "../monitorSession";
import { SessionList } from "./SessionList";

function row(overrides: Partial<MonitorSessionRow>): MonitorSessionRow {
  return {
    id: "s",
    tool: "codex",
    status: "completed",
    updatedAt: 1,
    titleLabel: "CODEX · review",
    shortId: "0001",
    updatedLabel: "04-02 16:00",
    durationLabel: "0s",
    pendingCount: 0,
    loading: false,
    collapsedSummary: "done",
    timelineItems: [],
    activityItems: [],
    hoverSummary: "",
    ...overrides,
  };
}

describe("SessionList", () => {
  it("renders sessions in the incoming order", () => {
    const html = renderToStaticMarkup(
      <SessionList
        historyVersion={0}
        sessions={[
          row({
            id: "user-newest",
            status: "completed",
            updatedAt: 10,
            lastUserMessageAt: 100,
            collapsedSummary: "latest user turn",
          }),
          row({
            id: "user-older",
            status: "idle",
            updatedAt: 50,
            lastUserMessageAt: 80,
            collapsedSummary: "older user turn",
          }),
          row({
            id: "fallback-newer",
            status: "running",
            updatedAt: 40,
            collapsedSummary: "live run",
          }),
        ]}
        onRespond={vi.fn()}
      />,
    );

    expect(html).not.toContain("Current");
    expect(html).not.toContain("History");
    expect(html).toContain("All Projects");
    expect(html).toContain("3 sessions");
    expect(html).toContain("Grouped by project");
    expect(html.indexOf("latest user turn")).toBeLessThan(html.indexOf("older user turn"));
    expect(html.indexOf("older user turn")).toBeLessThan(html.indexOf("live run"));
  });

  it("renders title labels in the flat session list", () => {
    const html = renderToStaticMarkup(
      <SessionList
        historyVersion={0}
        sessions={[
          row({
            id: "current-1",
            status: "running",
            updatedAt: 30,
            titleLabel: "Codex · repo audit",
            collapsedSummary: "live run",
          }),
        ]}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Codex · repo audit");
    expect(html).toContain("live run");
  });

  it("groups sessions by project without repeating project notes on each row", () => {
    const html = renderToStaticMarkup(
      <SessionList
        historyVersion={0}
        sessions={[
          row({
            id: "codepal",
            titleLabel: "Implement grouped sessions",
            collapsedSummary: "renderer work",
            projectPath: "/repo/CodePal",
            projectName: "CodePal",
          }),
          row({
            id: "gateway",
            titleLabel: "Calibrate provider metrics",
            collapsedSummary: "gateway work",
            projectPath: "/repo/gateway",
            projectName: "gateway",
          }),
          row({
            id: "unknown",
            titleLabel: "Unknown project task",
            collapsedSummary: "unknown project work",
          }),
        ]}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-list__project-group");
    expect(html).toContain("session-list__project-heading");
    expect(html).toContain("session-list__project-toggle");
    expect(html).toContain("session-list__project-drag");
    expect(html).toContain("aria-expanded=\"true\"");
    expect(html).toContain("draggable=\"true\"");
    expect(html).not.toContain("session-row__project-note");
    expect(html).toContain("CodePal");
    expect(html).toContain("Implement grouped sessions");
    expect(html).toContain("gateway");
    expect(html).toContain("Calibrate provider metrics");
    expect(html).toContain("Unknown project task");
    expect(html).toContain("Unidentified Project");
    expect(html.indexOf("CodePal")).toBeLessThan(html.indexOf("Implement grouped sessions"));
    expect(html.indexOf("gateway")).toBeLessThan(html.indexOf("Calibrate provider metrics"));
    expect(html.indexOf("Implement grouped sessions")).toBeLessThan(html.indexOf("gateway"));
  });

  it("shows three sessions per project by default and keeps active sessions visible", () => {
    const sessions = Array.from({ length: 6 }, (_, index) =>
      row({
        id: `codepal-${index + 1}`,
        titleLabel:
          index === 3
            ? "Running session marker"
            : index === 5
              ? "Hidden session marker"
              : `Visible session ${index + 1}`,
        status: index === 3 ? "running" : "completed",
        collapsedSummary: "project session",
        projectPath: "/repo/CodePal",
        projectName: "CodePal",
      }),
    );

    const html = renderToStaticMarkup(
      <SessionList historyVersion={0} sessions={sessions} onRespond={vi.fn()} />,
    );

    expect(html).toContain("Visible session 1");
    expect(html).toContain("Visible session 3");
    expect(html).toContain("Running session marker");
    expect(html).not.toContain("Visible session 5");
    expect(html).not.toContain("Hidden session marker");
    expect(html).toContain("session-list__project-more");
    expect(html).toContain("Show 2 more");
    expect(html).toContain("session-list__session-shell");
    expect(html).not.toContain("session-list__session-drag");
  });

  it("renders live running duration and context percent at the session layer", () => {
    const html = renderToStaticMarkup(
      <SessionList
        historyVersion={0}
        now={71_000}
        usageOverview={{
          summary: { rateLimits: [], contextMode: "single-session" },
          sessions: [
            {
              agent: "codex",
              sessionId: "current-1",
              updatedAt: 70_000,
              sources: ["session-derived"],
              completeness: "partial",
              context: { percent: 88 },
            },
          ],
        }}
        sessions={[
          row({
            id: "current-1",
            status: "running",
            latestRunningStartedAt: 1_000,
            updatedAt: 70_000,
            titleLabel: "Codex · repo audit",
            collapsedSummary: "live run",
          }),
        ]}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Run 1m 10s");
    expect(html).toContain("Context 88%");
  });

  it("does not deemphasize non-expanded rows when one session is expanded", () => {
    const html = renderToStaticMarkup(
      <SessionList
        historyVersion={0}
        sessions={[
          row({
            id: "expanded-session",
            status: "running",
            titleLabel: "Expanded session",
            collapsedSummary: "focus",
          }),
          row({
            id: "background-session",
            status: "waiting",
            titleLabel: "Background session",
            collapsedSummary: "secondary",
          }),
        ]}
        initiallyExpandedSessionId="expanded-session"
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-list session-list--focus");
    expect(html).toContain("session-row--expanded");
    expect(html).not.toContain("session-row--backgrounded");
  });
});
