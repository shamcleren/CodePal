import type { AppLocale } from "./i18nTypes";

export type UsageAgentId =
  | "claude"
  | "codex"
  | "cursor"
  | "codebuddy"
  | "qoder"
  | "qwen"
  | "factory";

export const APP_THEME_IDS = ["graphite-ops", "paper-ops"] as const;
export const APP_THEME_SETTINGS = ["system", ...APP_THEME_IDS] as const;

export type AppThemeId = (typeof APP_THEME_IDS)[number];
export type AppThemeSetting = (typeof APP_THEME_SETTINGS)[number];

export type UsageDisplaySettings = {
  showInStatusBar: boolean;
  hiddenAgents: UsageAgentId[];
  density: "compact" | "detailed";
  theme: AppThemeSetting;
};

export type CodeBuddyEndpointSettings = {
  enabled: boolean;
  label: string;
  loginUrl: string;
  quotaEndpoint: string;
  cookieNames: string[];
};

export const HISTORY_RETENTION_PRESETS = ["30d", "90d", "180d", "365d", "forever"] as const;

export type HistoryRetentionPreset = (typeof HISTORY_RETENTION_PRESETS)[number];

export type HistorySettings = {
  persistenceEnabled: boolean;
  detailRetention: HistoryRetentionPreset;
  analyticsRetention: HistoryRetentionPreset;
};

export type NotificationSettings = {
  enabled: boolean;
  soundEnabled: boolean;
  completed: boolean;
  waiting: boolean;
  error: boolean;
  resumed: boolean;
};

export type ReportSettings = {
  /** Gate: enable LLM-powered report generation (spends model quota) */
  llmEnabled: boolean;
  /** Default model for report generation (empty = cheapest configured) */
  llmDefaultModel: string;
};

export type PricingSettings = {
  remoteUrl: string;
};

export type ProviderGatewayAuthScheme = "bearer";

export type ProviderGatewayType = "anthropic-compatible" | "openai-chat-compatible";

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
  reports: ReportSettings;
  pricing: PricingSettings;
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
  reports?: Partial<ReportSettings>;
  pricing?: Partial<PricingSettings>;
  providerGateway?: Partial<ProviderGatewaySettings>;
  codebuddy?: {
    code?: Partial<CodeBuddyEndpointSettings>;
    enterprise?: Partial<CodeBuddyEndpointSettings>;
  };
};

const CLAUDE_HAIKU_ROUTE_ID = "claude-haiku-4-5";
const MIMO_DEFAULT_UPSTREAM_MODEL = "mimo-v2.5";
const MIMO_LEGACY_HAIKU_UPSTREAM_MODEL = "mimo-v2";
export const DEFAULT_MODEL_PRICING_REMOTE_URL =
  "https://shamcleren.github.io/CodePal/model-pricing.json";

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
  theme: "graphite-ops",
};

export const defaultHistorySettings: HistorySettings = {
  persistenceEnabled: true,
  detailRetention: "30d",
  analyticsRetention: "forever",
};

export const defaultNotificationSettings: NotificationSettings = {
  enabled: true,
  soundEnabled: false,
  completed: true,
  waiting: true,
  error: true,
  resumed: true,
};

export const defaultReportSettings: ReportSettings = {
  llmEnabled: false,
  llmDefaultModel: "",
};

export const defaultPricingSettings: PricingSettings = {
  remoteUrl: DEFAULT_MODEL_PRICING_REMOTE_URL,
};

