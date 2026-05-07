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

export type ProviderGatewayAuthScheme = "bearer";

export type ProviderGatewayType = "anthropic-compatible";

export type ProviderGatewayConfig = {
  type: ProviderGatewayType;
  displayName: string;
  baseUrl: string;
  authScheme: ProviderGatewayAuthScheme;
  tokenRef: string;
  envFallback: string;
  headers: Record<string, string>;
  modelMappings: Record<string, string>;
};

export type ProviderGatewaySettings = {
  enabled: boolean;
  host: string;
  port: number;
  activeProvider: string;
  providers: Record<string, ProviderGatewayConfig>;
};

export type AppSettings = {
  version: 1;
  locale: AppLocale;
  display: UsageDisplaySettings;
  history: HistorySettings;
  notifications: NotificationSettings;
  providerGateway: ProviderGatewaySettings;
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
  providerGateway?: Partial<ProviderGatewaySettings>;
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

export const defaultProviderGatewaySettings: ProviderGatewaySettings = {
  enabled: true,
  host: "127.0.0.1",
  port: 15721,
  activeProvider: "mimo",
  providers: {
    mimo: {
      type: "anthropic-compatible",
      displayName: "MiMo Gateway",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
      authScheme: "bearer",
      tokenRef: "mimo.gateway.token",
      envFallback: "MIMO_GATEWAY_TOKEN",
      headers: {},
      modelMappings: {
        "anthropic/MiMo-V2.5-Pro": "mimo-v2.5-pro",
        "anthropic/MiMo-V2.5": "mimo-v2.5",
        "anthropic/MiMo-V2-Pro": "mimo-v2-pro",
        "anthropic/MiMo-V2-Omni": "mimo-v2-omni",
      },
    },
  },
};

export const defaultAppSettings: AppSettings = {
  version: 1,
  locale: "system",
  display: defaultUsageDisplaySettings,
  history: defaultHistorySettings,
  notifications: { ...defaultNotificationSettings },
  providerGateway: defaultProviderGatewaySettings,
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
    providerGateway: {
      ...settings.providerGateway,
      providers: Object.fromEntries(
        Object.entries(settings.providerGateway.providers).map(([id, provider]) => [
          id,
          {
            ...provider,
            headers: { ...provider.headers },
            modelMappings: { ...provider.modelMappings },
          },
        ]),
      ),
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

function normalizeHttpUrl(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return fallback;
    }
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
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

function normalizeGatewayHost(value: unknown): string {
  return value === "127.0.0.1" || value === "localhost" ? value : defaultProviderGatewaySettings.host;
}

function normalizeGatewayPort(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultProviderGatewaySettings.port;
  }
  const port = Math.trunc(value);
  return port >= 1 && port <= 65535 ? port : defaultProviderGatewaySettings.port;
}

function normalizeProviderString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeHeaders(value: unknown): Record<string, string> {
  const candidate = asRecord(value);
  if (!candidate) {
    return {};
  }
  const sensitiveHeaders = new Set(["authorization", "x-api-key", "cookie"]);
  const entries = Object.entries(candidate)
    .filter((entry): entry is [string, string] => {
      const [key, item] = entry;
      const normalizedKey = key.trim().toLowerCase();
      return (
        Boolean(normalizedKey) &&
        !sensitiveHeaders.has(normalizedKey) &&
        typeof item === "string" &&
        Boolean(item.trim())
      );
    })
    .map(([key, item]) => [key.trim(), item.trim()] as const);
  return Object.fromEntries(entries);
}

function normalizeModelMappings(
  value: unknown,
  defaults: Record<string, string>,
): Record<string, string> {
  const candidate = asRecord(value);
  if (!candidate) {
    return { ...defaults };
  }
  const entries = Object.entries(candidate)
    .filter((entry): entry is [string, string] => {
      const [key, item] = entry;
      return Boolean(key.trim()) && typeof item === "string" && Boolean(item.trim());
    })
    .map(([key, item]) => [key.trim(), item.trim()] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : { ...defaults };
}

function normalizeProviderConfig(
  value: unknown,
  defaults: ProviderGatewayConfig,
): ProviderGatewayConfig {
  const candidate = asRecord(value);
  if (!candidate) {
    return {
      ...defaults,
      headers: { ...defaults.headers },
      modelMappings: { ...defaults.modelMappings },
    };
  }
  return {
    type:
      candidate.type === "anthropic-compatible"
        ? candidate.type
        : defaults.type,
    displayName: normalizeProviderString(candidate.displayName, defaults.displayName),
    baseUrl: normalizeHttpUrl(candidate.baseUrl, defaults.baseUrl),
    authScheme: candidate.authScheme === "bearer" ? candidate.authScheme : defaults.authScheme,
    tokenRef: normalizeProviderString(candidate.tokenRef, defaults.tokenRef),
    envFallback: normalizeProviderString(candidate.envFallback, defaults.envFallback),
    headers: normalizeHeaders(candidate.headers),
    modelMappings: normalizeModelMappings(candidate.modelMappings, defaults.modelMappings),
  };
}

function normalizeProviderGatewaySettings(value: unknown): ProviderGatewaySettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return {
      ...defaultProviderGatewaySettings,
      providers: Object.fromEntries(
        Object.entries(defaultProviderGatewaySettings.providers).map(([id, provider]) => [
          id,
          {
            ...provider,
            headers: { ...provider.headers },
            modelMappings: { ...provider.modelMappings },
          },
        ]),
      ),
    };
  }
  const defaultProvider = defaultProviderGatewaySettings.providers.mimo;
  const rawProviders = asRecord(candidate.providers);
  const providerEntries = rawProviders
    ? Object.entries(rawProviders)
        .filter(([id]) => Boolean(id.trim()))
        .map(([id, provider]) => [
          id.trim(),
          normalizeProviderConfig(provider, defaultProvider),
        ] as const)
    : [];
  const providers =
    providerEntries.length > 0
      ? Object.fromEntries(providerEntries)
      : {
          mimo: {
            ...defaultProvider,
            headers: { ...defaultProvider.headers },
            modelMappings: { ...defaultProvider.modelMappings },
          },
        };
  const requestedActiveProvider = normalizeProviderString(
    candidate.activeProvider,
    defaultProviderGatewaySettings.activeProvider,
  );
  const activeProvider =
    requestedActiveProvider in providers ? requestedActiveProvider : Object.keys(providers)[0];
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : defaultProviderGatewaySettings.enabled,
    host: normalizeGatewayHost(candidate.host),
    port: normalizeGatewayPort(candidate.port),
    activeProvider,
    providers,
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
  const providerGateway = normalizeProviderGatewaySettings(candidate.providerGateway);
  const codebuddy = asRecord(candidate.codebuddy);

  return {
    version: 1,
    locale: normalizeLocale(candidate.locale),
    display,
    history,
    notifications,
    providerGateway,
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
    providerGateway: {
      ...current.providerGateway,
      ...(incoming.providerGateway ?? {}),
      providers: {
        ...current.providerGateway.providers,
        ...(incoming.providerGateway?.providers ?? {}),
      },
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
