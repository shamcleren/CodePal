import type { ResolvedLocale } from "./i18nTypes";
import type { ActivityItem, SessionStatus } from "./sessionTypes";

type TimingActivity = Pick<ActivityItem, "timestamp" | "tone">;

export type SessionTimingInput = {
  status?: SessionStatus | string;
  updatedAt: number;
  lastUserMessageAt?: number | null;
  activityItems?: TimingActivity[];
  startedAt?: number | null;
  latestRunningStartedAt?: number | null;
  sessionDurationMs?: number | null;
  latestRunningDurationMs?: number | null;
};

export type SessionTiming = {
  startedAt?: number;
  sessionDurationMs?: number;
  latestRunningDurationMs?: number;
};

const RUNNING_END_TONES = new Set(["completed", "waiting", "idle", "error"]);

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveDuration(value: number | null | undefined): number | undefined {
  const duration = finiteNumber(value);
  return duration !== undefined && duration > 0 ? duration : undefined;
}

function sortedActivities(items: TimingActivity[] | undefined): TimingActivity[] {
  return (items ?? [])
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function deriveStartedAt(input: SessionTimingInput, activities: TimingActivity[]): number | undefined {
  const explicit = finiteNumber(input.startedAt);
  if (explicit !== undefined) {
    return explicit;
  }
  const candidates = [
    ...activities.map((item) => item.timestamp),
    finiteNumber(input.lastUserMessageAt),
    finiteNumber(input.updatedAt),
  ].filter((value): value is number => value !== undefined);
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

function sessionEndFor(input: SessionTimingInput, now: number): number | undefined {
  const updatedAt = finiteNumber(input.updatedAt);
  if (updatedAt === undefined) {
    return undefined;
  }
  return input.status === "running" ? Math.max(updatedAt, now) : updatedAt;
}

function deriveLatestRunningDurationMs(
  input: SessionTimingInput,
  activities: TimingActivity[],
  now: number,
): number | undefined {
  const latestRunningStartedAt = finiteNumber(input.latestRunningStartedAt);
  if (input.status === "running" && latestRunningStartedAt !== undefined) {
    return positiveDuration(now - latestRunningStartedAt);
  }

  const explicit = positiveDuration(input.latestRunningDurationMs);
  if (explicit !== undefined) {
    return explicit;
  }

  let currentStart: number | null = null;
  let latestDuration: number | undefined;
  for (const item of activities) {
    if (item.tone === "running") {
      currentStart ??= item.timestamp;
      continue;
    }
    if (currentStart !== null && item.tone && RUNNING_END_TONES.has(item.tone)) {
      latestDuration = positiveDuration(item.timestamp - currentStart);
      currentStart = null;
    }
  }

  if (currentStart !== null) {
    const fallbackEnd = sessionEndFor(input, now);
    latestDuration = positiveDuration((fallbackEnd ?? now) - currentStart);
  }

  return latestDuration;
}

export function computeSessionTiming(input: SessionTimingInput, now = Date.now()): SessionTiming {
  const activities = sortedActivities(input.activityItems);
  const startedAt = deriveStartedAt(input, activities);
  const end = sessionEndFor(input, now);
  const runningSessionDuration =
    input.status === "running" && startedAt !== undefined
      ? positiveDuration(now - startedAt)
      : undefined;
  const explicitSessionDuration = positiveDuration(input.sessionDurationMs);
  const sessionDurationMs =
    runningSessionDuration ??
    explicitSessionDuration ??
    (startedAt !== undefined && end !== undefined ? positiveDuration(end - startedAt) : undefined);
  const latestRunningDurationMs = deriveLatestRunningDurationMs(input, activities, now);

  return {
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(sessionDurationMs !== undefined ? { sessionDurationMs } : {}),
    ...(latestRunningDurationMs !== undefined ? { latestRunningDurationMs } : {}),
  };
}

export function formatSessionDuration(durationMs: number | undefined, locale: ResolvedLocale): string | undefined {
  const duration = positiveDuration(durationMs);
  if (duration === undefined) {
    return undefined;
  }
  const totalSeconds = Math.max(1, Math.round(duration / 1000));
  if (locale === "zh-CN") {
    if (totalSeconds < 60) return `${totalSeconds} 秒`;
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes} 分钟`;
    const totalHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (totalHours < 24) {
      return minutes > 0 ? `${totalHours} 小时 ${minutes} 分钟` : `${totalHours} 小时`;
    }
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
  }

  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}