export const defaultProviderGatewaySettings: ProviderGatewaySettings = {
  enabled: false,
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
        default: MIMO_DEFAULT_UPSTREAM_MODEL,
        sonnet: MIMO_DEFAULT_UPSTREAM_MODEL,
        opus: "mimo-v2.5-pro",
        "claude-sonnet-4-6": MIMO_DEFAULT_UPSTREAM_MODEL,
        "claude-opus-4-7": "mimo-v2.5-pro",
        [CLAUDE_HAIKU_ROUTE_ID]: MIMO_DEFAULT_UPSTREAM_MODEL,
      },
    },
    deepseek: {
      type: "anthropic-compatible",
      displayName: "DeepSeek",
      baseUrl: "https://api.deepseek.com/anthropic",
      authScheme: "bearer",
      tokenRef: "deepseek.api_key",
      envFallback: "DEEPSEEK_API_KEY",
      headers: {},
      modelMappings: {
        default: "deepseek-v4-flash",
        sonnet: "deepseek-v4-flash",
        opus: "deepseek-v4-pro",
        haiku: "deepseek-v4-flash",
        "claude-sonnet-4-6": "deepseek-v4-flash",
        "claude-opus-4-7": "deepseek-v4-pro",
        [CLAUDE_HAIKU_ROUTE_ID]: "deepseek-v4-flash",
      },
    },
    minimax: {
      type: "anthropic-compatible",
      displayName: "MiniMax",
      baseUrl: "https://api.minimax.io/anthropic",
      authScheme: "bearer",
      tokenRef: "minimax.api_key",
      envFallback: "MINIMAX_API_KEY",
      headers: {},
      modelMappings: {
        default: "MiniMax-M3",
        sonnet: "MiniMax-M3",
        opus: "MiniMax-M3",
        haiku: "MiniMax-M2.7-highspeed",
        "claude-sonnet-4-6": "MiniMax-M3",
        "claude-opus-4-7": "MiniMax-M3",
        [CLAUDE_HAIKU_ROUTE_ID]: "MiniMax-M2.7-highspeed",
      },
    },
    qwen: {
      type: "openai-chat-compatible",
      displayName: "Qwen DashScope",
      baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      authScheme: "bearer",
      tokenRef: "qwen.dashscope.api_key",
      envFallback: "DASHSCOPE_API_KEY",
      headers: {},
      modelMappings: {
        default: "qwen3.7-plus",
        sonnet: "qwen3.7-plus",
        opus: "qwen3.7-plus",
        haiku: "qwen-plus",
        "claude-sonnet-4-6": "qwen3.7-plus",
        "claude-opus-4-7": "qwen3.7-plus",
        [CLAUDE_HAIKU_ROUTE_ID]: "qwen-plus",
      },
    },
    kimi: {
      type: "openai-chat-compatible",
      displayName: "Kimi",
      baseUrl: "https://api.moonshot.ai/v1",
      authScheme: "bearer",
      tokenRef: "kimi.moonshot.api_key",
      envFallback: "MOONSHOT_API_KEY",
      headers: {},
      modelMappings: {
        default: "kimi-k2.6",
        sonnet: "kimi-k2.6",
        opus: "kimi-k2.6",
        haiku: "moonshot-v1-32k",
        "claude-sonnet-4-6": "kimi-k2.6",
        "claude-opus-4-7": "kimi-k2.6",
        [CLAUDE_HAIKU_ROUTE_ID]: "moonshot-v1-32k",
      },
    },
    zhipu: {
      type: "openai-chat-compatible",
      displayName: "Zhipu GLM",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      authScheme: "bearer",
      tokenRef: "zhipu.api_key",
      envFallback: "ZHIPUAI_API_KEY",
      headers: {},
      modelMappings: {
        default: "glm-5.1",
        sonnet: "glm-5.1",
        opus: "glm-5.1",
        haiku: "glm-4-flash",
        "claude-sonnet-4-6": "glm-5.1",
        "claude-opus-4-7": "glm-5.1",
        [CLAUDE_HAIKU_ROUTE_ID]: "glm-4-flash",
      },
    },
    siliconflow: {
      type: "openai-chat-compatible",
      displayName: "SiliconFlow",
      baseUrl: "https://api.siliconflow.cn/v1",
      authScheme: "bearer",
      tokenRef: "siliconflow.api_key",
      envFallback: "SILICONFLOW_API_KEY",
      headers: {},
      modelMappings: {
        default: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        sonnet: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        opus: "deepseek-ai/DeepSeek-V3.2-Exp",
        haiku: "Qwen/Qwen3-30B-A3B-Instruct",
        "claude-sonnet-4-6": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "claude-opus-4-7": "deepseek-ai/DeepSeek-V3.2-Exp",
        [CLAUDE_HAIKU_ROUTE_ID]: "Qwen/Qwen3-30B-A3B-Instruct",
      },
    },
    openrouter: {
      type: "openai-chat-compatible",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      authScheme: "bearer",
      tokenRef: "openrouter.api_key",
      envFallback: "OPENROUTER_API_KEY",
      headers: {
        "HTTP-Referer": "https://github.com/shamcleren/CodePal",
        "X-OpenRouter-Title": "CodePal",
      },
      modelMappings: {
        default: "deepseek/deepseek-v4-flash",
        sonnet: "deepseek/deepseek-v4-flash",
        opus: "deepseek/deepseek-v4-pro",
        haiku: "qwen/qwen-plus",
        "claude-sonnet-4-6": "deepseek/deepseek-v4-flash",
        "claude-opus-4-7": "deepseek/deepseek-v4-pro",
        [CLAUDE_HAIKU_ROUTE_ID]: "qwen/qwen-plus",
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
  reports: { ...defaultReportSettings },
  pricing: { ...defaultPricingSettings },
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
    reports: {
      ...settings.reports,
    },
    pricing: {
      ...settings.pricing,
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

function isAppThemeId(value: unknown): value is AppThemeId {
  return APP_THEME_IDS.includes(value as AppThemeId);
}

function isAppThemeSetting(value: unknown): value is AppThemeSetting {
  return value === "system" || isAppThemeId(value);
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
    theme: isAppThemeSetting(candidate.theme)
      ? candidate.theme
      : defaultUsageDisplaySettings.theme,
  };
}

function isHistoryRetentionPreset(value: unknown): value is HistoryRetentionPreset {
  return HISTORY_RETENTION_PRESETS.includes(value as HistoryRetentionPreset);
}

function legacyDaysToHistoryRetentionPreset(
  value: unknown,
  fallback: HistoryRetentionPreset,
): HistoryRetentionPreset {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const days = Math.max(1, Math.trunc(value));
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  if (days <= 180) return "180d";
  if (days <= 365) return "365d";
  return "forever";
}

function normalizeHistorySettings(value: unknown): HistorySettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return { ...defaultHistorySettings };
  }

  const detailRetention = isHistoryRetentionPreset(candidate.detailRetention)
    ? candidate.detailRetention
    : legacyDaysToHistoryRetentionPreset(
        candidate.retentionDays,
        defaultHistorySettings.detailRetention,
      );
  const analyticsRetention = isHistoryRetentionPreset(candidate.analyticsRetention)
    ? candidate.analyticsRetention
    : defaultHistorySettings.analyticsRetention;

  return {
    persistenceEnabled:
      typeof candidate.persistenceEnabled === "boolean"
        ? candidate.persistenceEnabled
        : defaultHistorySettings.persistenceEnabled,
    detailRetention,
    analyticsRetention,
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

function normalizeReportSettings(value: unknown): ReportSettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return { ...defaultReportSettings };
  }
  return {
    llmEnabled:
      typeof candidate.llmEnabled === "boolean"
        ? candidate.llmEnabled
        : defaultReportSettings.llmEnabled,
    llmDefaultModel:
      typeof candidate.llmDefaultModel === "string"
        ? candidate.llmDefaultModel.trim()
        : defaultReportSettings.llmDefaultModel,
  };
}

