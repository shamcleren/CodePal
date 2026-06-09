import { BrowserWindow, session as electronSession, type Cookies, type Session } from "electron";
import type { CodeBuddyEndpointSettings } from "../../shared/appSettings";
import type {
  CodeBuddyQuotaConnectResult,
  CodeBuddyQuotaDiagnostics,
} from "../../shared/codebuddyQuotaTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";

const CODEBUDDY_AUTH_PARTITION = "persist:codepal-codebuddy-quota";
const CODEBUDDY_QUOTA_ACCEPT_LANGUAGE = "zh-CN,zh;q=0.9,en;q=0.8";
const CODEBUDDY_BROWSER_QUOTA_RETRY_DELAY_MS = 150;

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
type CookiesWithOptionalEvents = Cookies & {
  on?: (event: "changed", listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: "changed", listener: (...args: unknown[]) => void) => void;
};
type RequestHeaders = Record<string, string | string[] | undefined>;
type BeforeSendHeadersDetails = {
  requestHeaders?: RequestHeaders;
};
type BeforeSendHeadersCallback = (response: { requestHeaders?: RequestHeaders }) => void;
type BeforeSendHeadersListener = (
  details: BeforeSendHeadersDetails,
  callback: BeforeSendHeadersCallback,
) => void;
type SessionWithOptionalWebRequest = Session & {
  webRequest?: {
    onBeforeSendHeaders?: (
      filter: { urls: string[] },
      listener: BeforeSendHeadersListener | null,
    ) => void;
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

const WEAK_BOOTSTRAP_COOKIE_NAMES = new Set([
  "timezone",
  "tof_hn",
  "x-client-ssid",
  "x_host_key_access",
  "x_host_key_access_https",
]);

const QUOTA_READY_COOKIE_NAMES = new Set([
  "rio_token",
  "rio_token_https",
  "p_rio_token",
  "bk_ticket",
  "bk_uid",
  "t_uid",
  "km_uid",
  "x-tofapi-host-key",
]);

function isStrongAuthCookieName(name: string, requireQuotaReadyCookie: boolean): boolean {
  const normalized = name.toLowerCase();
  if (requireQuotaReadyCookie) {
    return QUOTA_READY_COOKIE_NAMES.has(normalized);
  }
  if (WEAK_BOOTSTRAP_COOKIE_NAMES.has(normalized)) {
    return false;
  }
  return (
    normalized === "x-tofapi-host-key" ||
    normalized.includes("token") ||
    normalized.includes("ticket") ||
    normalized.includes("session") ||
    normalized.includes("auth")
  );
}

function isTokenQuotaEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.pathname.includes("/api/query-quota") || url.searchParams.get("platform") === "codebuddy";
  } catch {
    return endpoint.includes("query-quota");
  }
}

function hasAuthCookie(cookies: CodeBuddyQuotaCookie[], config: CodeBuddyEndpointSettings): boolean {
  const cookieNames = config.cookieNames;
  const normalizedConfigured = new Set(cookieNames.map((name) => name.toLowerCase()));
  const requireQuotaReadyCookie = isTokenQuotaEndpoint(config.quotaEndpoint);
  return cookies.some((cookie) => {
    const normalizedName = cookie.name.toLowerCase();
    return (
      normalizedConfigured.has(normalizedName) &&
      isStrongAuthCookieName(normalizedName, requireQuotaReadyCookie)
    );
  });
}

function hasInteractiveLoginCookie(
  cookies: CodeBuddyQuotaCookie[],
  config: CodeBuddyEndpointSettings,
): boolean {
  const normalizedConfigured = new Set(config.cookieNames.map((name) => name.toLowerCase()));
  return cookies.some((cookie) => {
    const normalizedName = cookie.name.toLowerCase();
    return normalizedConfigured.has(normalizedName) && isStrongAuthCookieName(normalizedName, false);
  });
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

function withCacheBust(endpoint: string, timestamp: number): string {
  const url = new URL(endpoint);
  if (url.pathname.includes("/api/query-quota") && !url.searchParams.has("platform")) {
    url.searchParams.set("platform", "codebuddy");
  }
  url.searchParams.set("_t", String(timestamp));
  return url.toString();
}

function isAuthExpiredStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function isRecoverableSessionFetchError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("ERR_BLOCKED_BY_CLIENT") ||
      error.message.includes("ERR_INVALID_ARGUMENT"))
  );
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

