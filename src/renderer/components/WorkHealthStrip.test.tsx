import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n";
import { WorkHealthStrip } from "./WorkHealthStrip";
import type { WorkHealthSummary } from "../../shared/analyticsTypes";

function render(summary: WorkHealthSummary) {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <WorkHealthStrip
        summary={summary}
        activeKind={null}
        onSignalClick={() => undefined}
      />
    </I18nProvider>,
  );
}

const summary: WorkHealthSummary = {
  generatedAt: 1,
  selectedRange: { startMs: 100, endMs: 200 },
  previousRange: { startMs: 0, endMs: 99 },
  signals: [
    {
      kind: "attention",
      label: "Attention",
      value: "2",
      detail: "2 active items need review",
      tone: "warning",
      sessionIds: ["s1", "s2"],
    },
    {
      kind: "longest_wait",
      label: "Longest wait",
      value: "27m",
      detail: "Waiting since 27m ago",
      tone: "warning",
      sessionIds: ["s1"],
    },
    {
      kind: "unrecovered_failure",
      label: "Unrecovered failures",
      value: "1",
      detail: "1 failed session",
      tone: "danger",
      sessionIds: ["s3"],
    },
    {
      kind: "context_near_full",
      label: "Context near full",
      value: "91%",
      detail: "1 session above warning threshold",
      tone: "warning",
      sessionIds: ["s4"],
    },
    {
      kind: "cost_anomaly",
      label: "Cost anomaly",
      value: "+34%",
      detail: "vs previous equal-length range",
      tone: "warning",
      sessionIds: [],
    },
  ],
};

describe("WorkHealthStrip", () => {
  it("renders five health signals", () => {
    const html = render(summary);
    const itemCount = (html.match(/<button[^>]*work-health-strip__item/g) ?? []).length;
    expect(itemCount).toBe(5);
  });

  it("renders details and tone classes", () => {
    const html = render(summary);
    expect(html).toContain("vs previous equal-length range");
    expect(html).toContain("work-health-strip__item--danger");
    expect(html).toContain("work-health-strip__item--warning");
  });
});
