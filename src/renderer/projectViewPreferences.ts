export type SessionListPreferences = {
  projectOrder: string[];
  collapsedProjectKeys: string[];
  expandedProjectSessionKeys: string[];
};

export type AnalyticsPricingSortField = "model" | "input" | "output" | "cacheRead" | "cacheWrite";
export type AnalyticsPricingSortDirection = "asc" | "desc";

export type AnalyticsPagePreferences = {
  range: "today" | "7d" | "30d" | "custom";
  customStart: string;
  customEnd: string;
  breakdownMode: "project" | "model" | "agent";
  granularity: "minute" | "hour" | "day";
  metric: "tokens" | "cost";
  trendGroupMode: "project" | "agent" | "model" | "tokenType";
  projectFilter?: string;
  agentFilter?: string;
  modelFilter?: string;
  pricingVendorFilters: string[];
  pricingSortField: AnalyticsPricingSortField;
  pricingSortDirection: AnalyticsPricingSortDirection;
};

export type WorkReviewRangeDays = 7 | 14 | 30;

export type WorkReviewPagePreferences = {
  rangeDays: WorkReviewRangeDays;
};

const SESSION_LIST_STORAGE_KEY = "codepal.sessions.project-view-preferences.v1";
const ANALYTICS_PAGE_STORAGE_KEY = "codepal.analytics.local-preferences.v1";
const WORK_REVIEW_PAGE_STORAGE_KEY = "codepal.work-review.local-preferences.v1";

const EMPTY_SESSION_LIST_PREFERENCES: SessionListPreferences = {
  projectOrder: [],
  collapsedProjectKeys: [],
  expandedProjectSessionKeys: [],
};

const DEFAULT_ANALYTICS_PAGE_PREFERENCES: AnalyticsPagePreferences = {
  range: "7d",
  customStart: "",
  customEnd: "",
  breakdownMode: "project",
  granularity: "hour",
  metric: "tokens",
  trendGroupMode: "project",
  projectFilter: undefined,
  agentFilter: undefined,
  modelFilter: undefined,
  pricingVendorFilters: [],
  pricingSortField: "model",
  pricingSortDirection: "asc",
};

const DEFAULT_WORK_REVIEW_PAGE_PREFERENCES: WorkReviewPagePreferences = {
  rangeDays: 14,
};

function localStorageOrNull(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function readJson(storage: Storage | null | undefined, key: string): unknown {
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | null | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Renderer preferences are best-effort; private-mode or quota failures
    // should not break the monitoring surface.
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : [];
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value)
    ? value as T
    : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readSessionListPreferences(
  storage: Storage | null | undefined = localStorageOrNull(),
): SessionListPreferences {
  const raw = readJson(storage, SESSION_LIST_STORAGE_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_SESSION_LIST_PREFERENCES };
  }
  const record = raw as Record<string, unknown>;
  return {
    projectOrder: stringArray(record.projectOrder),
    collapsedProjectKeys: stringArray(record.collapsedProjectKeys),
    expandedProjectSessionKeys: stringArray(record.expandedProjectSessionKeys),
  };
}

export function writeSessionListPreferences(
  preferences: SessionListPreferences,
  storage: Storage | null | undefined = localStorageOrNull(),
): void {
  writeJson(storage, SESSION_LIST_STORAGE_KEY, preferences);
}

export function readAnalyticsPagePreferences(
  storage: Storage | null | undefined = localStorageOrNull(),
): AnalyticsPagePreferences {
  const raw = readJson(storage, ANALYTICS_PAGE_STORAGE_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_ANALYTICS_PAGE_PREFERENCES };
  }
  const record = raw as Record<string, unknown>;
  return {
    range: oneOf(record.range, ["today", "7d", "30d", "custom"] as const, "7d"),
    customStart: typeof record.customStart === "string" ? record.customStart : "",
    customEnd: typeof record.customEnd === "string" ? record.customEnd : "",
    breakdownMode: oneOf(record.breakdownMode, ["project", "model", "agent"] as const, "project"),
    granularity: oneOf(record.granularity, ["minute", "hour", "day"] as const, "hour"),
    metric: oneOf(record.metric, ["tokens", "cost"] as const, "tokens"),
    trendGroupMode: oneOf(record.trendGroupMode, ["project", "agent", "model", "tokenType"] as const, "project"),
    projectFilter: optionalString(record.projectFilter),
    agentFilter: optionalString(record.agentFilter),
    modelFilter: optionalString(record.modelFilter),
    pricingVendorFilters: stringArray(record.pricingVendorFilters).length > 0
      ? stringArray(record.pricingVendorFilters)
      : stringArray(record.pricingModelFilters),
    pricingSortField: oneOf(record.pricingSortField, ["model", "input", "output", "cacheRead", "cacheWrite"] as const, "model"),
    pricingSortDirection: oneOf(record.pricingSortDirection, ["asc", "desc"] as const, "asc"),
  };
}

export function writeAnalyticsPagePreferences(
  preferences: AnalyticsPagePreferences,
  storage: Storage | null | undefined = localStorageOrNull(),
): void {
  writeJson(storage, ANALYTICS_PAGE_STORAGE_KEY, preferences);
}

export function readWorkReviewPagePreferences(
  storage: Storage | null | undefined = localStorageOrNull(),
): WorkReviewPagePreferences {
  const raw = readJson(storage, WORK_REVIEW_PAGE_STORAGE_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_WORK_REVIEW_PAGE_PREFERENCES };
  }
  const record = raw as Record<string, unknown>;
  return {
    rangeDays: oneOf(record.rangeDays, [7, 14, 30] as const, 14),
  };
}

export function writeWorkReviewPagePreferences(
  preferences: WorkReviewPagePreferences,
  storage: Storage | null | undefined = localStorageOrNull(),
): void {
  writeJson(storage, WORK_REVIEW_PAGE_STORAGE_KEY, preferences);
}
