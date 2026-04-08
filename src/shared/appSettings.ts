export type UsageAgentId = "claude" | "codex" | "cursor" | "codebuddy";

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

export type AppSettings = {
  version: 1;
  display: UsageDisplaySettings;
  codebuddy: {
    code: CodeBuddyEndpointSettings;
    enterprise: CodeBuddyEndpointSettings;
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

export const defaultAppSettings: AppSettings = {
  version: 1,
  display: defaultUsageDisplaySettings,
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

function isUsageAgentId(value: unknown): value is UsageAgentId {
  return value === "claude" || value === "codex" || value === "cursor" || value === "codebuddy";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
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

function normalizeCookieNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_CODEBUDDY_AUTH_COOKIE_NAMES];
  }
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_CODEBUDDY_AUTH_COOKIE_NAMES];
}

function normalizeUsageDisplaySettings(value: unknown): UsageDisplaySettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return defaultUsageDisplaySettings;
  }

  return {
    showInStatusBar:
      typeof candidate.showInStatusBar === "boolean"
        ? candidate.showInStatusBar
        : defaultUsageDisplaySettings.showInStatusBar,
    hiddenAgents: Array.isArray(candidate.hiddenAgents)
      ? candidate.hiddenAgents.filter(isUsageAgentId)
      : defaultUsageDisplaySettings.hiddenAgents,
    density:
      candidate.density === "compact" || candidate.density === "detailed"
        ? candidate.density
        : defaultUsageDisplaySettings.density,
  };
}

function normalizeCodeBuddyEndpointSettings(
  value: unknown,
  defaults: CodeBuddyEndpointSettings,
): CodeBuddyEndpointSettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return defaults;
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
    cookieNames: normalizeCookieNames(candidate.cookieNames),
  };
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const candidate = asRecord(value);
  if (!candidate) {
    return defaultAppSettings;
  }

  const display = normalizeUsageDisplaySettings(candidate.display);
  const codebuddy = asRecord(candidate.codebuddy);

  return {
    version: 1,
    display,
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
  incoming: Partial<AppSettings>,
): AppSettings {
  return normalizeAppSettings({
    ...current,
    ...incoming,
    display: {
      ...current.display,
      ...(incoming.display ?? {}),
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
