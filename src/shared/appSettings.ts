import type { AppLocale } from "./i18nTypes";

export type UsageAgentId =
  | "claude"
  | "codex"
  | "cursor"
  | "codebuddy"
  | "qoder"
  | "qwen"
  | "factory";

export type UsageDisplaySettings = {
  showInStatusBar: boolean;
  hiddenAgents: UsageAgentId[];
  density: "compact" | "detailed";
};

export type CodeBuddyEndpointSettings = {
  enabled: boolean;
  label: string;
  loginUrl: string;
  quotaEndpoint: string;
  cookieNames: string[];
};

export type HistorySettings = {
  persistenceEnabled: boolean;
  retentionDays: number;
  maxStorageMb: number;
};

export type NotificationSettings = {
  enabled: boolean;
  soundEnabled: boolean;
  completed: boolean;
  waiting: boolean;
  error: boolean;
  resumed: boolean;
};

export type AppSettings = {
  version: 1;
  locale: AppLocale;
  display: UsageDisplaySettings;
  history: HistorySettings;
  notifications: NotificationSettings;
  codebuddy: {
    code: CodeBuddyEndpointSettings;
    enterprise: CodeBuddyEndpointSettings;
  };
};

export type AppSettingsPatch = {
  version?: 1;
  locale?: AppLocale;
  display?: Partial<UsageDisplaySettings>;
  history?: Partial<HistorySettings>;
  notifications?: Partial<NotificationSettings>;
  codebuddy?: {
    code?: Partial<CodeBuddyEndpointSettings>;
    enterprise?: Partial<CodeBuddyEndpointSettings>;
  };
};

export const DEFAULT_CODEBUDDY_AUTH_COOKIE_NAMES = [
  "RIO_TOKEN",
  "RIO_TOKEN_HTTPS",
  "P_RIO_TOKEN",
  "BK_TICKET",
  "tof_auth",
  "keycloak_session",
  "x_host_key_access",
  "x_host_key_access_https",
  "x-tofapi-host-key",
] as const;

export const defaultUsageDisplaySettings: UsageDisplaySettings = {
  showInStatusBar: true,
  hiddenAgents: [],
  density: "detailed",
};

export const defaultHistorySettings: HistorySettings = {
  persistenceEnabled: true,
  retentionDays: 2,
  maxStorageMb: 100,
};

export const defaultNotificationSettings: NotificationSettings = {
  enabled: true,
  soundEnabled: false,
  completed: true,
  waiting: true,
  error: true,
  resumed: true,
};

export const defaultAppSettings: AppSettings = {
  version: 1,
  locale: "system",
  display: defaultUsageDisplaySettings,
  history: defaultHistorySettings,
  notifications: { ...defaultNotificationSettings },
  codebuddy: {
    code: {
      enabled: true,
      label: "CodeBuddy Code",
      loginUrl: "https://tencent.sso.codebuddy.cn/profile/usage",
      quotaEndpoint: "https://tencent.sso.codebuddy.cn/billing/meter/get-enterprise-user-usage",
      cookieNames: [...DEFAULT_CODEBUDDY_AUTH_COOKIE_NAMES],
    },
    enterprise: {
      enabled: false,
      label: "CodeBuddy Enterprise",
      loginUrl: "",
      quotaEndpoint: "",
      cookieNames: [...DEFAULT_CODEBUDDY_AUTH_COOKIE_NAMES],
    },
  },
};

export function cloneAppSettings(settings: AppSettings): AppSettings {
  return {
    version: settings.version,
    locale: settings.locale,
    display: {
      ...settings.display,
      hiddenAgents: [...settings.display.hiddenAgents],
    },
    history: {
      ...settings.history,
    },
    notifications: {
      ...settings.notifications,
    },
    codebuddy: {
      code: {
        ...settings.codebuddy.code,
        cookieNames: [...settings.codebuddy.code.cookieNames],
      },
      enterprise: {
        ...settings.codebuddy.enterprise,
        cookieNames: [...settings.codebuddy.enterprise.cookieNames],
      },
    },
  };
}

