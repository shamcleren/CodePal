import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AnalyticsMetric, TokenTrendGranularity, TokenTrendPoint } from "../../shared/analyticsTypes";
import { UNKNOWN_PROJECT_NAME, UNKNOWN_PROJECT_PATH, isUnknownProjectPath } from "../../shared/projectAttribution";
import type { ModelPricing } from "../../shared/usageTypes";
import {
  lttbSample,
  resolveLttbTargetPointCount,
  type AnalyticsPoint,
} from "../../shared/analyticsSampling";
import { useI18n } from "../i18n";
import { estimateTrendPointCost, formatMetricValue } from "../usageFormat";

type Series = {
  key: string;
  label: string;
  color: string;
  points: AnalyticsPoint[];
};

export type TrendGroupMode = "project" | "tokenType";

type Translate = ReturnType<typeof useI18n>["t"];

type HoverValue = {
  key: string;
  label: string;
  color: string;
  value: number;
  svgY: number;
};

type HoverTarget = {
  x: number;
  svgX: number;
  zoneX: number;
  zoneWidth: number;
  label: string;
  values: HoverValue[];
};

const SVG_WIDTH = 720;
const SVG_HEIGHT = 260;
const PAD_LEFT = 56;
const PAD_RIGHT = 18;
const PAD_TOP = 16;
const PAD_BOTTOM = 34;
const MAIN_CHART_MIN_POINTS = 96;

const TOKEN_COLORS = {
  total: "var(--trend-line-total)",
  input: "var(--trend-line-input)",
  output: "var(--trend-line-output)",
  cache: "var(--trend-line-cache)",
};

const PROJECT_COLORS = [
  "var(--trend-line-total)",
  "var(--trend-line-input)",
  "var(--trend-line-output)",
  "var(--trend-line-cache)",
  "var(--accent)",
  "var(--text-faint)",
];
const MAX_PROJECT_SERIES = 5;
const OTHER_PROJECTS_LABEL = "Other";

const TICK_BUCKET_STEPS: Record<TokenTrendGranularity, number[]> = {
  minute: [1, 5, 10, 15, 30, 60, 120, 240, 360, 720, 1440],
  hour: [1, 2, 3, 4, 6, 12, 24, 48, 72, 168],
  day: [1, 2, 3, 7, 14, 30],
};

