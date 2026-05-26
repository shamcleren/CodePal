export type SessionListPreferences = {
  projectOrder: string[];
  collapsedProjectKeys: string[];
  expandedProjectSessionKeys: string[];
};

export type AnalyticsPagePreferences = {
  range: "today" | "7d" | "30d" | "custom";
  customStart: string;
  customEnd: string;
  breakdownMode: "project" | "model" | "agent";
  granularity: "minute" | "hour" | "day";
  metric: "tokens" | "cost";
  projectFilter?: string;
  agentFilter?: string;
  modelFilter?: string;
};

const SESSION_LIST_STORAGE_KEY = "codepal.sessions.project-view-preferences.v1";
const ANALYTICS_PAGE_STORAGE_KEY = "codepal.analytics.local-preferences.v1";

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
  projectFilter: undefined,
  agentFilter: undefined,
  modelFilter: undefined,
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

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
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
    projectFilter: optionalString(record.projectFilter),
    agentFilter: optionalString(record.agentFilter),
    modelFilter: optionalString(record.modelFilter),
  };
}

export function writeAnalyticsPagePreferences(
  preferences: AnalyticsPagePreferences,
  storage: Storage | null | undefined = localStorageOrNull(),
): void {
  writeJson(storage, ANALYTICS_PAGE_STORAGE_KEY, preferences);
}
