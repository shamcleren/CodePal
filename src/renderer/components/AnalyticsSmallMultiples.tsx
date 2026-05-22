import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { TokenTrendPoint } from "../../shared/analyticsTypes";
import { useI18n } from "../i18n";

type SmallMultipleGroup = {
  key: string;
  label: string;
  points: TokenTrendPoint[];
  total: number;
};

type SparkPoint = {
  point: TokenTrendPoint;
  x: number;
  y: number;
};

const SPARK_WIDTH = 100;
const SPARK_HEIGHT = 46;
const SPARK_TOP = 4;
const SPARK_BOTTOM = 7;
const SPARK_PLOT_HEIGHT = SPARK_HEIGHT - SPARK_TOP - SPARK_BOTTOM;

export function AnalyticsSmallMultiples({
  points,
  selectedAgent,
  formatValue,
}: {
  points: TokenTrendPoint[];
  selectedAgent?: string;
  formatValue: (value: number) => string;
}) {
  const groups = groupPoints(points, selectedAgent);
  if (groups.length === 0) return null;

  return (
    <div className="analytics-small-multiples">
      {groups.slice(0, 3).map((group) => (
        <SmallMultipleCard
          group={group}
          formatValue={formatValue}
          key={group.key}
        />
      ))}
    </div>
  );
}

function SmallMultipleCard({
  group,
  formatValue,
}: {
  group: SmallMultipleGroup;
  formatValue: (value: number) => string;
}) {
  const i18n = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const sparkSource = summarizeSparkPoints(group.points, 56);
  const max = Math.max(1, ...sparkSource.map((point) => point.totalTokens));
  const latest = sparkSource.at(-1)?.totalTokens ?? 0;
  const peak = Math.max(0, ...sparkSource.map((point) => point.totalTokens));
  const sparkPoints: SparkPoint[] = sparkSource.map((point, index) => {
    const x = sparkSource.length === 1 ? SPARK_WIDTH / 2 : (index / (sparkSource.length - 1)) * SPARK_WIDTH;
    const y = SPARK_TOP + SPARK_PLOT_HEIGHT - (point.totalTokens / max) * SPARK_PLOT_HEIGHT;
    return { point, x, y };
  });
  const activePoint =
    hoverIndex !== null && sparkPoints[hoverIndex] ? sparkPoints[hoverIndex] : null;
  const linePoints = sparkPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath =
    sparkPoints.length > 1
      ? `M ${sparkPoints[0].x} ${SPARK_HEIGHT - SPARK_BOTTOM} L ${linePoints} L ${sparkPoints.at(-1)!.x} ${SPARK_HEIGHT - SPARK_BOTTOM} Z`
      : "";

  const updateHoverFromClientPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || sparkPoints.length === 0) {
      return;
    }
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * SPARK_WIDTH;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * SPARK_HEIGHT;
    if (y < 0 || y > SPARK_HEIGHT) {
      setHoverIndex(null);
      return;
    }
    setHoverIndex(nearestSparkPointIndex(sparkPoints, x));
  };
  const handleHover = (
    event: ReactPointerEvent<Element> | ReactMouseEvent<Element>,
  ) => {
    updateHoverFromClientPoint(event.clientX, event.clientY);
  };

  return (
    <div
      className="analytics-small-multiples__card"
      onPointerMove={handleHover}
      onMouseMove={handleHover}
      onPointerLeave={() => setHoverIndex(null)}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <div className="analytics-small-multiples__header">
        <div>
          <div className="analytics-small-multiples__label">{group.label}</div>
          <div className="analytics-small-multiples__value">{formatValue(group.total)}</div>
        </div>
      </div>
      <div className="analytics-small-multiples__chart">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          onPointerMove={handleHover}
          onMouseMove={handleHover}
        >
          <line
            className="analytics-small-multiples__grid"
            x1="0"
            x2={SPARK_WIDTH}
            y1={SPARK_HEIGHT - SPARK_BOTTOM}
            y2={SPARK_HEIGHT - SPARK_BOTTOM}
          />
          {sparkPoints.length > 1 ? (
            <>
              <path className="analytics-small-multiples__area" d={areaPath} />
              <polyline className="analytics-small-multiples__line" points={linePoints} fill="none" />
            </>
          ) : null}
          {sparkPoints.length === 1 ? (
            <circle className="analytics-small-multiples__point" cx={sparkPoints[0].x} cy={sparkPoints[0].y} r="3" />
          ) : null}
          {sparkPoints.map((point, index) => {
            const previous = sparkPoints[index - 1];
            const next = sparkPoints[index + 1];
            const zoneX = previous ? (previous.x + point.x) / 2 : 0;
            const zoneEnd = next ? (point.x + next.x) / 2 : SPARK_WIDTH;
            return (
              <rect
                className="analytics-small-multiples__hover-zone"
                key={`spark-hover-${point.point.bucketStart}`}
                x={zoneX}
                y="0"
                width={Math.max(1, zoneEnd - zoneX)}
                height={SPARK_HEIGHT}
                fill="transparent"
                onPointerEnter={() => setHoverIndex(index)}
                onPointerMove={() => setHoverIndex(index)}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseMove={() => setHoverIndex(index)}
              />
            );
          })}
          {activePoint ? (
            <g className="analytics-small-multiples__hover-layer" pointerEvents="none">
              <line
                className="analytics-small-multiples__crosshair"
                x1={activePoint.x}
                x2={activePoint.x}
                y1={SPARK_TOP}
                y2={SPARK_HEIGHT - SPARK_BOTTOM}
              />
              <circle
                className="analytics-small-multiples__active-point"
                cx={activePoint.x}
                cy={activePoint.y}
                r="3.4"
              />
            </g>
          ) : null}
        </svg>
        {activePoint ? (
          <div
            className={`analytics-small-multiples__tooltip ${
              activePoint.x > SPARK_WIDTH * 0.66
                ? "analytics-small-multiples__tooltip--left"
                : "analytics-small-multiples__tooltip--right"
            }`}
            style={{ left: `${activePoint.x}%` }}
          >
            <div className="analytics-small-multiples__tooltip-title">{group.label}</div>
            <div className="analytics-small-multiples__tooltip-row">
              <span>{formatSparkDate(activePoint.point.bucketStart)}</span>
              <strong>{formatValue(activePoint.point.totalTokens)}</strong>
            </div>
          </div>
        ) : null}
      </div>
      <div className="analytics-small-multiples__stats">
        <span>{i18n.t("tokenStats.peak")}: {formatValue(peak)}</span>
        <span>{i18n.t("tokenStats.latest")}: {formatValue(latest)}</span>
      </div>
    </div>
  );
}