function normalizePageToken(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function headerValue(headers: RequestHeaders | undefined, headerName: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const expected = headerName.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== expected) {
      continue;
    }
    if (Array.isArray(value)) {
      return normalizePageToken(value[0]);
    }
    return normalizePageToken(value);
  }
  return undefined;
}

function createPageTokenCapture(
  session: Session,
  endpoint: string,
): { get(): string | undefined; dispose(): void } {
  const webRequest = (session as SessionWithOptionalWebRequest).webRequest;
  const onBeforeSendHeaders = webRequest?.onBeforeSendHeaders;
  let pageToken: string | undefined;
  if (typeof onBeforeSendHeaders !== "function") {
    return {
      get: () => undefined,
      dispose: () => undefined,
    };
  }

  let originPattern: string;
  try {
    originPattern = `${new URL(endpoint).origin}/*`;
  } catch {
    return {
      get: () => undefined,
      dispose: () => undefined,
    };
  }

  const filter = { urls: [originPattern] };
  const listener: BeforeSendHeadersListener = (details, callback) => {
    pageToken = headerValue(details.requestHeaders, "x-page-token") ?? pageToken;
    callback({ requestHeaders: details.requestHeaders });
  };
  onBeforeSendHeaders.call(webRequest, filter, listener);

  return {
    get: () => pageToken,
    dispose: () => {
      onBeforeSendHeaders.call(webRequest, filter, null);
    },
  };
}

