export type Point = { x: number; y: number };

/**
 * Largest Triangle Three Buckets (LTTB) downsampling.
 * Reduces point count while preserving visual shape.
 * Always keeps first and last points.
 */
export function lttb(points: Point[], threshold: number): Point[] {
  if (threshold >= points.length || threshold < 3) {
    return points;
  }

  const result: Point[] = [points[0]];
  const n = points.length;
  // Interior points: indices 1..n-2, split into threshold-2 buckets
  const bucketSize = (n - 2) / (threshold - 2);

  let prevIndex = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Bucket range [bucketStart, bucketEnd) — interior points only, excludes last point
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n - 1);

    // Next bucket average (or last point if final bucket)
    let avgX: number;
    let avgY: number;
    if (i < threshold - 3) {
      const nextStart = Math.floor((i + 1) * bucketSize) + 1;
      const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n - 1);
      let sumX = 0;
      let sumY = 0;
      const count = nextEnd - nextStart;
      for (let j = nextStart; j < nextEnd; j++) {
        sumX += points[j].x;
        sumY += points[j].y;
      }
      avgX = count > 0 ? sumX / count : points[n - 1].x;
      avgY = count > 0 ? sumY / count : points[n - 1].y;
    } else {
      avgX = points[n - 1].x;
      avgY = points[n - 1].y;
    }

    // Find point with largest triangle area
    let maxArea = -1;
    let selectedIndex = bucketStart;
    const prev = points[prevIndex];

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (prev.x - avgX) * (points[j].y - prev.y) -
        (prev.x - points[j].x) * (avgY - prev.y),
      );
      if (area > maxArea) {
        maxArea = area;
        selectedIndex = j;
      }
    }

    result.push(points[selectedIndex]);
    prevIndex = selectedIndex;
  }

  result.push(points[n - 1]);
  return result;
}
