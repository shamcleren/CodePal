import { BrowserWindow, session as electronSession, type Cookies, type Session } from "electron";
import type { CodeBuddyEndpointSettings } from "../../shared/appSettings";
import type {
  CodeBuddyQuotaConnectResult,
  CodeBuddyQuotaDiagnostics,
} from "../../shared/codebuddyQuotaTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";

const CODEBUDDY_INTERNAL_AUTH_PARTITION = "persist:codepal-codebuddy-internal-quota";

export type CodeBuddyInternalQuotaCookie = {
  name: string;
  value: string;
};

type FetchLike = typeof fetch;
type SessionWithFetch = Session & {
  fetch?: FetchLike;
};

type CodeBuddyInternalQuotaServiceOptions = {
  config: CodeBuddyEndpointSettings;
  fetchImpl?: FetchLike;
  now?: () => number;
  createWindow?: () => BrowserWindow;
  session?: Session;
  onUsageSnapshot?: (snapshot: UsageSnapshot) => void;
};

async function clearAuthSessionData(session: Session) {
  await session.clearStorageData();
  await session.clearCache();
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function hasAuthCookie(
  cookies: CodeBuddyInternalQuotaCookie[],
  cookieNames: string[],
): boolean {
  const normalizedNames = cookieNames.map((name) => name.toLowerCase());
  return cookies.some((cookie) => normalizedNames.includes(cookie.name.toLowerCase()));
}

async function readCookies(cookieStore: Cookies): Promise<CodeBuddyInternalQuotaCookie[]> {
  const cookies = await cookieStore.get({});
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
  }));
}