function isUsageAgentId(value: unknown): value is UsageAgentId {
  return (
    value === "claude" ||
    value === "codex" ||
    value === "cursor" ||
    value === "codebuddy" ||
    value === "qoder" ||
    value === "qwen" ||
    value === "factory"
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeLocale(value: unknown): AppLocale {
  if (value === "en" || value === "zh-CN" || value === "system") {
    return value;
  }
  return defaultAppSettings.locale;
}

function normalizeHttpsUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function cloneCookieNames(defaults: readonly string[]): string[] {
  return [...defaults];
}

function normalizeCookieNames(value: unknown, defaults: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return cloneCookieNames(defaults);
  }
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : cloneCookieNames(defaults);
}

function normalizeUsageDisplaySettings(value: unknown): UsageDisplaySettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return {
      ...defaultUsageDisplaySettings,
      hiddenAgents: [...defaultUsageDisplaySettings.hiddenAgents],
    };
  }

  return {
    showInStatusBar:
      typeof candidate.showInStatusBar === "boolean"
        ? candidate.showInStatusBar
        : defaultUsageDisplaySettings.showInStatusBar,
    hiddenAgents: Array.isArray(candidate.hiddenAgents)
      ? candidate.hiddenAgents.filter(isUsageAgentId)
      : [...defaultUsageDisplaySettings.hiddenAgents],
    density:
      candidate.density === "compact" || candidate.density === "detailed"
        ? candidate.density
        : defaultUsageDisplaySettings.density,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeHistorySettings(value: unknown): HistorySettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return { ...defaultHistorySettings };
  }

  return {
    persistenceEnabled:
      typeof candidate.persistenceEnabled === "boolean"
        ? candidate.persistenceEnabled
        : defaultHistorySettings.persistenceEnabled,
    retentionDays: clampNumber(
      candidate.retentionDays,
      1,
      30,
      defaultHistorySettings.retentionDays,
    ),
    maxStorageMb: clampNumber(
      candidate.maxStorageMb,
      10,
      1024,
      defaultHistorySettings.maxStorageMb,
    ),
  };
}

function normalizeNotificationSettings(value: unknown): NotificationSettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return { ...defaultNotificationSettings };
  }
  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : defaultNotificationSettings.enabled,
    soundEnabled: typeof candidate.soundEnabled === "boolean" ? candidate.soundEnabled : defaultNotificationSettings.soundEnabled,
    completed: typeof candidate.completed === "boolean" ? candidate.completed : defaultNotificationSettings.completed,
    waiting: typeof candidate.waiting === "boolean" ? candidate.waiting : defaultNotificationSettings.waiting,
    error: typeof candidate.error === "boolean" ? candidate.error : defaultNotificationSettings.error,
    resumed: typeof candidate.resumed === "boolean" ? candidate.resumed : defaultNotificationSettings.resumed,
  };
}

export function normalizeCodeBuddyEndpointSettings(
  value: unknown,
  defaults: CodeBuddyEndpointSettings,
): CodeBuddyEndpointSettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return {
      ...defaults,
      cookieNames: [...defaults.cookieNames],
    };
  }

  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : defaults.enabled,
    label:
      typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label.trim()
        : defaults.label,
    loginUrl:
      "loginUrl" in candidate ? normalizeHttpsUrl(candidate.loginUrl) : defaults.loginUrl,
    quotaEndpoint:
      "quotaEndpoint" in candidate
        ? normalizeHttpsUrl(candidate.quotaEndpoint)
        : defaults.quotaEndpoint,
    cookieNames: normalizeCookieNames(candidate.cookieNames, defaults.cookieNames),
  };
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return cloneAppSettings(defaultAppSettings);
  }

  const display = normalizeUsageDisplaySettings(candidate.display);
  const history = normalizeHistorySettings(candidate.history);
  const notifications = normalizeNotificationSettings(candidate.notifications);
  const codebuddy = asRecord(candidate.codebuddy);

  return {
    version: 1,
    locale: normalizeLocale(candidate.locale),
    display,
    history,
    notifications,
    codebuddy: {
      code: normalizeCodeBuddyEndpointSettings(codebuddy?.code, defaultAppSettings.codebuddy.code),
      enterprise: normalizeCodeBuddyEndpointSettings(
        codebuddy?.enterprise,
        defaultAppSettings.codebuddy.enterprise,
      ),
    },
  };
}

export function mergeAppSettings(
  current: AppSettings,
  incoming: AppSettingsPatch,
): AppSettings {
  return normalizeAppSettings({
    ...current,
    ...incoming,
    display: {
      ...current.display,
      ...(incoming.display ?? {}),
    },
    history: {
      ...current.history,
      ...(incoming.history ?? {}),
    },
    notifications: {
      ...current.notifications,
      ...(incoming.notifications ?? {}),
    },
    codebuddy: {
      ...current.codebuddy,
      ...(incoming.codebuddy ?? {}),
      code: {
        ...current.codebuddy.code,
        ...(incoming.codebuddy?.code ?? {}),
      },
      enterprise: {
        ...current.codebuddy.enterprise,
        ...(incoming.codebuddy?.enterprise ?? {}),
      },
    },
  });
}
