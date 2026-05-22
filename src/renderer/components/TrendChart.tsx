import { useState, useMemo } from "react";
import { lttb, type Point } from "../lib/lttb";

export type TrendSeries = {
  label: string;
  points: Point[];
};

const SVG_WIDTH = 600;
const SVG_HEIGHT = 160;
const PAD_LEFT = 48;
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 24;
const GRID_LINES = 3;

const SERIES_COLORS = [
  "var(--trend-line-input)",
  "var(--trend-line-output)",
  "var(--trend-line-cache)",
];

export function TrendChart({
  series,
  yFormat,
  xLabels,
  maxPoints = 60,
}: {
  series: TrendSeries[];
  yFormat: (n: number) => string;
  xLabels: string[];
  maxPoints?: number;
}) {
  const [hoverX, setHoverX] = useState<number | null>(null);

  const plotW = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

  // Downsample each series
  const downsampled = useMemo(
    () => series.map((s) => ({ ...s, points: lttb(s.points, maxPoints) })),
    [series, maxPoints],
  );

  // Find global Y max
  const yMax = useMemo(() => {
    let max = 0;
    for (const s of downsampled) {
      for (const p of s.points) {
        if (p.y > max) max = p.y;
      }
    }
    return max || 1;
  }, [downsampled]);

  // Collect all X values for hover detection
  const allXValues = useMemo(() => {
    const set = new Set<number>();
    for (const s of downsampled) {
      for (const p of s.points) set.add(p.x);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [downsampled]);

  const xMin = allXValues[0] ?? 0;
  const xMax = allXValues[allXValues.length - 1] ?? 1;
  const xRange = xMax - xMin || 1;

  const toSvgX = (x: number) => PAD_LEFT + ((x - xMin) / xRange) * plotW;
  const toSvgY = (y: number) => PAD_TOP + plotH - (y / yMax) * plotH;

  // Find nearest X index for hover
  const hoverIndex =
    hoverX !== null
      ? allXValues.reduce(
          (best, x, i) =>
            Math.abs(x - hoverX) < Math.abs(allXValues[best] - hoverX) ? i : best,
          0,
        )
      : null;

  const hasData = downsampled.some((s) => s.points.length > 0);

  if (!hasData) return null;

  return (
    <div
      className="trend-chart"
      onMouseLeave={() => setHoverX(null)}
    >
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        className="trend-chart__svg"
      >
        {/* Grid lines */}
        {Array.from({ length: GRID_LINES }, (_, i) => {
          const yVal = (yMax / GRID_LINES) * (GRID_LINES - i);
          const y = toSvgY(yVal);
          return (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                y1={y}
                x2={SVG_WIDTH - PAD_RIGHT}
                y2={y}
                className="trend-chart__grid-line"
              />
              <text x={PAD_LEFT - 4} y={y + 3} className="trend-chart__y-label">
                {yFormat(yVal)}
              </text>
            </g>
          );
        })}
        {/* Zero line */}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + plotH}
          x2={SVG_WIDTH - PAD_RIGHT}
          y2={PAD_TOP + plotH}
          className="trend-chart__grid-line"
        />

        {/* Series polylines */}
        {downsampled.map((s, si) => {
          const pointsStr = s.points
            .map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`)
            .join(" ");
          return (
            <polyline
              key={si}
              points={pointsStr}
              fill="none"
              stroke={SERIES_COLORS[si] ?? SERIES_COLORS[0]}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Hover crosshair + tooltip */}
        {hoverIndex !== null && allXValues[hoverIndex] !== undefined ? (
          <>
            <line
              x1={toSvgX(allXValues[hoverIndex])}
              y1={PAD_TOP}
              x2={toSvgX(allXValues[hoverIndex])}
              y2={PAD_TOP + plotH}
              className="trend-chart__crosshair"
            />
            {downsampled.map((s, si) => {
              const px = allXValues[hoverIndex];
              const pt = s.points.find((p) => p.x === px);
              if (!pt) return null;
              return (
                <circle
                  key={si}
                  cx={toSvgX(pt.x)}
                  cy={toSvgY(pt.y)}
                  r="3"
                  fill={SERIES_COLORS[si] ?? SERIES_COLORS[0]}
                />
              );
            })}
            <text
              x={toSvgX(allXValues[hoverIndex])}
              y={PAD_TOP - 2}
              className="trend-chart__tooltip"
              textAnchor="middle"
            >
              {xLabels[hoverIndex] ?? ""}
            </text>
          </>
        ) : null}

        {/* Hover detection zones */}
        {allXValues.map((x, i) => (
          <rect
            key={i}
            x={i === 0 ? PAD_LEFT : toSvgX((allXValues[i - 1] + x) / 2)}
            y={PAD_TOP}
            width={
              i === allXValues.length - 1
                ? SVG_WIDTH - PAD_RIGHT - toSvgX(x)
                : toSvgX((x + allXValues[i + 1]) / 2) -
                  (i === 0 ? PAD_LEFT : toSvgX((allXValues[i - 1] + x) / 2))
            }
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHoverX(x)}
          />
        ))}
      </svg>
    </div>
  );
}
