import { BrowserWindow, session as electronSession, type Cookies, type Session } from "electron";
import type { CodeBuddyEndpointSettings } from "../../shared/appSettings";
import type {
  CodeBuddyQuotaConnectResult,
  CodeBuddyQuotaDiagnostics,
} from "../../shared/codebuddyQuotaTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";

const CODEBUDDY_AUTH_PARTITION = "persist:codepal-codebuddy-quota";

export type CodeBuddyQuotaCookie = {
  name: string;
  value: string;
};

type FetchLike = typeof fetch;
type SessionWithFetch = Session & {
  fetch?: FetchLike;
};
type BrowserWindowWithOptionalWebContents = BrowserWindow & {
  webContents?: {
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
    executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
  };
};

function removeDidFinishLoadListener(
  window: BrowserWindow,
  listener: (...args: unknown[]) => void,
) {
  if (window.isDestroyed()) {
    return;
  }
  (window as BrowserWindowWithOptionalWebContents).webContents?.removeListener?.(
    "did-finish-load",
    listener,
  );
}

type CodeBuddyQuotaServiceOptions = {
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

function hasAuthCookie(cookies: CodeBuddyQuotaCookie[], cookieNames: string[]): boolean {
  const normalizedConfigured = cookieNames.map((name) => name.toLowerCase());
  return cookies.some((cookie) => normalizedConfigured.includes(cookie.name.toLowerCase()));
}

async function readCookies(cookieStore: Cookies): Promise<CodeBuddyQuotaCookie[]> {
  const cookies = await cookieStore.get({});
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
  }));
}

