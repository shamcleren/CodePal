import { describe, expect, it } from "vitest";
import { lttb } from "./lttb";

describe("lttb", () => {
  it("returns points as-is when count <= threshold", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 1, y: 20 },
      { x: 2, y: 15 },
    ];
    expect(lttb(points, 5)).toBe(points);
  });

  it("returns points as-is when threshold < 3", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 1, y: 20 },
      { x: 2, y: 15 },
    ];
    expect(lttb(points, 2)).toBe(points);
  });

  it("preserves first and last points", () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 10) * 100,
    }));
    const result = lttb(points, 10);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[99]);
  });

  it("returns exactly threshold points", () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 10) * 100,
    }));
    const result = lttb(points, 10);
    expect(result).toHaveLength(10);
  });

  it("works with threshold equal to point count", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 1, y: 20 },
      { x: 2, y: 15 },
      { x: 3, y: 25 },
      { x: 4, y: 30 },
    ];
    expect(lttb(points, 5)).toBe(points);
  });

  it("handles flat data", () => {
    const points = Array.from({ length: 50 }, (_, i) => ({
      x: i,
      y: 10,
    }));
    const result = lttb(points, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual(points[0]);
    expect(result[4]).toEqual(points[49]);
  });

  it("preserves x-order of selected points", () => {
    const points = Array.from({ length: 50 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 5) * 100 + 100,
    }));
    const result = lttb(points, 10);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].x).toBeGreaterThan(result[i - 1].x);
    }
  });
});
