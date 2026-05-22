export type AnalyticsPoint = { x: number; y: number };

export function resolveLttbTargetPointCount({
  plotWidth,
  minPxPerPoint,
  minPoints,
  maxPoints,
}: {
  plotWidth: number;
  minPxPerPoint: number;
  minPoints: number;
  maxPoints: number;
}): number {
  const raw = Math.floor(Math.max(0, plotWidth) / minPxPerPoint);
  return Math.max(minPoints, Math.min(maxPoints, raw));
}

export function lttbSample<T extends AnalyticsPoint>(points: T[], threshold: number): T[] {
  if (threshold >= points.length || threshold < 3) {
    return points;
  }

  const sampled: T[] = [points[0]];
  const bucketSize = (points.length - 2) / (threshold - 2);
  let previousIndex = 0;

  for (let bucketIndex = 0; bucketIndex < threshold - 2; bucketIndex++) {
    const bucketStart = Math.floor(bucketIndex * bucketSize) + 1;
    const bucketEnd = Math.min(
      Math.floor((bucketIndex + 1) * bucketSize) + 1,
      points.length - 1,
    );

    let avgX = points.at(-1)?.x ?? 0;
    let avgY = points.at(-1)?.y ?? 0;
    if (bucketIndex < threshold - 3) {
      const nextStart = Math.floor((bucketIndex + 1) * bucketSize) + 1;
      const nextEnd = Math.min(
        Math.floor((bucketIndex + 2) * bucketSize) + 1,
        points.length - 1,
      );
      let sumX = 0;
      let sumY = 0;
      for (let i = nextStart; i < nextEnd; i++) {
        sumX += points[i].x;
        sumY += points[i].y;
      }
      const count = nextEnd - nextStart;
      if (count > 0) {
        avgX = sumX / count;
        avgY = sumY / count;
      }
    }

    const previous = points[previousIndex];
    let maxArea = -1;
    let selectedIndex = bucketStart;

    for (let i = bucketStart; i < bucketEnd; i++) {
      const area = Math.abs(
        (previous.x - avgX) * (points[i].y - previous.y) -
          (previous.x - points[i].x) * (avgY - previous.y),
      );
      if (area > maxArea) {
        maxArea = area;
        selectedIndex = i;
      }
    }

    sampled.push(points[selectedIndex]);
    previousIndex = selectedIndex;
  }

  sampled.push(points[points.length - 1]);
  return sampled;
}
