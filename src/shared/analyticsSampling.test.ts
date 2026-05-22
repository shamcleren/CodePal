import { describe, expect, it } from "vitest";
import { lttbSample, resolveLttbTargetPointCount } from "./analyticsSampling";

describe("lttbSample", () => {
  it("returns the original series when the target is not smaller", () => {
    const points = [
      { x: 1, y: 10 },
      { x: 2, y: 20 },
      { x: 3, y: 30 },
    ];

    expect(lttbSample(points, 5)).toEqual(points);
  });

  it("preserves endpoints and keeps a visible spike in a dense series", () => {
    const points = Array.from({ length: 100 }, (_, index) => ({
      x: index,
      y: index === 50 ? 1000 : Math.sin(index / 5) * 10,
    }));

    const sampled = lttbSample(points, 12);

    expect(sampled).toHaveLength(12);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points.at(-1));
    expect(sampled.some((point) => point.x === 50)).toBe(true);
  });

  it("derives the target point count from the rendered plot width", () => {
    expect(resolveLttbTargetPointCount({
      plotWidth: 320,
      minPxPerPoint: 2.5,
      minPoints: 120,
      maxPoints: 1600,
    })).toBe(128);
    expect(resolveLttbTargetPointCount({
      plotWidth: 120,
      minPxPerPoint: 2.5,
      minPoints: 120,
      maxPoints: 1600,
    })).toBe(120);
    expect(resolveLttbTargetPointCount({
      plotWidth: 10_000,
      minPxPerPoint: 2.5,
      minPoints: 120,
      maxPoints: 1600,
    })).toBe(1600);
  });
});
