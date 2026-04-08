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
    expect(html.indexOf("latest user turn")).toBeLessThan(html.indexOf("older user turn"));
    expect(html.indexOf("older user turn")).toBeLessThan(html.indexOf("live run"));
  });

  it("renders title labels in the flat session list", () => {
    const html = renderToStaticMarkup(
      <SessionList
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
});