function pageTokenExtractionScript(): string {
  return `(() => {
    const tokenPattern = /eyJ[A-Za-z0-9_-]{10,}\\.[A-Fa-f0-9]{32,}/;
    const fromString = (value) => {
      if (typeof value !== "string") return undefined;
      const match = value.match(tokenPattern);
      return match ? match[0] : undefined;
    };
    const keys = [
      "x-page-token",
      "xPageToken",
      "pageToken",
      "page_token",
      "tokenWoaPageToken",
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
        if (/page.*token|token.*page/i.test(storageKey) && typeof raw === "string" && raw.trim()) {
          return raw;
        }
        const rawToken = fromString(raw);
        if (rawToken) return rawToken;
        try {
          const parsed = JSON.parse(raw);
          const queue = [parsed];
          while (queue.length > 0) {
            const current = queue.shift();
            if (!current || typeof current !== "object") continue;
            for (const [objectKey, objectValue] of Object.entries(current)) {
              if (/page.*token|token.*page|x-page-token/i.test(objectKey) && typeof objectValue === "string" && objectValue.trim()) {
                return objectValue;
              }
              const nestedToken = fromString(objectValue);
              if (nestedToken) return nestedToken;
              if (objectValue && typeof objectValue === "object") {
                queue.push(objectValue);
              }
            }
          }
        } catch {}
      }
    }
    const meta = document.querySelector('meta[name="x-page-token"], meta[name="page-token"]');
    const content = meta && meta.getAttribute("content");
    if (content) return content;
    return fromString(document.documentElement.innerHTML) || undefined;
  })()`;
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

async function extractPageTokenFromWindow(window: BrowserWindow): Promise<string | undefined> {
  const webContents = (window as BrowserWindowWithOptionalWebContents).webContents;
  if (!webContents?.executeJavaScript || window.isDestroyed()) {
    return undefined;
  }

  try {
    const result = await webContents.executeJavaScript(pageTokenExtractionScript(), true);
    return normalizePageToken(result);
  } catch {
    return undefined;
  }
}

function defaultCreateWindow(): BrowserWindow {
  return createQuotaBrowserWindow({
    show: true,
    title: "登录 CodeBuddy 用量",
  });
}

function defaultCreateHiddenQuotaWindow(): BrowserWindow {
  return createQuotaBrowserWindow({
    show: false,
    title: "CodeBuddy 用量同步",
  });
}

function createQuotaBrowserWindow(input: { show: boolean; title: string }): BrowserWindow {
  const parentWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
  return new BrowserWindow({
    width: 1080,
    height: 760,
    autoHideMenuBar: true,
    show: input.show,
    skipTaskbar: true,
    title: input.title,
    backgroundColor: "#ffffff",
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

function canCreateDefaultWindow(): boolean {
  return (
    typeof BrowserWindow === "function" &&
    typeof (BrowserWindow as unknown as { getAllWindows?: unknown }).getAllWindows === "function"
  );
}

function resolveHiddenQuotaWindowFactory(
  createWindow: (() => BrowserWindow) | undefined,
): (() => BrowserWindow) | undefined {
  if (createWindow) {
    return createWindow;
  }
  return canCreateDefaultWindow() ? defaultCreateHiddenQuotaWindow : undefined;
}

function createLoginWindowRevealer(window: BrowserWindow): () => void {
  let shown = false;
  return () => {
    if (shown || window.isDestroyed()) {
      return;
    }
    shown = true;
    const show = (window as BrowserWindow & { show?: () => void }).show;
    if (typeof show === "function") {
      show.call(window);
    }
  };
}

function waitForWindowClosedOnce(window: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    if (window.isDestroyed()) {
      resolve();
      return;
    }
    const once = (window as BrowserWindow & { once?: (event: string, listener: () => void) => void })
      .once;
    if (typeof once !== "function") {
      return;
    }
    once.call(window, "closed", resolve);
  });
}

async function waitForCodeBuddyLogin(
  cookieStore: Cookies,
  window: BrowserWindow,
  config: CodeBuddyEndpointSettings,
  timeoutMs = 5 * 60 * 1000,
  options: {
    initialCookieCheckSignal?: Promise<void>;
    acceptInteractiveLoginCookie?: boolean;
  } = {},
): Promise<CodeBuddyQuotaCookie[]> {
  return await new Promise<CodeBuddyQuotaCookie[]>((resolve) => {
    let settled = false;
    const timeoutState: { timer?: ReturnType<typeof setTimeout> } = {};
    const finish = async (cookies?: CodeBuddyQuotaCookie[]) => {
      if (settled) return;
      settled = true;
      (cookieStore as CookiesWithOptionalEvents).removeListener?.("changed", onChanged);
      if (timeoutState.timer) {
        clearTimeout(timeoutState.timer);
      }
      resolve(cookies ?? await readCookies(cookieStore));
    };
    const onChanged = async () => {
      const current = await readCookies(cookieStore);
      const authenticated = options.acceptInteractiveLoginCookie
        ? hasInteractiveLoginCookie(current, config)
        : hasAuthCookie(current, config);
      if (authenticated) {
        await finish(current);
      }
    };

    timeoutState.timer = setTimeout(() => {
      void finish();
    }, timeoutMs);

    (cookieStore as CookiesWithOptionalEvents).on?.("changed", onChanged);
    window.on("closed", () => {
      void finish();
    });
    if (window.isDestroyed()) {
      void finish();
      return;
    }
    if (options.initialCookieCheckSignal) {
      void options.initialCookieCheckSignal.then(() => {
        void onChanged();
      });
    } else {
      void onChanged();
    }
  });
}

async function requestQuotaWithFallback(
  session: Session,
  endpoint: string,
  loginUrl: string,
  cookies: CodeBuddyQuotaCookie[],
  enterpriseId: string | undefined,
  pageToken: string | undefined,
  fetchImpl: FetchLike,
  timestamp: number,
): Promise<Response> {
  const requestUrl = withCacheBust(endpoint, timestamp);
  const origin = new URL(loginUrl).origin;
  const requestInit = {
    method: "GET",
    credentials: "include",
    headers: {
      accept: "*/*",
      "accept-language": CODEBUDDY_QUOTA_ACCEPT_LANGUAGE,
      "cache-control": "no-cache",
      cookie: cookieHeader(cookies),
      pragma: "no-cache",
      priority: "u=1, i",
      referer: `${origin}/`,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      ...(enterpriseId ? { "x-enterprise-id": enterpriseId } : {}),
      ...(pageToken ? { "x-page-token": pageToken } : {}),
    },
  } satisfies RequestInit;

  const sessionFetch = (session as SessionWithFetch).fetch;
  if (typeof sessionFetch === "function") {
    return sessionFetch.call(session, requestUrl, requestInit).catch(async (error: unknown) => {
      if (isRecoverableSessionFetchError(error)) {
        return await fetchImpl(requestUrl, requestInit);
      }
      throw error;
    });
  }

  return fetchImpl(requestUrl, requestInit);
}

type BrowserQuotaResponse = {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text?: string;
  error?: string;
};

function waitForBrowserQuotaRetry(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, CODEBUDDY_BROWSER_QUOTA_RETRY_DELAY_MS);
  });
}

