import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendChart, type TrendSeries } from "./TrendChart";

function render(series: TrendSeries[], xLabels: string[] = []) {
  return renderToStaticMarkup(
    <TrendChart
      series={series}
      yFormat={(n) => String(Math.round(n))}
      xLabels={xLabels}
    />,
  );
}

describe("TrendChart", () => {
  it("returns null for empty series", () => {
    const html = render([]);
    expect(html).toBe("");
  });

  it("returns null when all series have no points", () => {
    const html = render([{ label: "Empty", points: [] }]);
    expect(html).toBe("");
  });

  it("renders an SVG with polylines for each series", () => {
    const html = render(
      [
        { label: "Input", points: [{ x: 0, y: 10 }, { x: 1, y: 20 }] },
        { label: "Output", points: [{ x: 0, y: 5 }, { x: 1, y: 15 }] },
      ],
      ["Jan", "Feb"],
    );
    expect(html).toContain("<svg");
    expect(html).toContain("trend-chart__svg");
    // Two polylines
    const polylineCount = (html.match(/<polyline/g) ?? []).length;
    expect(polylineCount).toBe(2);
  });

  it("renders grid lines", () => {
    const html = render(
      [{ label: "A", points: [{ x: 0, y: 0 }, { x: 1, y: 100 }] }],
      ["L1", "L2"],
    );
    const gridLines = (html.match(/trend-chart__grid-line/g) ?? []).length;
    // 3 grid lines + 1 zero line = 4
    expect(gridLines).toBe(4);
  });

  it("renders y-axis labels", () => {
    const html = render(
      [{ label: "A", points: [{ x: 0, y: 0 }, { x: 1, y: 300 }] }],
      ["L1", "L2"],
    );
    expect(html).toContain("trend-chart__y-label");
  });

  it("renders hover detection zones matching point count", () => {
    const html = render(
      [{ label: "A", points: [{ x: 0, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 30 }] }],
      ["L1", "L2", "L3"],
    );
    // 3 hover zones
    const rectCount = (html.match(/fill="transparent"/g) ?? []).length;
    expect(rectCount).toBe(3);
  });

  it("applies different stroke colors per series", () => {
    const html = render(
      [
        { label: "Input", points: [{ x: 0, y: 10 }, { x: 1, y: 20 }] },
        { label: "Output", points: [{ x: 0, y: 5 }, { x: 1, y: 15 }] },
        { label: "Cache", points: [{ x: 0, y: 2 }, { x: 1, y: 8 }] },
      ],
      ["L1", "L2"],
    );
    expect(html).toContain("var(--trend-line-input)");
    expect(html).toContain("var(--trend-line-output)");
    expect(html).toContain("var(--trend-line-cache)");
  });
});