function normalizePricingSettings(value: unknown): PricingSettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return { ...defaultPricingSettings };
  }
  return {
    remoteUrl: normalizeHttpUrl(candidate.remoteUrl, defaultPricingSettings.remoteUrl),
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

function isProviderGatewayType(value: unknown): value is ProviderGatewayType {
  return value === "anthropic-compatible" || value === "openai-chat-compatible";
}

function migrateMimoModelMappings(
  mappings: Record<string, string>,
  defaults: Record<string, string>,
): Record<string, string> {
  const next = { ...mappings };
  const haikuFallback = defaults[CLAUDE_HAIKU_ROUTE_ID] ?? MIMO_DEFAULT_UPSTREAM_MODEL;
  for (const key of [CLAUDE_HAIKU_ROUTE_ID, "haiku"]) {
    if (next[key] === MIMO_LEGACY_HAIKU_UPSTREAM_MODEL) {
      next[key] = haikuFallback;
    }
  }
  return next;
}

function normalizeProviderConfig(
  value: unknown,
  defaults: ProviderGatewayConfig,
  providerId?: string,
): ProviderGatewayConfig {
  const candidate = asRecord(value);
  if (!candidate) {
    return {
      ...defaults,
      headers: { ...defaults.headers },
      modelMappings: { ...defaults.modelMappings },
    };
  }
  const modelMappings = normalizeModelMappings(candidate.modelMappings, defaults.modelMappings);
  return {
    type: isProviderGatewayType(candidate.type) ? candidate.type : defaults.type,
    displayName: normalizeProviderString(candidate.displayName, defaults.displayName),
    baseUrl: normalizeHttpUrl(candidate.baseUrl, defaults.baseUrl),
    authScheme: candidate.authScheme === "bearer" ? candidate.authScheme : defaults.authScheme,
    tokenRef: normalizeProviderString(candidate.tokenRef, defaults.tokenRef),
    envFallback: normalizeProviderString(candidate.envFallback, defaults.envFallback),
    headers: normalizeHeaders(candidate.headers),
    modelMappings:
      providerId === "mimo"
        ? migrateMimoModelMappings(modelMappings, defaults.modelMappings)
        : modelMappings,
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
  const fallbackDefaultProvider = defaultProviderGatewaySettings.providers.mimo;
  const rawProviders = asRecord(candidate.providers);
  const providers = Object.fromEntries(
    Object.entries(defaultProviderGatewaySettings.providers).map(([id, provider]) => [
      id,
      {
        ...provider,
        headers: { ...provider.headers },
        modelMappings: { ...provider.modelMappings },
      },
    ]),
  );
  if (rawProviders) {
    for (const [id, provider] of Object.entries(rawProviders)) {
      const providerId = id.trim();
      if (!providerId) continue;
      providers[providerId] = normalizeProviderConfig(
        provider,
        defaultProviderGatewaySettings.providers[providerId] ?? fallbackDefaultProvider,
        providerId,
      );
    }
  }
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
  const reports = normalizeReportSettings(candidate.reports);
  const pricing = normalizePricingSettings(candidate.pricing);
  const providerGateway = normalizeProviderGatewaySettings(candidate.providerGateway);
  const codebuddy = asRecord(candidate.codebuddy);

  return {
    version: 1,
    locale: normalizeLocale(candidate.locale),
    display,
    history,
    notifications,
    reports,
    pricing,
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
    reports: {
      ...current.reports,
      ...(incoming.reports ?? {}),
    },
    pricing: {
      ...current.pricing,
      ...(incoming.pricing ?? {}),
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