function cookieHeader(cookies: CodeBuddyQuotaCookie[]): string {
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

function normalizeEnterpriseId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function extractEnterpriseIdFromWindow(window: BrowserWindow): Promise<string | undefined> {
  const webContents = (window as BrowserWindowWithOptionalWebContents).webContents;
  if (!webContents?.executeJavaScript || window.isDestroyed()) {
    return undefined;
  }

  try {
    const result = await webContents.executeJavaScript(
      `(() => {
        const keys = [
          "enterpriseId",
          "enterprise-id",
          "x-enterprise-id",
          "currentEnterpriseId",
          "selectedEnterpriseId",
        ];
        const storages = [window.localStorage, window.sessionStorage];
        for (const storage of storages) {
          if (!storage) continue;
          for (const key of keys) {
            const direct = storage.getItem(key);
            if (direct) return direct;
          }
          for (let index = 0; index < storage.length; index += 1) {
            const storageKey = storage.key(index);
            if (!storageKey) continue;
            const raw = storage.getItem(storageKey);
            if (!raw) continue;
            if (/enterprise/i.test(storageKey) && typeof raw === "string" && raw.trim()) {
              return raw;
            }
            try {
              const parsed = JSON.parse(raw);
              const queue = [parsed];
              while (queue.length > 0) {
                const current = queue.shift();
                if (!current || typeof current !== "object") continue;
                for (const [objectKey, objectValue] of Object.entries(current)) {
                  if (/enterprise/i.test(objectKey) && typeof objectValue === "string" && objectValue.trim()) {
                    return objectValue;
                  }
                  if (objectValue && typeof objectValue === "object") {
                    queue.push(objectValue);
                  }
                }
              }
            } catch {}
          }
        }
        return undefined;
      })()`,
      true,
    );
    return normalizeEnterpriseId(result);
  } catch {
    return undefined;
  }
}

function defaultCreateWindow(): BrowserWindow {
  const parentWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
  return new BrowserWindow({
    width: 1080,
    height: 760,
    autoHideMenuBar: true,
    show: true,
    skipTaskbar: true,
    title: "登录 CodeBuddy 用量",
    ...(parentWindow
      ? {
          parent: parentWindow,
        }
      : {}),
    webPreferences: {
      partition: CODEBUDDY_AUTH_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

async function waitForCodeBuddyLogin(
  cookieStore: Cookies,
  window: BrowserWindow,
  timeoutMs = 5 * 60 * 1000,
): Promise<CodeBuddyQuotaCookie[]> {
  return await new Promise<CodeBuddyQuotaCookie[]>((resolve) => {
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
  cookies: CodeBuddyQuotaCookie[],
  enterpriseId: string | undefined,
  fetchImpl: FetchLike,
): Promise<Response> {
  const requestInit = {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      origin: new URL(loginUrl).origin,
      cookie: cookieHeader(cookies),
      ...(enterpriseId ? { "x-enterprise-id": enterpriseId } : {}),
    },
    body: "{}",
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
    kind: "code",
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
    kind: "code",
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

export function buildCodeBuddyQuotaDiagnostics(input: {
  config: CodeBuddyEndpointSettings;
  cookies: CodeBuddyQuotaCookie[];
  lastSyncAt?: number;
}): CodeBuddyQuotaDiagnostics {
  if (!input.config.enabled || !input.config.loginUrl || !input.config.quotaEndpoint) {
    return notConfiguredDiagnostics(input.config, input.lastSyncAt);
  }

  if (hasAuthCookie(input.cookies, input.config.cookieNames)) {
    return {
      kind: "code",
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
    kind: "code",
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

export function buildCodeBuddyQuotaSnapshot(
  payload: Record<string, unknown>,
  updatedAt: number,
  label = "CodeBuddy Code",
): UsageSnapshot | null {
  if (payload.code !== 0) {
    return null;
  }

  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;
  if (!data) {
    return null;
  }

  const usedCredits = numberValue(data.credit);
  const limit = numberValue(data.limitNum);
  const resetAt = parseChinaDateTimeToUnixSeconds(data.cycleResetTime);
  if (
    usedCredits === undefined ||
    limit === undefined ||
    !Number.isFinite(usedCredits) ||
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    return null;
  }

  const remaining = Math.max(0, limit - usedCredits);
  const usedPercent = (usedCredits / limit) * 100;

  return {
    agent: "codebuddy",
    sessionId: "codebuddy-quota",
    source: "provider-derived",
    updatedAt,
    title: `${label} usage`,
    rateLimit: {
      remaining,
      limit,
      usedPercent,
      ...(resetAt ? { resetAt } : {}),
      windowLabel: "月度",
      planType: "credits",
      windows: [
        {
          key: "code",
          label: "Code",
          remaining,
          limit,
          usedPercent,
          ...(resetAt ? { resetAt } : {}),
          planType: "credits",
        },
      ],
    },
    meta: {
      credit: usedCredits,
      cycleStartTime: data.cycleStartTime,
      cycleEndTime: data.cycleEndTime,
      cycleResetTime: data.cycleResetTime,
      limitNum: limit,
    },
  };
}

function parseChinaDateTimeToUnixSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second] = match;
  const millis = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute),
    Number(second),
  );
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : undefined;
}

export function createCodeBuddyQuotaService(options: CodeBuddyQuotaServiceOptions) {
  let config = options.config;
  const session = options.session ?? electronSession.fromPartition(CODEBUDDY_AUTH_PARTITION);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  let lastSyncAt: number | undefined;
  let lastVerifiedConnected = false;
  let lastEnterpriseId: string | undefined;

  function connectedDiagnostics(
    configToUse: CodeBuddyEndpointSettings,
    lastSyncAtToUse?: number,
  ): CodeBuddyQuotaDiagnostics {
    return {
      kind: "code",
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
    const cookies = await readCookies(session.cookies);
    const diagnostics = buildCodeBuddyQuotaDiagnostics({
      config,
      cookies,
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
        diagnostics: buildCodeBuddyQuotaDiagnostics({
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
        lastEnterpriseId,
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
          kind: "code",
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
            kind: "code",
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
          kind: "code",
          label: config.label,
          message:
            response.status === 400 && !lastEnterpriseId
              ? `${config.label} 用量拉取失败，请重新登录后重试`
              : `${config.label} 用量拉取失败：${response.status} ${response.statusText}`,
          messageKey:
            response.status === 400 && !lastEnterpriseId
              ? "codebuddy.message.pull_failed_retry"
              : "codebuddy.message.pull_failed",
          messageParams:
            response.status === 400 && !lastEnterpriseId
              ? { label: config.label }
              : { label: config.label, status: response.status, statusText: response.statusText },
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
          kind: "code",
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
          kind: "code",
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

    const snapshot = buildCodeBuddyQuotaSnapshot(payload, now(), config.label);
    if (!snapshot) {
      lastVerifiedConnected = false;
      return {
        diagnostics: {
          state: "error",
          kind: "code",
          label: config.label,
          message: `${config.label} 用量响应缺少有效额度字段`,
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
      diagnostics: connectedDiagnostics(config, snapshot.updatedAt),
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

    const existingDiagnostics = buildCodeBuddyQuotaDiagnostics({
      config,
      cookies: await readCookies(session.cookies),
      lastSyncAt,
    });
    if (existingDiagnostics.state === "connected") {
      return await refreshUsage();
    }

    const createWindow = options.createWindow ?? defaultCreateWindow;
    const loginWindow = createWindow();
    let resolveEnterpriseId: (() => Promise<void>) | undefined;

    try {
      const enterpriseIdPromise = new Promise<void>((resolve) => {
        const listener = async () => {
          lastEnterpriseId = (await extractEnterpriseIdFromWindow(loginWindow)) ?? lastEnterpriseId;
          resolve();
        };
        resolveEnterpriseId = async () => {
          removeDidFinishLoadListener(loginWindow, listener);
          await listener();
        };
        (loginWindow as BrowserWindowWithOptionalWebContents).webContents?.on?.(
          "did-finish-load",
          listener,
        );
      });

      await loginWindow.loadURL(config.loginUrl);
      await Promise.race([enterpriseIdPromise, waitForCodeBuddyLogin(session.cookies, loginWindow)]);
      await resolveEnterpriseId?.();
      const result = await refreshUsage();
      if (result.diagnostics.state === "not_connected") {
        return {
          diagnostics: loginNotEstablishedDiagnostics(config, lastSyncAt),
          synced: false,
        };
      }
      return result;
    } catch (error) {
      if (!isIgnorableNavigationError(error)) {
        return {
          diagnostics: {
            state: "error",
            kind: "code",
            label: config.label,
            message: `${config.label} 登录页打开失败：${error instanceof Error ? error.message : String(error)}`,
            messageKey: "codebuddy.message.open_failed",
            messageParams: {
              label: config.label,
              detail: error instanceof Error ? error.message : String(error),
            },
            endpoint: config.quotaEndpoint,
            loginUrl: config.loginUrl,
            ...(lastSyncAt ? { lastSyncAt } : {}),
          },
          synced: false,
        };
      }
      await waitForCodeBuddyLogin(session.cookies, loginWindow);
      const result = await refreshUsage();
      if (result.diagnostics.state === "not_connected") {
        return {
          diagnostics: loginNotEstablishedDiagnostics(config, lastSyncAt),
          synced: false,
        };
      }
      return result;
    } finally {
      if (!loginWindow.isDestroyed()) {
        loginWindow.close();
      }
    }
  }

  async function clearAuth(): Promise<CodeBuddyQuotaDiagnostics> {
    await clearAuthSessionData(session);
    lastSyncAt = undefined;
    lastVerifiedConnected = false;
    lastEnterpriseId = undefined;
    const cookies = await readCookies(session.cookies);
    return buildCodeBuddyQuotaDiagnostics({
      config,
      cookies,
    });
  }

  function updateConfig(nextConfig: CodeBuddyEndpointSettings) {
    config = nextConfig;
    lastVerifiedConnected = false;
    lastEnterpriseId = undefined;
  }

  return {
    getDiagnostics,
    refreshUsage,
    connectAndSync,
    clearAuth,
    updateConfig,
  };
}