function browserQuotaResponseToResponse(browserQuotaResponse: BrowserQuotaResponse | undefined): Response | null {
  if (!browserQuotaResponse || browserQuotaResponse.error || typeof browserQuotaResponse.status !== "number") {
    return null;
  }
  return new Response(browserQuotaResponse.text ?? "", {
    status: browserQuotaResponse.status,
    statusText: browserQuotaResponse.statusText ?? "",
    headers: browserQuotaResponse.contentType ? { "content-type": browserQuotaResponse.contentType } : undefined,
  });
}

function buildBrowserQuotaFetchScript(pathAndQuery: string, pageToken: string | undefined): string {
  return `fetch(${JSON.stringify(pathAndQuery)}, {
    method: "GET",
    cache: "no-store",
    credentials: "include",
    headers: {
      "accept": "*/*",
      ${pageToken ? `"x-page-token": ${JSON.stringify(pageToken)},` : ""}
    },
  }).then(async (response) => ({
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    text: await response.text(),
  })).catch((error) => ({ error: String(error && error.message ? error.message : error) }))`;
}

function isRetryableBrowserQuotaResponse(browserQuotaResponse: BrowserQuotaResponse | undefined): boolean {
  if (!browserQuotaResponse || browserQuotaResponse.error) {
    return false;
  }
  const text = browserQuotaResponse.text ?? "";
  return (
    text.includes("invalid_fetch_site") ||
    text.includes("missing_page_token")
  );
}

function closeWindowIfOpen(window: BrowserWindow): void {
  if (!window.isDestroyed()) {
    window.close();
  }
}

