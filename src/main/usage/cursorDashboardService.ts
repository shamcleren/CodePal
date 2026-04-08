import { BrowserWindow, session as electronSession, type Cookies, type Session } from "electron";
import type { CursorDashboardConnectResult, CursorDashboardDiagnostics } from "../../shared/cursorDashboardTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";

const CURSOR_AUTH_PARTITION = "persist:codepal-cursor-dashboard";
const CURSOR_USAGE_URL = "https://cursor.com/cn/dashboard/usage";
const CURSOR_SPEND_ENDPOINT = "https://cursor.com/api/dashboard/get-team-spend";

export type CursorDashboardCookie = {
  name: string;
  value: string;
};

type FetchLike = typeof fetch;

type CursorDashboardServiceOptions = {
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

function firstNumber(value: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim() !== "") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function unixSeconds(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
}

function isAuthExpiredStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function firstMatchingMember(
  payload: Record<string, unknown>,
  usedCents: number,
): Record<string, unknown> | undefined {
  const members = payload.teamMemberSpend;
  if (!Array.isArray(members)) {
    return undefined;
  }

  return members.find((member) => {
    if (!member || typeof member !== "object") {
      return false;
    }
    const row = member as Record<string, unknown>;
    return firstNumber(row, ["spendCents"]) === usedCents;
  }) as Record<string, unknown> | undefined;
}

export function buildCursorUsageDiagnostics(
  cookies: CursorDashboardCookie[],
  lastSyncAt?: number,
): CursorDashboardDiagnostics {
  const teamId = cookies.find((cookie) => cookie.name === "team_id")?.value;
  const token = cookies.find((cookie) => cookie.name === "WorkosCursorSessionToken")?.value;

  if (token && teamId) {
    return {
      state: "connected",
      message: "已连接 Cursor Dashboard",
      teamId,
      ...(lastSyncAt ? { lastSyncAt } : {}),
    };
  }

  return {
    state: "not_connected",
    message: "未连接 Cursor Dashboard",
    ...(teamId ? { teamId } : {}),
    ...(lastSyncAt ? { lastSyncAt } : {}),
  };
}

export function buildCursorSpendSnapshot(
  payload: Record<string, unknown>,
  cookies: CursorDashboardCookie[],
  updatedAt: number,
): UsageSnapshot | null {
  const diagnostics = buildCursorUsageDiagnostics(cookies);
  if (diagnostics.state !== "connected" || !diagnostics.teamId) {
    return null;
  }

  const usedCents = firstNumber(payload, [
    "maxUserSpendCents",
    "currentUserSpendCents",
    "userSpendCents",
    "spendCents",
  ]);
  const matchedMember =
    usedCents !== undefined ? firstMatchingMember(payload, usedCents) : undefined;
  const limitDollars =
    firstNumber(matchedMember ?? {}, [
      "hardLimitOverrideDollars",
      "effectivePerUserLimitDollars",
    ]) ??
    firstNumber(payload, [
      "hardLimitOverrideDollars",
      "effectivePerUserLimitDollars",
    ]);
  const limitCents =
    limitDollars !== undefined
      ? Math.round(limitDollars * 100)
      : firstNumber(payload, [
          "maxUserSpendLimitCents",
          "onDemandSpendLimitCents",
          "userSpendLimitCents",
          "monthlySpendLimitCents",
          "spendLimitCents",
        ]);
  if (
    usedCents === undefined ||
    limitCents === undefined ||
    !Number.isFinite(usedCents) ||
    !Number.isFinite(limitCents) ||
    limitCents <= 0
  ) {
    return null;
  }

  const nextCycleStart = unixSeconds(
    firstNumber(payload, ["nextCycleStart", "nextBillingDate", "resetAt"]),
  );

  return {
    agent: "cursor",
    sessionId: `cursor-dashboard:${diagnostics.teamId}`,
    source: "provider-derived",
    updatedAt,
    title: "Cursor Dashboard spend",
    rateLimit: {
      remaining: Math.max(0, Math.round(limitCents - usedCents)),
      limit: Math.round(limitCents),
      usedPercent: (usedCents / limitCents) * 100,
      ...(nextCycleStart ? { resetAt: nextCycleStart } : {}),
      windowLabel: "月度",
      planType: "usd-cents",
    },
    meta: {
      usedCents: Math.round(usedCents),
      limitCents: Math.round(limitCents),
    },
  };
}

async function readCookies(cookieStore: Cookies): Promise<CursorDashboardCookie[]> {
  const cookies = await cookieStore.get({ url: CURSOR_USAGE_URL });
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
  }));
}

function defaultCreateWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 1080,
    height: 760,
    autoHideMenuBar: true,
    title: "登录 Cursor",
    webPreferences: {
      partition: CURSOR_AUTH_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

async function waitForCursorLogin(
  cookieStore: Cookies,
  window: BrowserWindow,
  timeoutMs = 5 * 60 * 1000,
): Promise<CursorDashboardCookie[]> {
  const initial = await readCookies(cookieStore);
  if (buildCursorUsageDiagnostics(initial).state === "connected") {
    return initial;
  }

  return await new Promise<CursorDashboardCookie[]>((resolve) => {
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      cookieStore.removeListener("changed", onChanged);
      clearTimeout(timer);
      resolve(await readCookies(cookieStore));
    };

    const onChanged = async () => {
      const current = await readCookies(cookieStore);
      if (buildCursorUsageDiagnostics(current).state === "connected") {
        await finish();
        if (!window.isDestroyed()) {
          window.close();
        }
      }
    };

    const timer = setTimeout(() => {
      void finish();
    }, timeoutMs);

    cookieStore.on("changed", onChanged);
    window.on("closed", () => {
      void finish();
    });
  });
}

export function createCursorDashboardService(options: CursorDashboardServiceOptions = {}) {
  const session = options.session ?? electronSession.fromPartition(CURSOR_AUTH_PARTITION);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  let lastSyncAt: number | undefined;

  async function getDiagnostics(): Promise<CursorDashboardDiagnostics> {
    const cookies = await readCookies(session.cookies);
    return buildCursorUsageDiagnostics(cookies, lastSyncAt);
  }

  async function refreshUsage(): Promise<CursorDashboardConnectResult> {
    const cookies = await readCookies(session.cookies);
    const diagnostics = buildCursorUsageDiagnostics(cookies, lastSyncAt);
    if (diagnostics.state !== "connected" || !diagnostics.teamId) {
      return { diagnostics, synced: false };
    }

    const response = await fetchImpl(CURSOR_SPEND_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        origin: "https://cursor.com",
        referer: CURSOR_USAGE_URL,
        cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      },
      body: JSON.stringify({ teamId: Number(diagnostics.teamId) }),
    });

    if (!response.ok) {
      if (isAuthExpiredStatus(response.status)) {
        return {
          diagnostics: {
            state: "expired",
            message: "Cursor 登录已过期，请重新登录",
            teamId: diagnostics.teamId,
            ...(lastSyncAt ? { lastSyncAt } : {}),
          },
          synced: false,
        };
      }
      return {
        diagnostics: {
          state: "error",
          message: `Cursor spend 拉取失败：${response.status} ${response.statusText}`,
          teamId: diagnostics.teamId,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const snapshot = buildCursorSpendSnapshot(payload, cookies, now());
    if (!snapshot) {
      return {
        diagnostics: {
          state: "error",
          message: "Cursor spend 响应缺少可用额度维度",
          teamId: diagnostics.teamId,
          ...(lastSyncAt ? { lastSyncAt } : {}),
        },
        synced: false,
      };
    }

    lastSyncAt = snapshot.updatedAt;
    options.onUsageSnapshot?.(snapshot);
    return {
      diagnostics: {
        state: "connected",
        message: "已连接 Cursor Dashboard",
        teamId: diagnostics.teamId,
        lastSyncAt,
      },
      synced: true,
    };
  }

  async function connectAndSync(): Promise<CursorDashboardConnectResult> {
    const authWindow = (options.createWindow ?? defaultCreateWindow)();
    void authWindow.loadURL(CURSOR_USAGE_URL);
    await waitForCursorLogin(session.cookies, authWindow);
    return await refreshUsage();
  }

  async function clearAuth(): Promise<CursorDashboardDiagnostics> {
    await clearAuthSessionData(session);
    lastSyncAt = undefined;
    return {
      state: "not_connected",
      message: "未连接 Cursor Dashboard",
    };
  }

  return {
    getDiagnostics,
    refreshUsage,
    connectAndSync,
    clearAuth,
  };
}