export function AnalyticsLineChart({
  points,
  metric,
  groupMode = "tokenType",
  granularity,
  domainStart,
  domainEnd,
  pricing,
  yFormat = defaultYFormat,
}: {
  points: TokenTrendPoint[];
  metric: AnalyticsMetric;
  groupMode?: TrendGroupMode;
  granularity?: TokenTrendGranularity;
  domainStart?: number;
  domainEnd?: number;
  pricing?: ModelPricing[];
  yFormat?: (value: number, metric: AnalyticsMetric) => string;
}) {
  const i18n = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(SVG_WIDTH);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [visibleSeriesKeys, setVisibleSeriesKeys] = useState<string[] | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setPlotWidth(Math.max(240, entry.contentRect.width - 32));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rawSeries = useMemo(
    () => seriesForMetric(points, metric, pricing ?? [], groupMode, i18n.t),
    [points, metric, pricing, groupMode, i18n.locale],
  );
  const rawAllPoints = rawSeries.flatMap((entry) => entry.points);
  const rawXMin = Math.min(...rawAllPoints.map((point) => point.x));
  const rawXMax = Math.max(...rawAllPoints.map((point) => point.x));
  const explicitXMin =
    typeof domainStart === "number" && Number.isFinite(domainStart) ? domainStart : undefined;
  const explicitXMax =
    typeof domainEnd === "number" && Number.isFinite(domainEnd) ? domainEnd : undefined;
  const xMin = alignDomainStart(explicitXMin ?? rawXMin, granularity);
  const candidateXMax =
    explicitXMax !== undefined && explicitXMax > xMin ? explicitXMax : rawXMax;
  const xMax = alignDomainEnd(candidateXMax, granularity, xMin);
  const completedSeries = useMemo(
    () => fillSeriesBucketGaps(rawSeries, metric, granularity, xMin, xMax),
    [rawSeries, metric, granularity, xMin, xMax],
  );
  const allSeriesKeys = useMemo(() => completedSeries.map((entry) => entry.key), [completedSeries]);
  const allSeriesKeySignature = allSeriesKeys.join("\u001f");
  useEffect(() => {
    setVisibleSeriesKeys(allSeriesKeys);
  }, [allSeriesKeySignature]);
  const activeSeriesKeys = visibleSeriesKeys ?? allSeriesKeys;
  const activeSeriesKeySet = useMemo(() => new Set(activeSeriesKeys), [activeSeriesKeys]);
  const hasHiddenSeries = activeSeriesKeys.length < allSeriesKeys.length;
  const visibleCompletedSeries = useMemo(
    () => completedSeries.filter((entry) => activeSeriesKeySet.has(entry.key)),
    [completedSeries, activeSeriesKeySet],
  );
  const sourcePointCount = Math.max(0, ...visibleCompletedSeries.map((series) => series.points.length));
  const targetPointCount = resolveLttbTargetPointCount({
    plotWidth,
    minPxPerPoint: 5.5,
    minPoints: MAIN_CHART_MIN_POINTS,
    maxPoints: 260,
  });
  const summarizeTrend = sourcePointCount > targetPointCount;
  const series = useMemo(
    () =>
      visibleCompletedSeries.map((entry) => ({
        ...entry,
        points: summarizeTrend
          ? summarizeSeries(entry.points, targetPointCount)
          : entry.points.length > targetPointCount
            ? lttbSample(entry.points, targetPointCount)
            : entry.points,
      })),
    [visibleCompletedSeries, summarizeTrend, targetPointCount],
  );
  const sampledPointCount = Math.max(0, ...series.map((entry) => entry.points.length));
  const allPoints = series.flatMap((entry) => entry.points);
  const yMax = Math.max(1, ...allPoints.map((point) => point.y));
  const plotH = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotW = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
  const hasData = allPoints.length > 0;

  const toSvgX = (x: number) =>
    PAD_LEFT + ((x - xMin) / Math.max(1, xMax - xMin)) * plotW;
  const toSvgY = (y: number) => PAD_TOP + plotH - (y / yMax) * plotH;
  const xTicks = buildTimeTicks(xMin, xMax, granularity);
  const hoverTargets = buildHoverTargets(series, toSvgX, toSvgY, xMax - xMin, granularity);
  const activeHover =
    hoverIndex !== null && hoverTargets[hoverIndex] ? hoverTargets[hoverIndex] : null;
  const seriesForDrawing = [...series].sort((a, b) => {
    const aPriority = a.key === "total" || a.key === "requests" || a.key === "cost" ? 1 : 0;
    const bPriority = b.key === "total" || b.key === "requests" || b.key === "cost" ? 1 : 0;
    return aPriority - bPriority;
  });
  const updateHoverFromClientPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const svgX = ((clientX - rect.left) / Math.max(1, rect.width)) * SVG_WIDTH;
    const svgY = ((clientY - rect.top) / Math.max(1, rect.height)) * SVG_HEIGHT;
    if (svgY < PAD_TOP || svgY > PAD_TOP + plotH) {
      setHoverIndex(null);
      return;
    }
    setHoverIndex(nearestHoverTargetIndex(hoverTargets, svgX));
  };
  const handleChartHover = (
    event: ReactPointerEvent<Element> | ReactMouseEvent<Element>,
  ) => {
    updateHoverFromClientPoint(event.clientX, event.clientY);
  };
  const handleToggleSeries = (key: string) => {
    setVisibleSeriesKeys((current) =>
      nextVisibleSeriesKeys(allSeriesKeys, current ?? allSeriesKeys, key),
    );
    setHoverIndex(null);
  };
  const handleShowAllSeries = () => {
    setVisibleSeriesKeys(allSeriesKeys);
    setHoverIndex(null);
  };

  if (!hasData) {
    return (
      <div className="analytics-line-chart analytics-line-chart--empty" ref={wrapRef}>
        <div className="analytics-line-chart__empty">{i18n.t("tokenStats.trend.empty")}</div>
      </div>
    );
  }

  return (
    <div
      className="analytics-line-chart"
      ref={wrapRef}
      onPointerMove={handleChartHover}
      onMouseMove={handleChartHover}
      onPointerLeave={() => setHoverIndex(null)}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <div className="analytics-line-chart__plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          preserveAspectRatio="none"
          onPointerMove={handleChartHover}
          onMouseMove={handleChartHover}
          onPointerLeave={() => setHoverIndex(null)}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = PAD_TOP + plotH - plotH * ratio;
            const value = yMax * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={PAD_LEFT}
                  x2={SVG_WIDTH - PAD_RIGHT}
                  y1={y}
                  y2={y}
                  className="analytics-line-chart__grid"
                />
                <text
                  x={PAD_LEFT - 8}
                  y={y + 3}
                  className="analytics-line-chart__axis-label"
                  textAnchor="end"
                >
                  {yFormat(value, metric)}
                </text>
              </g>
            );
          })}
          <line
            x1={PAD_LEFT}
            x2={SVG_WIDTH - PAD_RIGHT}
            y1={PAD_TOP + plotH}
            y2={PAD_TOP + plotH}
            className="analytics-line-chart__axis"
          />
          {xTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={toSvgX(tick)}
                x2={toSvgX(tick)}
                y1={PAD_TOP}
                y2={PAD_TOP + plotH}
                className="analytics-line-chart__grid analytics-line-chart__grid--vertical"
              />
              <text
                x={toSvgX(tick)}
                y={SVG_HEIGHT - 8}
                className="analytics-line-chart__axis-label analytics-line-chart__axis-label--x"
                textAnchor="middle"
              >
                {formatTimeTick(tick, xMax - xMin, granularity)}
              </text>
            </g>
          ))}
          {seriesForDrawing.map((entry) => (
            <g key={entry.key}>
              {entry.points.length > 1 && shouldRenderArea(entry.key, series.length) ? (
                <path
                  className={`analytics-line-chart__area analytics-line-chart__area--${entry.key}`}
                  d={pointsToAreaPath(entry.points, toSvgX, toSvgY, PAD_TOP + plotH)}
                  fill={entry.color}
                />
              ) : null}
              {entry.points.length > 1 ? (
                <path
                  className={`analytics-line-chart__line analytics-line-chart__line--${entry.key}`}
                  d={pointsToLinePath(entry.points, toSvgX, toSvgY)}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={entry.key === "total" ? "2.4" : "1.8"}
                  strokeLinecap="round"
                />
              ) : null}
              {(entry.points.length === 1
                ? entry.points
                : [entry.points[0], entry.points.at(-1)!]
              ).map((point) => (
                <circle
                  key={`${entry.key}-${point.x}`}
                  className="analytics-line-chart__point"
                  cx={toSvgX(point.x)}
                  cy={toSvgY(point.y)}
                  r={entry.points.length === 1 ? 4 : 2.5}
                  fill={entry.color}
                />
              ))}
            </g>
          ))}
          {hoverTargets.map((target, index) => (
            <rect
              key={`hover-${target.x}`}
              className="analytics-line-chart__hover-zone"
              x={target.zoneX}
              y={PAD_TOP}
              width={target.zoneWidth}
              height={plotH}
              fill="transparent"
              tabIndex={0}
              aria-label={target.label}
              onPointerEnter={() => setHoverIndex(index)}
              onPointerMove={() => setHoverIndex(index)}
              onMouseEnter={() => setHoverIndex(index)}
              onMouseMove={() => setHoverIndex(index)}
              onFocus={() => setHoverIndex(index)}
              onBlur={() => setHoverIndex(null)}
            />
          ))}
          {activeHover ? (
            <g className="analytics-line-chart__hover-layer" pointerEvents="none">
              <line
                x1={activeHover.svgX}
                x2={activeHover.svgX}
                y1={PAD_TOP}
                y2={PAD_TOP + plotH}
                className="analytics-line-chart__crosshair"
              />
              {activeHover.values.map((value) => (
                <circle
                  key={`active-${value.key}`}
                  className="analytics-line-chart__active-point"
                  cx={activeHover.svgX}
                  cy={value.svgY}
                  r={value.key === "total" ? 4 : 3.2}
                  fill={value.color}
                />
              ))}
            </g>
          ) : null}
        </svg>
        {activeHover ? (
          <ChartTooltip
            hover={activeHover}
            metric={metric}
            valueFormat={yFormat}
          />
        ) : null}
      </div>
      <div className="analytics-line-chart__footer">
        <div className="analytics-line-chart__legend">
          {completedSeries.map((entry) => {
            const isActive = activeSeriesKeySet.has(entry.key);
            return (
            <button
              key={entry.key}
              type="button"
              className={`analytics-line-chart__legend-item${isActive ? "" : " analytics-line-chart__legend-item--muted"}`}
              aria-pressed={isActive}
              title={i18n.t(isActive ? "tokenStats.trend.hideSeries" : "tokenStats.trend.showSeries", {
                label: entry.label,
              })}
              onClick={() => handleToggleSeries(entry.key)}
            >
              <span
                className="analytics-line-chart__legend-dot"
                style={{ background: entry.color }}
              />
              {entry.label}
            </button>
            );
          })}
        </div>
        <button
          type="button"
          className="analytics-line-chart__legend-reset"
          disabled={!hasHiddenSeries}
          onClick={handleShowAllSeries}
        >
          {i18n.t("tokenStats.trend.showAll")}
        </button>
        {summarizeTrend ? (
          <span className="analytics-line-chart__sampling">
            {i18n.t("tokenStats.sampling.summarized", {
              sampled: sampledPointCount,
              source: sourcePointCount,
            })}
          </span>
        ) : sourcePointCount > sampledPointCount ? (
          <span className="analytics-line-chart__sampling">
            {i18n.t("tokenStats.sampling.lttb", {
              sampled: sampledPointCount,
              source: sourcePointCount,
            })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ChartTooltip({
  hover,
  metric,
  valueFormat,
}: {
  hover: HoverTarget;
  metric: AnalyticsMetric;
  valueFormat: (value: number, metric: AnalyticsMetric) => string;
}) {
  const align = hover.svgX > SVG_WIDTH * 0.64 ? "left" : "right";

  return (
    <div
      className={`analytics-line-chart__tooltip analytics-line-chart__tooltip--${align}`}
      style={{ left: `${(hover.svgX / SVG_WIDTH) * 100}%` }}
    >
      <div className="analytics-line-chart__tooltip-title">{hover.label}</div>
      {hover.values.map((value, index) => {
        return (
          <div className="analytics-line-chart__tooltip-row" key={`${value.key}-${index}`}>
            <span
              className="analytics-line-chart__tooltip-dot"
              style={{ background: value.color }}
            />
            <span className="analytics-line-chart__tooltip-label">{value.label}</span>
            <span className="analytics-line-chart__tooltip-value">
              {valueFormat(value.value, metric)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function nextVisibleSeriesKeys(
  allKeys: string[],
  currentVisibleKeys: string[],
  toggledKey: string,
): string[] {
  const knownKeys = new Set(allKeys);
  const current = new Set(currentVisibleKeys.filter((key) => knownKeys.has(key)));
  if (!knownKeys.has(toggledKey)) {
    return allKeys.filter((key) => current.has(key));
  }
  if (current.has(toggledKey)) {
    if (current.size <= 1) {
      return allKeys.filter((key) => current.has(key));
    }
    current.delete(toggledKey);
  } else {
    current.add(toggledKey);
  }
  return allKeys.filter((key) => current.has(key));
}

function buildHoverTargets(
  series: Series[],
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number,
  spanMs: number,
  granularity?: TokenTrendGranularity,
): HoverTarget[] {
  const xValues = Array.from(
    new Set(series.flatMap((entry) => entry.points.map((point) => point.x))),
  ).sort((a, b) => a - b);

  return xValues.map((x, index) => {
    const svgX = toSvgX(x);
    const previousBoundary =
      index === 0 ? PAD_LEFT : (toSvgX(xValues[index - 1]) + svgX) / 2;
    const nextBoundary =
      index === xValues.length - 1
        ? SVG_WIDTH - PAD_RIGHT
        : (svgX + toSvgX(xValues[index + 1])) / 2;
    const zoneX = clamp(previousBoundary, PAD_LEFT, SVG_WIDTH - PAD_RIGHT);
    const zoneEnd = clamp(nextBoundary, PAD_LEFT, SVG_WIDTH - PAD_RIGHT);

    return {
      x,
      svgX,
      zoneX,
      zoneWidth: Math.max(1, zoneEnd - zoneX),
      label: formatHoverLabel(x, spanMs, granularity),
      values: series
        .map((entry) => {
          const point = nearestPoint(entry.points, x);
          if (!point) return null;
          return {
            key: entry.key,
            label: entry.label,
            color: entry.color,
            value: point.y,
            svgY: toSvgY(point.y),
          };
        })
        .filter((value): value is HoverValue => value !== null),
    };
  });
}

function nearestPoint(points: AnalyticsPoint[], x: number): AnalyticsPoint | null {
  if (points.length === 0) {
    return null;
  }
  return points.reduce((best, point) =>
    Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best,
  );
}

function nearestHoverTargetIndex(targets: HoverTarget[], svgX: number): number | null {
  if (targets.length === 0) {
    return null;
  }
  return targets.reduce((bestIndex, target, index) =>
    Math.abs(target.svgX - svgX) < Math.abs(targets[bestIndex].svgX - svgX)
      ? index
      : bestIndex,
  0);
}

function shouldRenderArea(key: string, seriesCount: number): boolean {
  return seriesCount === 1 || key === "total" || key === "requests" || key === "cost";
}

function pointsToLinePath(
  points: AnalyticsPoint[],
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number,
): string {
  if (points.length === 0) {
    return "";
  }
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${pathNumber(toSvgX(point.x))} ${pathNumber(toSvgY(point.y))}`;
    })
    .join(" ");
}

function pointsToAreaPath(
  points: AnalyticsPoint[],
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number,
  baselineY: number,
): string {
  if (points.length === 0) {
    return "";
  }
  const first = points[0];
  const last = points[points.length - 1];
  return `${pointsToLinePath(points, toSvgX, toSvgY)} L ${pathNumber(toSvgX(last.x))} ${pathNumber(baselineY)} L ${pathNumber(toSvgX(first.x))} ${pathNumber(baselineY)} Z`;
}

function summarizeSeries(points: AnalyticsPoint[], targetPointCount: number): AnalyticsPoint[] {
  if (points.length <= targetPointCount) {
    return points;
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const bucketCount = Math.max(8, Math.min(targetPointCount, sorted.length));
  const xRange = Math.max(1, last.x - first.x);
  const buckets = Array.from({ length: bucketCount }, () => ({
    count: 0,
    sumX: 0,
    sumY: 0,
  }));

  for (const point of sorted) {
    const index = Math.min(
      bucketCount - 1,
      Math.floor(((point.x - first.x) / xRange) * bucketCount),
    );
    buckets[index].count += 1;
    buckets[index].sumX += point.x;
    buckets[index].sumY += point.y;
  }

  const summarized = buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      x: bucket.sumX / bucket.count,
      y: bucket.sumY / bucket.count,
    }));

  const smoothed = smoothPoints(summarized, 7);
  if (smoothed.length > 0) {
    smoothed[0] = { ...smoothed[0], x: first.x };
    smoothed[smoothed.length - 1] = {
      ...smoothed[smoothed.length - 1],
      x: last.x,
    };
  }
  return smoothed;
}

function smoothPoints(points: AnalyticsPoint[], windowSize: number): AnalyticsPoint[] {
  if (points.length <= 3) {
    return points;
  }
  const radius = Math.floor(windowSize / 2);
  return points.map((point, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(points.length, index + radius + 1);
    const slice = points.slice(start, end);
    return {
      x: point.x,
      y: slice.reduce((sum, entry) => sum + entry.y, 0) / slice.length,
    };
  });
}

function seriesForMetric(
  points: TokenTrendPoint[],
  metric: AnalyticsMetric,
  pricing: ModelPricing[],
  groupMode: TrendGroupMode = "tokenType",
  t: Translate = (key) => key,
): Series[] {
  const pricingByModel = new Map(pricing.map((entry) => [entry.modelId, entry]));
  const costForPoint = (point: TokenTrendPoint) => {
    const exactPrice = pricingByModel.get(point.model);
    return exactPrice
      ? estimateTrendPointCost(point, [exactPrice]) ?? 0
      : estimateTrendPointCost(point, pricing) ?? 0;
  };

  if (groupMode === "project") {
    return projectSeriesForMetric(points, metric, costForPoint, t);
  }

  const buckets = new Map<number, TokenTrendPoint[]>();
  for (const point of points) {
    const group = buckets.get(point.bucketStart) ?? [];
    group.push(point);
    buckets.set(point.bucketStart, group);
  }
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
  const pointFor = (valueForBucket: (bucket: TokenTrendPoint[]) => number): AnalyticsPoint[] =>
    sortedBuckets.map(([bucketStart, bucket]) => ({
      x: bucketStart,
      y: valueForBucket(bucket),
    }));

  if (metric === "requests") {
    return [
      {
        key: "requests",
        label: t("tokenStats.trend.requests"),
        color: TOKEN_COLORS.total,
        points: pointFor((bucket) => bucket.reduce((sum, point) => sum + point.requestCount, 0)),
      },
    ];
  }
  if (metric === "cost") {
    return [
      {
        key: "cost",
        label: t("tokenStats.trend.cost"),
        color: TOKEN_COLORS.total,
        points: pointFor((bucket) =>
          bucket.reduce((sum, point) => {
            return sum + costForPoint(point);
          }, 0),
        ),
      },
    ];
  }
  if (metric === "cacheHit") {
    return [
      {
        key: "cacheHit",
        label: t("tokenStats.trend.cacheHit"),
        color: TOKEN_COLORS.cache,
        points: pointFor((bucket) => {
          const inputLike = bucket.reduce(
            (sum, point) =>
              sum + point.inputTokens + point.cacheReadTokens + point.cacheCreationTokens,
            0,
          );
          const cache = bucket.reduce((sum, point) => sum + point.cacheReadTokens, 0);
          return inputLike > 0 ? (cache / inputLike) * 100 : 0;
        }),
      },
    ];
  }

  return [
    {
      key: "total",
      label: t("tokenStats.trend.total"),
      color: TOKEN_COLORS.total,
      points: pointFor((bucket) => bucket.reduce((sum, point) => sum + point.totalTokens, 0)),
    },
    {
      key: "input",
      label: t("tokenStats.trend.input"),
      color: TOKEN_COLORS.input,
      points: pointFor((bucket) => bucket.reduce((sum, point) => sum + point.inputTokens, 0)),
    },
    {
      key: "output",
      label: t("tokenStats.trend.output"),
      color: TOKEN_COLORS.output,
      points: pointFor((bucket) => bucket.reduce((sum, point) => sum + point.outputTokens, 0)),
    },
    {
      key: "cache",
      label: t("tokenStats.trend.cache"),
      color: TOKEN_COLORS.cache,
      points: pointFor((bucket) =>
        bucket.reduce(
          (sum, point) => sum + point.cacheReadTokens + point.cacheCreationTokens,
          0,
        ),
      ),
    },
  ];
}

function projectSeriesForMetric(
  points: TokenTrendPoint[],
  metric: AnalyticsMetric,
  costForPoint: (point: TokenTrendPoint) => number,
  t: Translate,
): Series[] {
  const projectRanks = new Map<string, {
    key: string;
    label: string;
    value: number;
    unknown: boolean;
  }>();

  for (const point of points) {
    const project = projectInfo(point);
    const rank = projectRanks.get(project.key) ?? {
      key: project.key,
      label: project.label,
      value: 0,
      unknown: project.unknown,
    };
    rank.value += projectPointValue(point, metric, costForPoint);
    projectRanks.set(project.key, rank);
  }

  const ranked = Array.from(projectRanks.values())
    .filter((entry) => entry.value > 0)
    .sort((a, b) =>
      Number(a.unknown) - Number(b.unknown) ||
      b.value - a.value ||
      a.label.localeCompare(b.label),
    );
  const visible = ranked.slice(0, MAX_PROJECT_SERIES);
  const visibleKeys = new Set(visible.map((entry) => entry.key));
  const otherProjectCount = ranked.filter((entry) => !visibleKeys.has(entry.key)).length;
  const hasOther = otherProjectCount > 0;

  const buckets = new Map<number, Map<string, number>>();
  for (const point of points) {
    const bucket = buckets.get(point.bucketStart) ?? new Map<string, number>();
    const project = projectInfo(point);
    const key = visibleKeys.has(project.key) ? project.key : hasOther ? OTHER_PROJECTS_LABEL : project.key;
    bucket.set(key, (bucket.get(key) ?? 0) + projectPointValue(point, metric, costForPoint));
    buckets.set(point.bucketStart, bucket);
  }

  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
  const seriesTargets = [
    ...visible.map((entry) => ({ key: entry.key, label: entry.label })),
    ...(hasOther
      ? [{
          key: OTHER_PROJECTS_LABEL,
          label: t("tokenStats.trend.otherCount", { count: otherProjectCount }),
        }]
      : []),
  ];

  return seriesTargets.map((entry, index) => ({
    key: `project-${index}`,
    label: entry.label,
    color: PROJECT_COLORS[index] ?? PROJECT_COLORS[PROJECT_COLORS.length - 1],
    points: sortedBuckets.map(([bucketStart, bucket]) => ({
      x: bucketStart,
      y: bucket.get(entry.key) ?? 0,
    })),
  }));
}

function projectInfo(point: TokenTrendPoint): { key: string; label: string; unknown: boolean } {
  const projectPath = point.projectPath?.trim() || UNKNOWN_PROJECT_PATH;
  const unknown = isUnknownProjectPath(projectPath);
  return {
    key: projectPath,
    label: unknown ? UNKNOWN_PROJECT_NAME : point.projectName?.trim() || basename(projectPath),
    unknown,
  };
}

function projectPointValue(
  point: TokenTrendPoint,
  metric: AnalyticsMetric,
  costForPoint: (point: TokenTrendPoint) => number,
): number {
  if (metric === "cost") {
    return costForPoint(point);
  }
  if (metric === "requests") {
    return point.requestCount;
  }
  if (metric === "cacheHit") {
    const inputLike = point.inputTokens + point.cacheReadTokens + point.cacheCreationTokens;
    return inputLike > 0 ? (point.cacheReadTokens / inputLike) * 100 : 0;
  }
  return point.totalTokens;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function fillSeriesBucketGaps(
  series: Series[],
  metric: AnalyticsMetric,
  granularity: TokenTrendGranularity | undefined,
  xMin: number,
  xMax: number,
): Series[] {
  if (
    metric === "cacheHit" ||
    !granularity ||
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    xMax <= xMin
  ) {
    return series;
  }

  const bucketStarts = bucketStartsBetween(xMin, xMax, granularity);
  if (bucketStarts.length === 0) {
    return series;
  }

  return series.map((entry) => {
    if (entry.points.length === 0) {
      return entry;
    }
    const valuesByBucket = new Map(entry.points.map((point) => [point.x, point.y]));
    return {
      ...entry,
      points: bucketStarts.map((x) => ({
        x,
        y: valuesByBucket.get(x) ?? 0,
      })),
    };
  });
}

function bucketStartsBetween(
  start: number,
  end: number,
  granularity: TokenTrendGranularity,
): number[] {
  const starts: number[] = [];
  let cursor = alignDomainStart(start, granularity);
  let guard = 0;
  while (cursor < end && guard < 10_000) {
    starts.push(cursor);
    cursor = nextBucketStart(cursor, granularity);
    guard += 1;
  }
  return starts;
}

function alignDomainStart(
  value: number,
  granularity?: TokenTrendGranularity,
): number {
  if (!granularity || !Number.isFinite(value)) {
    return value;
  }
  const date = new Date(value);
  if (granularity === "day") {
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  if (granularity === "hour") {
    date.setMinutes(0, 0, 0);
    return date.getTime();
  }
  date.setSeconds(0, 0);
  return date.getTime();
}

function alignDomainEnd(
  value: number,
  granularity: TokenTrendGranularity | undefined,
  minimum: number,
): number {
  if (!granularity || !Number.isFinite(value)) {
    return value;
  }
  const aligned = alignDomainStart(value, granularity);
  const end = aligned === value ? aligned : nextBucketStart(aligned, granularity);
  return end > minimum ? end : nextBucketStart(minimum, granularity);
}

function nextBucketStart(
  value: number,
  granularity: TokenTrendGranularity,
): number {
  const date = new Date(value);
  if (granularity === "day") {
    date.setDate(date.getDate() + 1);
  } else if (granularity === "hour") {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  } else {
    date.setMinutes(date.getMinutes() + 1, 0, 0);
  }
  return date.getTime();
}

function defaultYFormat(value: number, metric: AnalyticsMetric): string {
  return formatMetricValue(value, metric, "en");
}

function buildTimeTicks(
  xMin: number,
  xMax: number,
  granularity?: TokenTrendGranularity,
): number[] {
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return [];
  }
  if (xMin === xMax) {
    return [xMin];
  }

  if (granularity) {
    const buckets = bucketStartsBetween(xMin, xMax, granularity);
    if (buckets.length === 0) {
      return [];
    }
    const step = chooseBucketTickStep(buckets.length, granularity);
    const ticks = buckets.filter((_, index) => index % step === 0);
    if (isAlignedToBucketStart(xMax, granularity) && ticks.at(-1) !== xMax) {
      ticks.push(xMax);
    }
    return ticks;
  }

  const tickCount = 5;
  const step = (xMax - xMin) / (tickCount - 1);
  const ticks = Array.from({ length: tickCount }, (_, index) =>
    index === tickCount - 1 ? xMax : xMin + step * index,
  );
  return Array.from(new Set(ticks.map((tick) => Math.round(tick))));
}

function chooseBucketTickStep(bucketCount: number, granularity: TokenTrendGranularity): number {
  return (
    TICK_BUCKET_STEPS[granularity].find((step) => Math.ceil(bucketCount / step) <= 6) ??
    TICK_BUCKET_STEPS[granularity].at(-1) ??
    1
  );
}

function isAlignedToBucketStart(value: number, granularity: TokenTrendGranularity): boolean {
  return alignDomainStart(value, granularity) === value;
}

function formatTimeTick(
  value: number,
  spanMs: number,
  granularity?: TokenTrendGranularity,
): string {
  const date = new Date(value);
  if (granularity === "day") {
    return `${twoDigit(date.getMonth() + 1)}-${twoDigit(date.getDate())}`;
  }
  if (granularity === "hour") {
    if (spanMs > 36 * 60 * 60_000) {
      return `${twoDigit(date.getMonth() + 1)}-${twoDigit(date.getDate())} ${twoDigit(date.getHours())}h`;
    }
    return `${twoDigit(date.getHours())}:00`;
  }
  if (granularity === "minute" || spanMs <= 36 * 60 * 60_000) {
    return `${twoDigit(date.getHours())}:${twoDigit(date.getMinutes())}`;
  }
  return `${twoDigit(date.getMonth() + 1)}-${twoDigit(date.getDate())}`;
}

function formatHoverLabel(
  value: number,
  spanMs: number,
  granularity?: TokenTrendGranularity,
): string {
  const date = new Date(value);
  const day = `${twoDigit(date.getMonth() + 1)}-${twoDigit(date.getDate())}`;
  if (granularity === "day" && spanMs > 36 * 60 * 60_000) {
    return day;
  }
  return `${day} ${twoDigit(date.getHours())}:${twoDigit(date.getMinutes())}`;
}

function twoDigit(value: number): string {
  return value.toString().padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pathNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}