function cookieHeader(cookies: CodeBuddyInternalQuotaCookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function isAuthExpiredStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function looksLikeHtml(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function isIgnorableNavigationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("ERR_ABORTED") || error.message.includes("(-3)");
}

function defaultCreateWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 1080,
    height: 760,
    autoHideMenuBar: true,
    title: "登录 CodeBuddy Enterprise 用量",
    webPreferences: {
      partition: CODEBUDDY_INTERNAL_AUTH_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

async function waitForCodeBuddyInternalLogin(
  cookieStore: Cookies,
  window: BrowserWindow,
  timeoutMs = 5 * 60 * 1000,
): Promise<CodeBuddyInternalQuotaCookie[]> {
  return await new Promise<CodeBuddyInternalQuotaCookie[]>((resolve) => {
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(await readCookies(cookieStore));
    };

    const timer = setTimeout(() => {
      void finish();
    }, timeoutMs);

    window.on("closed", () => {
      void finish();
    });
  });
}

async function requestQuotaWithFallback(
  session: Session,
  endpoint: string,
  loginUrl: string,
  cookies: CodeBuddyInternalQuotaCookie[],
  fetchImpl: FetchLike,
): Promise<Response> {
  const requestInit = {
    method: "GET",
    headers: {
      accept: "*/*",
      cookie: cookieHeader(cookies),
    },
  } satisfies RequestInit;

  const sessionFetch = (session as SessionWithFetch).fetch;
  if (typeof sessionFetch === "function") {
    return sessionFetch.call(session, endpoint, requestInit).catch(async (error: unknown) => {
      if (error instanceof Error && error.message.includes("ERR_BLOCKED_BY_CLIENT")) {
        return await fetchImpl(endpoint, requestInit);
      }
      throw error;
    });
  }

  return fetchImpl(endpoint, requestInit);
}

function notConfiguredDiagnostics(
  config: CodeBuddyEndpointSettings,
  lastSyncAt?: number,
): CodeBuddyQuotaDiagnostics {
  const missingFields: string[] = [];
  if (!config.loginUrl) {
    missingFields.push("登录地址");
  }
  if (!config.quotaEndpoint) {
    missingFields.push("额度地址");
  }
  return {
    kind: "internal",
    label: config.label,
    state: "not_connected",
    message:
      missingFields.length > 0
        ? `请先在设置中配置 ${config.label} 的${missingFields.join("和")}`
        : `${config.label} 尚未配置`,
    messageKey:
      missingFields.length > 0
        ? "codebuddy.message.not_configured"
        : "codebuddy.message.not_configured_generic",
    messageParams:
      missingFields.length > 0
        ? { label: config.label, fields: missingFields.join("和") }
        : { label: config.label },
    endpoint: config.quotaEndpoint,
    loginUrl: config.loginUrl,
    ...(lastSyncAt ? { lastSyncAt } : {}),
  };
}

function loginNotEstablishedDiagnostics(
  config: CodeBuddyEndpointSettings,
  lastSyncAt?: number,
): CodeBuddyQuotaDiagnostics {
  return {
    kind: "internal",
    label: config.label,
    state: "error",
    message: `${config.label} 未检测到登录态，请确认登录已完成，或检查 settings.yaml 中的 loginUrl 是否正确`,
    messageKey: "codebuddy.message.login_not_established",
    messageParams: { label: config.label },
    endpoint: config.quotaEndpoint,
    loginUrl: config.loginUrl,
    ...(lastSyncAt ? { lastSyncAt } : {}),
  };
}

export function buildCodeBuddyInternalQuotaDiagnostics(input: {
  config: CodeBuddyEndpointSettings;
  cookies: CodeBuddyInternalQuotaCookie[];
  lastSyncAt?: number;
}): CodeBuddyQuotaDiagnostics {
  if (!input.config.enabled || !input.config.loginUrl || !input.config.quotaEndpoint) {
    return notConfiguredDiagnostics(input.config, input.lastSyncAt);
  }

  if (hasAuthCookie(input.cookies, input.config.cookieNames)) {
    return {
      kind: "internal",
      label: input.config.label,
      state: "connected",
      message: `已连接 ${input.config.label} 用量`,
      messageKey: "codebuddy.message.connected",
      messageParams: { label: input.config.label },
      endpoint: input.config.quotaEndpoint,
      loginUrl: input.config.loginUrl,
      ...(input.lastSyncAt ? { lastSyncAt: input.lastSyncAt } : {}),
    };
  }

  return {
    kind: "internal",
    label: input.config.label,
    state: "not_connected",
    message: `未连接 ${input.config.label} 用量，请在 CodePal 弹出的登录窗口内完成登录`,
    messageKey: "codebuddy.message.not_connected",
    messageParams: { label: input.config.label },
    endpoint: input.config.quotaEndpoint,
    loginUrl: input.config.loginUrl,
    ...(input.lastSyncAt ? { lastSyncAt: input.lastSyncAt } : {}),
  };
}

export function buildCodeBuddyInternalQuotaSnapshot(
  payload: Record<string, unknown>,
  updatedAt: number,
  label = "CodeBuddy Enterprise",
): UsageSnapshot | null {
  if (payload.success !== true) {
    return null;
  }

  const usedPercent = numberValue(payload.usage_percentage);
  const remainingPercent = numberValue(payload.remaining_percentage);
  if (
    usedPercent === undefined ||
    remainingPercent === undefined ||
    !Number.isFinite(usedPercent) ||
    !Number.isFinite(remainingPercent)
  ) {
    return null;
  }

  return {
    agent: "codebuddy",
    sessionId: "codebuddy-internal-quota",
    source: "provider-derived",
    updatedAt,
    title: `${label} usage`,
    rateLimit: {
      remaining: remainingPercent,
      limit: 100,
      usedPercent,
      windowLabel: "enterprise",
      planType: "percent",
      windows: [
        {
          key: "enterprise",
          label: "Enterprise",
          remaining: remainingPercent,
          limit: 100,
          usedPercent,
          planType: "percent",
        },
      ],
    },
    meta: {
      usage_percentage: usedPercent,
      remaining_percentage: remainingPercent,
    },
  };
}

export function createCodeBuddyInternalQuotaService(
  options: CodeBuddyInternalQuotaServiceOptions,
) {
  let config = options.config;
  const session =
    options.session ?? electronSession.fromPartition(CODEBUDDY_INTERNAL_AUTH_PARTITION);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  let lastSyncAt: number | undefined;
  let lastVerifiedConnected = false;

  function connectedDiagnostics(
    configToUse: CodeBuddyEndpointSettings,
    lastSyncAtToUse?: number,
  ): CodeBuddyQuotaDiagnostics {
    return {
      kind: "internal",
      label: configToUse.label,
      state: "connected",
      message: `已连接 ${configToUse.label} 用量`,
      messageKey: "codebuddy.message.connected",
      messageParams: { label: configToUse.label },
      endpoint: configToUse.quotaEndpoint,
      loginUrl: configToUse.loginUrl,
      ...(lastSyncAtToUse ? { lastSyncAt: lastSyncAtToUse } : {}),
    };
  }

  async function getDiagnostics(): Promise<CodeBuddyQuotaDiagnostics> {
    const diagnostics = buildCodeBuddyInternalQuotaDiagnostics({
      config,
      cookies: await readCookies(session.cookies),
      lastSyncAt,
    });
    if (lastVerifiedConnected && diagnostics.state !== "expired") {
      return connectedDiagnostics(config, lastSyncAt);
    }
    return diagnostics;
  }

  async function refreshUsage(): Promise<CodeBuddyQuotaConnectResult> {
    if (!config.enabled || !config.loginUrl || !config.quotaEndpoint) {
      lastVerifiedConnected = false;
      return {
        diagnostics: notConfiguredDiagnostics(config, lastSyncAt),
        synced: false,
      };
    }

    const cookies = await readCookies(session.cookies);
    if (cookies.length === 0) {
      lastVerifiedConnected = false;
      return {
        diagnostics: buildCodeBuddyInternalQuotaDiagnostics({
          config,
          cookies,
          lastSyncAt,
        }),
        synced: false,
      };
    }

    let response: Response;
    try {
      response = await requestQuotaWithFallback(
        session,
        config.quotaEndpoint,
        config.loginUrl,
        cookies,
        fetchImpl,
      );
    } catch (error) {
      lastVerifiedConnected = false;
      const message =
        error instanceof Error && error.message.includes("ERR_BLOCKED_BY_CLIENT")
          ? `${config.label} 用量请求被客户端拦截，请重试登录或检查页面拦截策略`
          : `${config.label} 用量请求失败：${error instanceof Error ? error.message : String(error)}`;
      return {
        diagnostics: {
          state: "error",
          kind: "internal",
          label: config.label,
          message,
          messageKey:
            error instanceof Error && error.message.includes("ERR_BLOCKED_BY_CLIENT")
              ? "codebuddy.message.request_blocked"
              : "codebuddy.message.request_failed",
          messageParams:
            error instanceof Error && error.message.includes("ERR_BLOCKED_BY_CLIENT")
              ? { label: config.label }
              : { label: config.label, detail: error instanceof Error ? error.message : String(error) },
          endpoint: config.quotaEndpoint,
          loginUrl: config.loginUrl,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }

    if (!response.ok) {
      lastVerifiedConnected = false;
      if (isAuthExpiredStatus(response.status)) {
        return {
          diagnostics: {
            state: "expired",
            kind: "internal",
            label: config.label,
            message: `${config.label} 登录已过期，请重新登录`,
            messageKey: "codebuddy.message.expired",
            messageParams: { label: config.label },
            endpoint: config.quotaEndpoint,
            loginUrl: config.loginUrl,
            ...(lastSyncAt ? { lastSyncAt } : {}),
          },
          synced: false,
        };
      }
      return {
        diagnostics: {
          state: "error",
          kind: "internal",
          label: config.label,
          message: `${config.label} 用量拉取失败：${response.status} ${response.statusText}`,
          messageKey: "codebuddy.message.pull_failed",
          messageParams: { label: config.label, status: response.status, statusText: response.statusText },
          endpoint: config.quotaEndpoint,
          loginUrl: config.loginUrl,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }

    const rawText = await response.text();
    if (looksLikeHtml(rawText)) {
      lastVerifiedConnected = false;
      return {
        diagnostics: {
          state: "expired",
          kind: "internal",
          label: config.label,
          message: `${config.label} 登录态无效，额度接口返回了登录页，请重新登录`,
          messageKey: "codebuddy.message.login_page",
          messageParams: { label: config.label },
          endpoint: config.quotaEndpoint,
          loginUrl: config.loginUrl,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      lastVerifiedConnected = false;
      return {
        diagnostics: {
          state: "error",
          kind: "internal",
          label: config.label,
          message: `${config.label} 用量响应不是有效 JSON`,
          messageKey: "codebuddy.message.invalid_json",
          messageParams: { label: config.label },
          endpoint: config.quotaEndpoint,
          loginUrl: config.loginUrl,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }
    const snapshot = buildCodeBuddyInternalQuotaSnapshot(payload, now(), config.label);
    if (!snapshot) {
      lastVerifiedConnected = false;
      return {
        diagnostics: {
          state: "error",
          kind: "internal",
          label: config.label,
          message: `${config.label} 用量响应缺少可用额度字段`,
          messageKey: "codebuddy.message.missing_fields",
          messageParams: { label: config.label },
          endpoint: config.quotaEndpoint,
          loginUrl: config.loginUrl,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }

    lastSyncAt = snapshot.updatedAt;
    lastVerifiedConnected = true;
    options.onUsageSnapshot?.(snapshot);
    return {
      diagnostics: connectedDiagnostics(config, lastSyncAt),
      synced: true,
    };
  }

  async function connectAndSync(): Promise<CodeBuddyQuotaConnectResult> {
    if (!config.enabled || !config.loginUrl || !config.quotaEndpoint) {
      return {
        diagnostics: notConfiguredDiagnostics(config, lastSyncAt),
        synced: false,
      };
    }

    const authWindow = (options.createWindow ?? defaultCreateWindow)();
    let openError: Error | null = null;
    void authWindow.loadURL(config.loginUrl).catch((error: unknown) => {
      if (isIgnorableNavigationError(error)) {
        return;
      }
      openError = error instanceof Error ? error : new Error(String(error));
    });
    await waitForCodeBuddyInternalLogin(session.cookies, authWindow);
    const result = await refreshUsage();
    if (result.diagnostics.state === "not_connected" && openError) {
      return {
        diagnostics: {
          state: "error",
          kind: "internal",
          label: config.label,
          message: `${config.label} 登录页打开失败：${openError.message}`,
          messageKey: "codebuddy.message.open_failed",
          messageParams: { label: config.label, detail: openError.message },
          endpoint: config.quotaEndpoint,
          loginUrl: config.loginUrl,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }
    if (result.diagnostics.state === "not_connected") {
      return {
        diagnostics: loginNotEstablishedDiagnostics(config, lastSyncAt),
        synced: false,
      };
    }
    return result;
  }

  async function clearAuth(): Promise<CodeBuddyQuotaDiagnostics> {
    await clearAuthSessionData(session);
    lastSyncAt = undefined;
    lastVerifiedConnected = false;
    return buildCodeBuddyInternalQuotaDiagnostics({
      config,
      cookies: [],
    });
  }

  function updateConfig(nextConfig: CodeBuddyEndpointSettings) {
    config = nextConfig;
    lastVerifiedConnected = false;
  }

  return {
    getDiagnostics,
    refreshUsage,
    connectAndSync,
    clearAuth,
    updateConfig,
  };
}