function groupPoints(points: TokenTrendPoint[], selectedAgent?: string): SmallMultipleGroup[] {
  type Group = {
    key: string;
    label: string;
    pointsByBucket: Map<number, TokenTrendPoint>;
    total: number;
  };

  const groups = new Map<string, Group>();
  for (const point of points) {
    const key = selectedAgent ? point.model : point.agent;
    const group = groups.get(key) ?? {
      key,
      label: labelFor(key),
      pointsByBucket: new Map<number, TokenTrendPoint>(),
      total: 0,
    };
    const bucket = group.pointsByBucket.get(point.bucketStart) ?? {
      ...point,
      agent: selectedAgent ?? point.agent,
      model: selectedAgent ? point.model : "",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      requestCount: 0,
    };
    bucket.inputTokens += point.inputTokens;
    bucket.outputTokens += point.outputTokens;
    bucket.cacheReadTokens += point.cacheReadTokens;
    bucket.cacheCreationTokens += point.cacheCreationTokens;
    bucket.reasoningTokens += point.reasoningTokens;
    bucket.totalTokens += point.totalTokens;
    bucket.requestCount += point.requestCount;
    group.pointsByBucket.set(point.bucketStart, bucket);
    group.total += point.totalTokens;
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      label: group.label,
      points: Array.from(group.pointsByBucket.values()).sort((a, b) => a.bucketStart - b.bucketStart),
      total: group.total,
    }))
    .sort((a, b) => b.total - a.total);
}

function labelFor(value: string): string {
  const labels: Record<string, string> = {
    claude: "Claude",
    codex: "Codex",
    codebuddy: "CodeBuddy",
    cursor: "Cursor",
    goland: "GoLand",
    pycharm: "PyCharm",
  };
  return labels[value] ?? value;
}

function summarizeSparkPoints(points: TokenTrendPoint[], maxPoints: number): TokenTrendPoint[] {
  if (points.length <= maxPoints) {
    return smoothSparkPoints(points, points.length > 10 ? 3 : 1);
  }

  const sorted = [...points].sort((a, b) => a.bucketStart - b.bucketStart);
  const bucketCount = Math.max(8, Math.min(maxPoints, sorted.length));
  const bucketSize = sorted.length / bucketCount;
  const summarized: TokenTrendPoint[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const start = Math.floor(index * bucketSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * bucketSize));
    const slice = sorted.slice(start, Math.min(sorted.length, end));
    const base = slice[0];
    summarized.push({
      ...base,
      bucketStart: index === 0 ? sorted[0].bucketStart : slice[Math.floor(slice.length / 2)].bucketStart,
      totalTokens: slice.reduce((sum, point) => sum + point.totalTokens, 0) / slice.length,
    });
  }

  summarized[summarized.length - 1] = {
    ...summarized[summarized.length - 1],
    bucketStart: sorted[sorted.length - 1].bucketStart,
  };

  return smoothSparkPoints(summarized, 5);
}

function smoothSparkPoints(points: TokenTrendPoint[], windowSize: number): TokenTrendPoint[] {
  if (windowSize <= 1 || points.length <= 3) {
    return points;
  }
  const radius = Math.floor(windowSize / 2);
  return points.map((point, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(points.length, index + radius + 1);
    const slice = points.slice(start, end);
    return {
      ...point,
      totalTokens: slice.reduce((sum, entry) => sum + entry.totalTokens, 0) / slice.length,
    };
  });
}

function nearestSparkPointIndex(points: SparkPoint[], x: number): number {
  return points.reduce((bestIndex, point, index) =>
    Math.abs(point.x - x) < Math.abs(points[bestIndex].x - x) ? index : bestIndex,
  0);
}

function formatSparkDate(value: number): string {
  const date = new Date(value);
  return `${twoDigit(date.getMonth() + 1)}-${twoDigit(date.getDate())} ${twoDigit(date.getHours())}:${twoDigit(date.getMinutes())}`;
}

function twoDigit(value: number): string {
  return value.toString().padStart(2, "0");
}