async function requestQuotaFromBrowserContext(input: {
  endpoint: string;
  pageToken: string | undefined;
  timestamp: number;
  createWindow: () => BrowserWindow;
  getCapturedPageToken?: () => string | undefined;
}): Promise<{ response: Response; pageToken?: string } | null> {
  const endpointUrl = new URL(withCacheBust(input.endpoint, input.timestamp));
  const origin = endpointUrl.origin;
  const pathAndQuery = `${endpointUrl.pathname}${endpointUrl.search}`;
  const window = input.createWindow();

  try {
    await window.loadURL(origin).catch((error: unknown) => {
      if (!isIgnorableNavigationError(error)) {
        throw error;
      }
    });
    const extractedPageToken =
      input.getCapturedPageToken?.() ?? (await extractPageTokenFromWindow(window)) ?? input.pageToken;
    let activePageToken = extractedPageToken;
    let browserQuotaResponse = await (window as BrowserWindowWithOptionalWebContents).webContents?.executeJavaScript?.(
      buildBrowserQuotaFetchScript(pathAndQuery, extractedPageToken),
      true,
    ) as BrowserQuotaResponse | undefined;
    if (isRetryableBrowserQuotaResponse(browserQuotaResponse)) {
      await waitForBrowserQuotaRetry();
      activePageToken =
        input.getCapturedPageToken?.() ??
        (await extractPageTokenFromWindow(window)) ??
        extractedPageToken;
      const retriedBrowserQuotaResponse = await (window as BrowserWindowWithOptionalWebContents).webContents?.executeJavaScript?.(
        buildBrowserQuotaFetchScript(pathAndQuery, activePageToken),
        true,
      ) as BrowserQuotaResponse | undefined;
      browserQuotaResponse = retriedBrowserQuotaResponse ?? browserQuotaResponse;
    }
    const response = browserQuotaResponseToResponse(browserQuotaResponse);
    if (!response) {
      return null;
    }

    return {
      response,
      ...(activePageToken ? { pageToken: activePageToken } : {}),
    };
  } finally {
    closeWindowIfOpen(window);
  }
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

function notVerifiedDiagnostics(
  config: CodeBuddyEndpointSettings,
  lastSyncAt?: number,
): CodeBuddyQuotaDiagnostics {
  return {
    kind: "code",
    label: config.label,
    state: "not_connected",
    message: `已检测到 ${config.label} 登录态，但额度接口尚未成功拉通，请刷新验证`,
    messageKey: "codebuddy.message.not_verified",
    messageParams: { label: config.label },
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
    message: `${config.label} 未检测到登录态，请确认登录已完成，或检查设置中的登录地址是否正确`,
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

  if (hasAuthCookie(input.cookies, input.config)) {
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
  if (payload.success === true) {
    return buildCodeBuddyTokenQuotaSnapshot(payload, updatedAt, label);
  }

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

function buildCodeBuddyTokenQuotaSnapshot(
  payload: Record<string, unknown>,
  updatedAt: number,
  label: string,
): UsageSnapshot | null {
  const totalUsed = numberValue(payload.total_used);
  const totalQuota = numberValue(payload.total_quota);
  const usedPercent =
    numberValue(payload.total_usage_rate) ??
    numberValue(payload.usage_percentage_default) ??
    numberValue(payload.usage_percentage);
  const remainingPercent =
    numberValue(payload.remaining_percentage_total) ??
    numberValue(payload.remaining_percentage);

  if (
    totalUsed === undefined ||
    totalQuota === undefined ||
    usedPercent === undefined ||
    !Number.isFinite(totalUsed) ||
    !Number.isFinite(totalQuota) ||
    !Number.isFinite(usedPercent) ||
    totalQuota <= 0
  ) {
    return null;
  }

  const remaining = Math.max(0, totalQuota - totalUsed);

  return {
    agent: "codebuddy",
    sessionId: "codebuddy-quota",
    source: "provider-derived",
    updatedAt,
    title: `${label} usage`,
    rateLimit: {
      remaining,
      limit: totalQuota,
      usedPercent,
      windowLabel: "total",
      planType: "credits",
      windows: [
        {
          key: "total",
          label: "Total",
          remaining,
          limit: totalQuota,
          usedPercent,
          planType: "credits",
        },
      ],
    },
    meta: {
      total_used: totalUsed,
      total_quota: totalQuota,
      total_usage_rate: usedPercent,
      ...(remainingPercent !== undefined ? { remaining_percentage_total: remainingPercent } : {}),
      quota_hidden: payload.quota_hidden,
      quota_hidden_confirmed: payload.quota_hidden_confirmed,
      quota_hidden_unverified: payload.quota_hidden_unverified,
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
  let lastPageToken: string | undefined;

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
    if (diagnostics.state === "connected" && isTokenQuotaEndpoint(config.quotaEndpoint)) {
      return notVerifiedDiagnostics(config, lastSyncAt);
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

    async function requestBrowserContextFallback(): Promise<Response | null> {
      if (!isTokenQuotaEndpoint(config.quotaEndpoint)) {
        return null;
      }
      const createWindow = resolveHiddenQuotaWindowFactory(options.createWindow);
      if (!createWindow) {
        return null;
      }
      const pageTokenCapture = createPageTokenCapture(session, config.quotaEndpoint);
      try {
        const browserResult = await requestQuotaFromBrowserContext({
          endpoint: config.quotaEndpoint,
          pageToken: lastPageToken,
          timestamp: now(),
          createWindow,
          getCapturedPageToken: () => pageTokenCapture.get(),
        });
        lastPageToken = browserResult?.pageToken ?? pageTokenCapture.get() ?? lastPageToken;
        if (!browserResult) {
          return null;
        }
        return browserResult.response;
      } finally {
        pageTokenCapture.dispose();
      }
    }

    let response: Response;
    try {
      response = await requestQuotaWithFallback(
        session,
        config.quotaEndpoint,
        config.loginUrl,
        cookies,
        lastEnterpriseId,
        lastPageToken,
        fetchImpl,
        now(),
      );
    } catch (error) {
      lastVerifiedConnected = false;
      const message =
        isRecoverableSessionFetchError(error)
          ? `${config.label} 用量请求被客户端拦截，请重试登录或检查页面拦截策略`
          : `${config.label} 用量请求失败：${error instanceof Error ? error.message : String(error)}`;
      return {
        diagnostics: {
          state: "error",
          kind: "code",
          label: config.label,
          message,
          messageKey:
            isRecoverableSessionFetchError(error)
              ? "codebuddy.message.request_blocked"
              : "codebuddy.message.request_failed",
          messageParams:
            isRecoverableSessionFetchError(error)
              ? { label: config.label }
              : { label: config.label, detail: error instanceof Error ? error.message : String(error) },
          endpoint: config.quotaEndpoint,
          loginUrl: config.loginUrl,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }

    if (!response.ok && isTokenQuotaEndpoint(config.quotaEndpoint)) {
      const fallbackResponse = await requestBrowserContextFallback();
      if (fallbackResponse) {
        response = fallbackResponse;
      }
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

    let rawText = await response.text();
    if (looksLikeHtml(rawText)) {
      const fallbackResponse = await requestBrowserContextFallback();
      if (fallbackResponse) {
        response = fallbackResponse;
        rawText = await response.text();
      }
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

    let snapshot = buildCodeBuddyQuotaSnapshot(payload, now(), config.label);
    if (!snapshot) {
      const fallbackResponse = await requestBrowserContextFallback();
      if (fallbackResponse) {
        const fallbackText = await fallbackResponse.text();
        try {
          payload = JSON.parse(fallbackText) as Record<string, unknown>;
          snapshot = buildCodeBuddyQuotaSnapshot(payload, now(), config.label);
        } catch {
          snapshot = null;
        }
      }
    }

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

    const createWindow = options.createWindow ?? defaultCreateWindow;
    const loginWindow = createWindow();
    const pageTokenCapture = createPageTokenCapture(session, config.quotaEndpoint);
    let openError: Error | null = null;
    let releaseInitialCookieCheck: () => void = () => undefined;
    const initialCookieCheckSignal = new Promise<void>((resolve) => {
      releaseInitialCookieCheck = resolve;
    });
    const loginCookiesPromise = waitForCodeBuddyLogin(
      session.cookies,
      loginWindow,
      config,
      5 * 60 * 1000,
      {
        initialCookieCheckSignal,
        acceptInteractiveLoginCookie: isTokenQuotaEndpoint(config.quotaEndpoint),
      },
    );
    const revealLoginWindow = createLoginWindowRevealer(loginWindow);
    const updateLoginHints = async () => {
      lastEnterpriseId = (await extractEnterpriseIdFromWindow(loginWindow)) ?? lastEnterpriseId;
      lastPageToken =
        pageTokenCapture.get() ?? (await extractPageTokenFromWindow(loginWindow)) ?? lastPageToken;
    };
    const onDidFinishLoad = () => {
      revealLoginWindow();
      void updateLoginHints();
    };

    try {
      revealLoginWindow();
      if (typeof loginWindow.once === "function") {
        loginWindow.once("ready-to-show", revealLoginWindow);
      }
      (loginWindow as BrowserWindowWithOptionalWebContents).webContents?.on?.(
        "did-finish-load",
        onDidFinishLoad,
      );
      const loadResult = await Promise.race([
        loginWindow
          .loadURL(config.loginUrl)
          .then(() => {
            revealLoginWindow();
            return updateLoginHints();
          })
          .catch((error: unknown) => {
            if (isIgnorableNavigationError(error)) {
              revealLoginWindow();
              return updateLoginHints();
            }
            openError = error instanceof Error ? error : new Error(String(error));
            revealLoginWindow();
            return updateLoginHints();
          })
          .then(() => "loaded" as const),
        waitForWindowClosedOnce(loginWindow).then(() => "closed" as const),
      ]);
      releaseInitialCookieCheck();
      if (loadResult === "closed") {
        const result = await refreshUsage();
        if (result.diagnostics.state === "not_connected") {
          return {
            diagnostics: loginNotEstablishedDiagnostics(config, lastSyncAt),
            synced: false,
          };
        }
        return result;
      }
      await loginCookiesPromise;
      await updateLoginHints();
      const result = await refreshUsage();
      if (result.diagnostics.state === "not_connected" && openError) {
        return {
          diagnostics: {
            state: "error",
            kind: "code",
            label: config.label,
            message: `${config.label} 登录页打开失败：${openError.message}`,
            messageKey: "codebuddy.message.open_failed",
            messageParams: {
              label: config.label,
              detail: openError.message,
            },
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
      if (result.synced && !loginWindow.isDestroyed()) {
        loginWindow.close();
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
      await waitForCodeBuddyLogin(session.cookies, loginWindow, config);
      const result = await refreshUsage();
      if (result.diagnostics.state === "not_connected") {
        return {
          diagnostics: loginNotEstablishedDiagnostics(config, lastSyncAt),
          synced: false,
        };
      }
      if (result.synced && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      return result;
    } finally {
      pageTokenCapture.dispose();
      removeDidFinishLoadListener(loginWindow, onDidFinishLoad);
    }
  }

  async function clearAuth(): Promise<CodeBuddyQuotaDiagnostics> {
    await clearAuthSessionData(session);
    lastSyncAt = undefined;
    lastVerifiedConnected = false;
    lastEnterpriseId = undefined;
    lastPageToken = undefined;
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
    lastPageToken = undefined;
  }

  return {
    getDiagnostics,
    refreshUsage,
    connectAndSync,
    clearAuth,
    updateConfig,
  };
}
