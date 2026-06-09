import { describe, expect, it, vi } from "vitest";
import { defaultAppSettings } from "../../shared/appSettings";
import {
  buildCodeBuddyQuotaSnapshot,
  buildCodeBuddyQuotaDiagnostics,
  createCodeBuddyQuotaService,
} from "./codebuddyQuotaService";

describe("codebuddyQuotaService", () => {
  const config = {
    ...defaultAppSettings.codebuddy.code,
    loginUrl: "https://codebuddy-login.example.test/",
    quotaEndpoint: "https://codebuddy-quota.example.test/api/query-quota",
  };

  it("reports missing configuration when login url or quota endpoint is empty", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config: {
          ...config,
          loginUrl: "",
          quotaEndpoint: "",
        },
        cookies: [],
      }),
    ).toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "not_connected",
      message: "请先在设置中配置 CodeBuddy Code 的登录地址和额度地址",
      messageKey: "codebuddy.message.not_configured",
      messageParams: { label: "CodeBuddy Code", fields: "登录地址和额度地址" },
      endpoint: "",
      loginUrl: "",
    });
  });

  it("reports connected when an auth cookie is present", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config,
        cookies: [{ name: "RIO_TOKEN", value: "secret" }],
      }),
    ).toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "connected",
      message: "已连接 CodeBuddy Code 用量",
      messageKey: "codebuddy.message.connected",
      messageParams: { label: "CodeBuddy Code" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
  });

  it("reports connected when host-key auth cookies are present", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config,
        cookies: [{ name: "x-tofapi-host-key", value: "secret" }],
      }),
    ).toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "connected",
      message: "已连接 CodeBuddy Code 用量",
      messageKey: "codebuddy.message.connected",
      messageParams: { label: "CodeBuddy Code" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
  });

  it("does not report connected for login-entry cookies without quota-ready cookies", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config,
        cookies: [
          { name: "tof_auth", value: "secret" },
          { name: "KEYCLOAK_SESSION", value: "secret" },
        ],
      }),
    ).toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "not_connected",
      message: "未连接 CodeBuddy Code 用量，请在 CodePal 弹出的登录窗口内完成登录",
      messageKey: "codebuddy.message.not_connected",
      messageParams: { label: "CodeBuddy Code" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
  });

  it("allows custom-only auth cookie names when no quota-ready cookie is configured", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config: {
          ...config,
          quotaEndpoint: "https://custom-quota.example.test/quota",
          cookieNames: ["tof_auth"],
        },
        cookies: [{ name: "tof_auth", value: "secret" }],
      }),
    ).toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "connected",
      message: "已连接 CodeBuddy Code 用量",
      messageKey: "codebuddy.message.connected",
      messageParams: { label: "CodeBuddy Code" },
      endpoint: "https://custom-quota.example.test/quota",
      loginUrl: config.loginUrl,
    });
  });

  it("reports connected for legacy billing quota endpoints with login-entry auth cookies", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config: {
          ...config,
          quotaEndpoint: "https://codebuddy-quota.example.test/billing/meter/get-enterprise-user-usage",
        },
        cookies: [{ name: "tof_auth", value: "secret" }],
      }),
    ).toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "connected",
      message: "已连接 CodeBuddy Code 用量",
      messageKey: "codebuddy.message.connected",
      messageParams: { label: "CodeBuddy Code" },
      endpoint: "https://codebuddy-quota.example.test/billing/meter/get-enterprise-user-usage",
      loginUrl: config.loginUrl,
    });
  });

  it("does not treat pre-login bootstrap cookies as an authenticated session", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config,
        cookies: [
          { name: "timezone", value: "Asia/Shanghai" },
          { name: "x_host_key_access_https", value: "pre-login-host-key" },
          { name: "x-client-ssid", value: "pre-login-session" },
          { name: "tof_hn", value: "sso.example.test" },
        ],
      }),
    ).toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "not_connected",
      message: "未连接 CodeBuddy Code 用量，请在 CodePal 弹出的登录窗口内完成登录",
      messageKey: "codebuddy.message.not_connected",
      messageParams: { label: "CodeBuddy Code" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
  });

  it("reports not connected when no auth cookie is present", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config,
        cookies: [],
      }),
    ).toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "not_connected",
      message: "未连接 CodeBuddy Code 用量，请在 CodePal 弹出的登录窗口内完成登录",
      messageKey: "codebuddy.message.not_connected",
      messageParams: { label: "CodeBuddy Code" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
  });

  it("builds a usage snapshot from codebuddy ide quota response", () => {
    expect(
      buildCodeBuddyQuotaSnapshot(
        {
          code: 0,
          msg: "OK",
          data: {
            credit: 905.96,
            cycleStartTime: "2026-04-01 00:00:00",
            cycleEndTime: "2026-04-30 23:59:59",
            limitNum: 100000,
            cycleResetTime: "2026-05-01 00:00:00",
          },
        },
        1_775_000_000_000,
      ),
    ).toMatchObject({
      agent: "codebuddy",
      sessionId: "codebuddy-quota",
      source: "provider-derived",
      updatedAt: 1_775_000_000_000,
      title: "CodeBuddy Code usage",
      rateLimit: {
        remaining: 99094.04,
        limit: 100000,
        resetAt: 1_777_564_800,
        windowLabel: "月度",
        planType: "credits",
      },
      meta: {
        credit: 905.96,
        cycleStartTime: "2026-04-01 00:00:00",
        cycleEndTime: "2026-04-30 23:59:59",
        cycleResetTime: "2026-05-01 00:00:00",
        limitNum: 100000,
      },
    });
  });

  it("builds a usage snapshot from token quota response", () => {
    expect(
      buildCodeBuddyQuotaSnapshot(
        {
          success: true,
          quota_hidden: false,
          quota_hidden_confirmed: false,
          quota_hidden_unverified: false,
          total_usage_rate: 11.057129999999999,
          total_used: 773.9991,
          total_quota: 7000,
          product_used: 773.9991,
          product_quota: 7000,
          product_limit_disabled: false,
          usage_percentage: 11.057129999999999,
          group_usage_rate: 11.057129999999999,
          remaining_percentage_total: 88.94,
          remaining_percentage_category: 88.94,
          usage_percentage_default: 11.057129999999999,
          remaining_percentage: 88.94,
        },
        1_775_000_000_000,
      ),
    ).toMatchObject({
      agent: "codebuddy",
      sessionId: "codebuddy-quota",
      source: "provider-derived",
      updatedAt: 1_775_000_000_000,
      title: "CodeBuddy Code usage",
      rateLimit: {
        remaining: 6226.0009,
        limit: 7000,
        usedPercent: 11.057129999999999,
        windowLabel: "total",
        planType: "credits",
      },
      meta: {
        total_used: 773.9991,
        total_quota: 7000,
        total_usage_rate: 11.057129999999999,
        remaining_percentage_total: 88.94,
      },
    });
  });

  it("returns null when quota payload is unsuccessful", () => {
    expect(
      buildCodeBuddyQuotaSnapshot(
        {
          code: 1,
          msg: "failed",
        },
        1,
      ),
    ).toBeNull();
  });

  it("refreshes usage when configured", async () => {
    const onUsageSnapshot = vi.fn();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          total_usage_rate: 4.39306,
          total_used: 307.51419999999996,
          total_quota: 7000.0,
          remaining_percentage_total: 95.61,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      now: () => 1_775_000_000_000,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
      onUsageSnapshot,
    });

    await expect(service.refreshUsage()).resolves.toEqual({
      diagnostics: {
        kind: "code",
        label: "CodeBuddy Code",
        state: "connected",
        message: "已连接 CodeBuddy Code 用量",
        messageKey: "codebuddy.message.connected",
        messageParams: { label: "CodeBuddy Code" },
        endpoint: config.quotaEndpoint,
        loginUrl: config.loginUrl,
        lastSyncAt: 1_775_000_000_000,
      },
      synced: true,
    });
    expect(onUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "codebuddy",
        sessionId: "codebuddy-quota",
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `${config.quotaEndpoint}?platform=codebuddy&_t=1775000000000`,
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "cache-control": "no-cache",
          cookie: "RIO_TOKEN=secret",
          pragma: "no-cache",
          priority: "u=1, i",
          referer: "https://codebuddy-login.example.test/",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        }),
      }),
    );
    const requestInit = fetchImpl.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(requestInit?.headers?.origin).toBeUndefined();
  });

  it("falls back to browser-context fetch for token quota endpoints blocked by fetch-site checks", async () => {
    const onUsageSnapshot = vi.fn();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          code: "invalid_fetch_site",
          message: "Forbidden",
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    const loadURL = vi.fn(async () => undefined);
    const close = vi.fn();
    const executeJavaScript = vi.fn(async (code: string) => {
      if (code.includes("fetch(")) {
        return {
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            success: true,
            total_usage_rate: 4.39306,
            total_used: 307.51419999999996,
            total_quota: 7000.0,
            remaining_percentage_total: 95.61,
          }),
        };
      }
      return "page-token";
    });
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      now: () => 1_775_000_000_000,
      createWindow: () =>
        ({
          loadURL,
          isDestroyed: vi.fn(() => false),
          close,
          webContents: {
            executeJavaScript,
          },
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
      onUsageSnapshot,
    });

    await expect(service.refreshUsage()).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });

    expect(loadURL).toHaveBeenCalledWith("https://codebuddy-quota.example.test");
    expect(executeJavaScript).toHaveBeenCalledTimes(2);
    expect(executeJavaScript.mock.calls[1]?.[0]).toContain(
      "/api/query-quota?platform=codebuddy&_t=1775000000000",
    );
    expect(executeJavaScript.mock.calls[1]?.[0]).toContain('"x-page-token": "page-token"');
    expect(onUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "codebuddy",
        sessionId: "codebuddy-quota",
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back when Electron session fetch rejects token quota headers", async () => {
    const onUsageSnapshot = vi.fn();
    const sessionFetch = vi.fn(async () => {
      throw new Error("net::ERR_INVALID_ARGUMENT");
    });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          code: "invalid_fetch_site",
          message: "Forbidden",
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    const loadURL = vi.fn(async () => undefined);
    const close = vi.fn();
    const executeJavaScript = vi.fn(async (code: string) => {
      if (code.includes("fetch(")) {
        return {
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            success: true,
            total_usage_rate: 4.39306,
            total_used: 307.51419999999996,
            total_quota: 7000.0,
            remaining_percentage_total: 95.61,
          }),
        };
      }
      return "page-token";
    });
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      now: () => 1_775_000_000_000,
      createWindow: () =>
        ({
          loadURL,
          isDestroyed: vi.fn(() => false),
          close,
          webContents: {
            executeJavaScript,
          },
        }) as never,
      session: {
        fetch: sessionFetch,
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
      onUsageSnapshot,
    });

    await expect(service.refreshUsage()).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });

    expect(sessionFetch).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(loadURL).toHaveBeenCalledWith("https://codebuddy-quota.example.test");
    expect(onUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "codebuddy",
        sessionId: "codebuddy-quota",
        rateLimit: expect.objectContaining({
          limit: 7000,
          usedPercent: 4.39306,
        }),
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back to browser-context fetch when token quota responses omit quota fields", async () => {
    const onUsageSnapshot = vi.fn();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, code: "missing_page_token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const loadURL = vi.fn(async () => undefined);
    const close = vi.fn();
    const executeJavaScript = vi.fn(async (code: string) => {
      if (code.includes("fetch(")) {
        return {
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            success: true,
            total_usage_rate: 11.057129999999999,
            total_used: 773.9991,
            total_quota: 7000,
            remaining_percentage_total: 88.94,
          }),
        };
      }
      return "page-token";
    });
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      now: () => 1_775_000_000_000,
      createWindow: () =>
        ({
          loadURL,
          isDestroyed: vi.fn(() => false),
          close,
          webContents: {
            executeJavaScript,
          },
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
      onUsageSnapshot,
    });

    await expect(service.refreshUsage()).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });

    expect(loadURL).toHaveBeenCalledWith("https://codebuddy-quota.example.test");
    expect(executeJavaScript.mock.calls.at(-1)?.[0]).toContain(
      "/api/query-quota?platform=codebuddy&_t=1775000000000",
    );
    expect(onUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "codebuddy",
        sessionId: "codebuddy-quota",
        rateLimit: expect.objectContaining({
          limit: 7000,
          usedPercent: 11.057129999999999,
        }),
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses page tokens captured from browser-context request headers during fallback fetch", async () => {
    let beforeSendHeadersListener:
      | ((details: { requestHeaders?: Record<string, string> }, callback: (response: unknown) => void) => void)
      | undefined;
    const onBeforeSendHeaders = vi.fn((_: unknown, listener: typeof beforeSendHeadersListener | null) => {
      beforeSendHeadersListener = listener ?? undefined;
    });
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, code: "missing_page_token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const loadURL = vi.fn(async () => {
      beforeSendHeadersListener?.(
        { requestHeaders: { "X-Page-Token": "header-token" } },
        vi.fn(),
      );
    });
    const close = vi.fn();
    const executeJavaScript = vi.fn(async (code: string) => {
      if (code.includes("fetch(")) {
        return {
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            success: true,
            total_usage_rate: 11.057129999999999,
            total_used: 773.9991,
            total_quota: 7000,
            remaining_percentage_total: 88.94,
          }),
        };
      }
      return undefined;
    });
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      createWindow: () =>
        ({
          loadURL,
          isDestroyed: vi.fn(() => false),
          close,
          webContents: {
            executeJavaScript,
          },
        }) as never,
      session: {
        webRequest: {
          onBeforeSendHeaders,
        },
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
    });

    await expect(service.refreshUsage()).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });

    expect(executeJavaScript.mock.calls.at(-1)?.[0]).toContain(
      '"x-page-token": "header-token"',
    );
    expect(onBeforeSendHeaders).toHaveBeenLastCalledWith(expect.any(Object), null);
    expect(close).toHaveBeenCalledOnce();
  });

  it("retries browser-context token quota fetch after the page token appears", async () => {
    const onUsageSnapshot = vi.fn();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          code: "invalid_fetch_site",
          message: "Forbidden",
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    const loadURL = vi.fn(async () => undefined);
    const close = vi.fn();
    let extractionCount = 0;
    const executeJavaScript = vi.fn(async (code: string) => {
      if (code.includes("fetch(")) {
        const hasPageToken = code.includes('"x-page-token": "page-token"');
        return hasPageToken
          ? {
              status: 200,
              statusText: "OK",
              contentType: "application/json",
              text: JSON.stringify({
                success: true,
                total_usage_rate: 4.39306,
                total_used: 307.51419999999996,
                total_quota: 7000.0,
                remaining_percentage_total: 95.61,
              }),
            }
          : {
              status: 403,
              statusText: "Forbidden",
              contentType: "application/json",
              text: JSON.stringify({
                success: false,
                code: "invalid_fetch_site",
                message: "Forbidden",
              }),
            };
      }
      extractionCount += 1;
      return extractionCount > 1 ? "page-token" : undefined;
    });
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      now: () => 1_775_000_000_000,
      createWindow: () =>
        ({
          loadURL,
          isDestroyed: vi.fn(() => false),
          close,
          webContents: {
            executeJavaScript,
          },
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
      onUsageSnapshot,
    });

    await expect(service.refreshUsage()).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });

    expect(executeJavaScript).toHaveBeenCalledTimes(4);
    expect(executeJavaScript.mock.calls.at(-1)?.[0]).toContain('"x-page-token": "page-token"');
    expect(onUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "codebuddy",
        sessionId: "codebuddy-quota",
        rateLimit: expect.objectContaining({
          limit: 7000,
          usedPercent: 4.39306,
        }),
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("marks the quota as connected once refresh succeeds even if cookie names are non-standard", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 0,
          msg: "OK",
          data: {
            credit: 905.96,
            cycleStartTime: "2026-04-01 00:00:00",
            cycleEndTime: "2026-04-30 23:59:59",
            limitNum: 100000,
            cycleResetTime: "2026-05-01 00:00:00",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      now: () => 1_775_000_000_000,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "foo", value: "bar" }]),
        },
      } as never,
    });

    const result = await service.refreshUsage();

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.synced).toBe(true);
    expect(result.diagnostics.state).toBe("connected");
  });

  it("does not expose enterpriseId or cookie names in quota error messages", async () => {
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl: vi.fn(async () => new Response("bad request", { status: 400, statusText: "Bad Request" })),
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
    });

    const result = await service.refreshUsage();

    expect(result.synced).toBe(false);
    expect(result.diagnostics.state).toBe("error");
    expect(result.diagnostics.message).toBe("CodeBuddy Code 用量拉取失败，请重新登录后重试");
    expect(result.diagnostics.message).not.toContain("enterpriseId");
    expect(result.diagnostics.message).not.toContain("cookies");
  });

  it("ignores ERR_ABORTED from login navigation and continues syncing", async () => {
    const onUsageSnapshot = vi.fn();
    let closedHandler: (() => void) | undefined;
    const getCookies = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: "RIO_TOKEN", value: "secret" }])
      .mockResolvedValue([{ name: "RIO_TOKEN", value: "secret" }]);
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 0,
            msg: "OK",
            data: {
              credit: 905.96,
              cycleStartTime: "2026-04-01 00:00:00",
              cycleEndTime: "2026-04-30 23:59:59",
              limitNum: 100000,
              cycleResetTime: "2026-05-01 00:00:00",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
      now: () => 1_775_000_000_000,
      createWindow: () =>
        ({
          loadURL: vi.fn(async () => {
            throw new Error("ERR_ABORTED (-3) loading 'https://example.test'");
          }),
          isDestroyed: vi.fn(() => false),
          close: vi.fn(),
          on: vi.fn((event: string, handler: () => void) => {
            if (event === "closed") {
              closedHandler = handler;
            }
          }),
        }) as never,
      session: {
        cookies: {
          get: getCookies,
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
      onUsageSnapshot,
    });

    const resultPromise = service.connectAndSync();
    await vi.waitFor(() => {
      expect(closedHandler).toBeTypeOf("function");
    });
    closedHandler?.();
    const result = await resultPromise;

    expect(result.synced).toBe(true);
    expect(result.diagnostics.state).toBe("connected");
    expect(onUsageSnapshot).toHaveBeenCalledOnce();
  });

  it("does not report token quota diagnostics as connected until quota fetch succeeds", async () => {
    const service = createCodeBuddyQuotaService({
      config,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
    });

    await expect(service.getDiagnostics()).resolves.toMatchObject({
      state: "not_connected",
      messageKey: "codebuddy.message.not_verified",
    });
  });

  it("uses interactive login cookies for token quota sync after the login page loads", async () => {
    let didFinishLoadHandler: (() => void) | undefined;
    const close = vi.fn();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          total_usage_rate: 4.39306,
          total_used: 307.51419999999996,
          total_quota: 7000.0,
          remaining_percentage_total: 95.61,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      createWindow: () =>
        ({
          loadURL: vi.fn(async () => undefined),
          isDestroyed: vi.fn(() => false),
          close,
          on: vi.fn(),
          once: vi.fn(),
          show: vi.fn(),
          webContents: {
            on: vi.fn((event: string, handler: () => void) => {
              if (event === "did-finish-load") {
                didFinishLoadHandler = handler;
              }
            }),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => undefined),
          },
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "tof_auth", value: "entry-only" }]),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    const resultPromise = service.connectAndSync();
    await vi.waitFor(() => {
      expect(didFinishLoadHandler).toBeTypeOf("function");
    });

    didFinishLoadHandler?.();
    const result = await resultPromise;

    expect(result.synced).toBe(true);
    expect(result.diagnostics.state).toBe("connected");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const requestInit = fetchImpl.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(requestInit?.headers?.cookie).toBe("tof_auth=entry-only");
    expect(close).toHaveBeenCalledOnce();
  });

  it("shows a local loading page before slow login navigation finishes", async () => {
    let closedHandler: (() => void) | undefined;
    let resolveRemoteLoad: (() => void) | undefined;
    let loadingPageUrl = "";
    const show = vi.fn();
    const loadURL = vi.fn((url: string) => {
      if (url === config.loginUrl) {
        return new Promise<void>((resolve) => {
          resolveRemoteLoad = resolve;
        });
      }
      loadingPageUrl = url;
      return Promise.resolve();
    });
    const service = createCodeBuddyQuotaService({
      config,
      createWindow: () =>
        ({
          loadURL,
          show,
          isDestroyed: vi.fn(() => false),
          close: vi.fn(),
          on: vi.fn((event: string, handler: () => void) => {
            if (event === "closed") {
              closedHandler = handler;
            }
          }),
          once: vi.fn(),
          webContents: {
            on: vi.fn(),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => undefined),
          },
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => []),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    const resultPromise = service.connectAndSync();
    await vi.waitFor(() => {
      expect(loadingPageUrl).toContain("data:text/html");
      expect(resolveRemoteLoad).toBeTypeOf("function");
      expect(closedHandler).toBeTypeOf("function");
    });

    expect(decodeURIComponent(loadingPageUrl)).toContain("正在打开 CodeBuddy 登录页");
    expect(show).toHaveBeenCalledOnce();

    resolveRemoteLoad?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(show).toHaveBeenCalledOnce();
    closedHandler?.();
    await resultPromise;
  });

  it("shows a readable error page when the CodeBuddy login page fails to load", async () => {
    let closedHandler: (() => void) | undefined;
    let didFinishLoadHandler: (() => void) | undefined;
    const dataPageUrls: string[] = [];
    const show = vi.fn();
    const loadURL = vi.fn(async (url: string) => {
      if (url === config.loginUrl) {
        throw new Error("ERR_SSL_PROTOCOL_ERROR (-107) loading 'https://token.woa.com/'");
      }
      dataPageUrls.push(url);
      didFinishLoadHandler?.();
    });
    const service = createCodeBuddyQuotaService({
      config,
      createWindow: () =>
        ({
          loadURL,
          show,
          isDestroyed: vi.fn(() => false),
          close: vi.fn(),
          on: vi.fn((event: string, handler: () => void) => {
            if (event === "closed") {
              closedHandler = handler;
            }
          }),
          once: vi.fn(),
          webContents: {
            on: vi.fn((_event: string, handler: () => void) => {
              if (_event === "did-finish-load") {
                didFinishLoadHandler = handler;
              }
            }),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => undefined),
          },
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => []),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    const resultPromise = service.connectAndSync();
    await vi.waitFor(() => {
      expect(loadURL).toHaveBeenCalledWith(config.loginUrl);
      expect(
        dataPageUrls.some((url) =>
          decodeURIComponent(url).includes("CodeBuddy 登录页打开失败"),
        ),
      ).toBe(true);
    });

    const loginErrorPageUrl =
      dataPageUrls.find((url) =>
        decodeURIComponent(url).includes("CodeBuddy 登录页打开失败"),
      ) ?? "";
    expect(dataPageUrls.some((url) => decodeURIComponent(url).includes("正在打开"))).toBe(true);
    expect(decodeURIComponent(loginErrorPageUrl)).toContain("CodeBuddy 登录页打开失败");
    expect(decodeURIComponent(loginErrorPageUrl)).toContain("ERR_SSL_PROTOCOL_ERROR");
    expect(show).toHaveBeenCalledOnce();

    closedHandler?.();
    await expect(resultPromise).resolves.toMatchObject({
      synced: false,
      diagnostics: {
        state: "error",
        messageKey: "codebuddy.message.open_failed",
      },
    });
  });

  it("returns when the login window closes before the login page finishes loading", async () => {
    const closedHandlers: Array<() => void> = [];
    const service = createCodeBuddyQuotaService({
      config,
      createWindow: () =>
        ({
          loadURL: vi.fn(() => new Promise<void>(() => undefined)),
          show: vi.fn(),
          isDestroyed: vi.fn(() => false),
          close: vi.fn(),
          on: vi.fn((event: string, handler: () => void) => {
            if (event === "closed") {
              closedHandlers.push(handler);
            }
          }),
          once: vi.fn((event: string, handler: () => void) => {
            if (event === "closed") {
              closedHandlers.push(handler);
            }
          }),
          webContents: {
            on: vi.fn(),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => undefined),
          },
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => []),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    const resultPromise = service.connectAndSync();
    await vi.waitFor(() => {
      expect(closedHandlers.length).toBeGreaterThanOrEqual(2);
    });

    closedHandlers.forEach((handler) => handler());

    await expect(resultPromise).resolves.toMatchObject({
      synced: false,
      diagnostics: {
        state: "error",
        messageKey: "codebuddy.message.login_not_established",
      },
    });
  });

  it("surfaces a configuration hint when login closes without establishing auth", async () => {
    let closedHandler: (() => void) | undefined;
    const service = createCodeBuddyQuotaService({
      config,
      createWindow: () =>
        ({
          loadURL: vi.fn(async () => undefined),
          isDestroyed: vi.fn(() => false),
          close: vi.fn(),
          on: vi.fn((event: string, handler: () => void) => {
            if (event === "closed") {
              closedHandler = handler;
            }
          }),
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => []),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    const resultPromise = service.connectAndSync();
    await vi.waitFor(() => {
      expect(closedHandler).toBeTypeOf("function");
    });
    closedHandler?.();
    const result = await resultPromise;

    expect(result).toEqual({
      diagnostics: {
        kind: "code",
        label: "CodeBuddy Code",
        state: "error",
        message:
          "CodeBuddy Code 未检测到登录态，请确认登录已完成，或检查设置中的登录地址是否正确",
        messageKey: "codebuddy.message.login_not_established",
        messageParams: { label: "CodeBuddy Code" },
        endpoint: config.quotaEndpoint,
        loginUrl: config.loginUrl,
      },
      synced: false,
    });
  });

  it("clears the isolated codebuddy code auth session", async () => {
    const clearStorageData = vi.fn(async () => undefined);
    const clearCache = vi.fn(async () => undefined);
    const service = createCodeBuddyQuotaService({
      config,
      session: {
        clearStorageData,
        clearCache,
        cookies: {
          get: vi.fn(async () => []),
        },
      } as never,
    });

    await expect(service.clearAuth()).resolves.toEqual({
      kind: "code",
      label: "CodeBuddy Code",
      state: "not_connected",
      message: "未连接 CodeBuddy Code 用量，请在 CodePal 弹出的登录窗口内完成登录",
      messageKey: "codebuddy.message.not_connected",
      messageParams: { label: "CodeBuddy Code" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
    expect(clearStorageData).toHaveBeenCalledOnce();
    expect(clearCache).toHaveBeenCalledOnce();
  });

  it("opens the auth window on relogin even when codebuddy code cookies already exist", async () => {
    const loadURL = vi.fn(async () => undefined);
    const close = vi.fn();
    const createWindow = vi.fn(
      () =>
        ({
          loadURL,
          show: vi.fn(),
          isDestroyed: vi.fn(() => false),
          close,
          once: vi.fn(),
          on: vi.fn(),
          webContents: {
            on: vi.fn(),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => "page-token"),
          },
        }) as never,
    );
    const service = createCodeBuddyQuotaService({
      config,
      createWindow,
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            total_usage_rate: 4.39306,
            total_used: 307.51419999999996,
            total_quota: 7000.0,
            remaining_percentage_total: 95.61,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
      now: () => 1_775_000_000_000,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
    });

    const result = await service.connectAndSync();

    expect(result.diagnostics.state).toBe("connected");
    expect(createWindow).toHaveBeenCalledOnce();
    expect(loadURL).toHaveBeenCalledWith(config.loginUrl);
    expect(close).toHaveBeenCalledOnce();
  });

  it("waits for the login page before refreshing with existing token quota cookies", async () => {
    let resolveLoad: (() => void) | undefined;
    let loadResolved = false;
    const close = vi.fn();
    const executeJavaScript = vi.fn(async () => (loadResolved ? "page-token" : undefined));
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      return new Response(
        JSON.stringify(
          headers?.["x-page-token"] === "page-token"
            ? {
                success: true,
                total_usage_rate: 4.39306,
                total_used: 307.51419999999996,
                total_quota: 7000.0,
                remaining_percentage_total: 95.61,
              }
            : {
                success: false,
                code: "missing_page_token",
              },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      createWindow: () =>
        ({
          loadURL: vi.fn((url: string) => {
            if (url !== config.loginUrl) {
              return Promise.resolve();
            }
            return (
              new Promise<void>((resolve) => {
                resolveLoad = () => {
                  loadResolved = true;
                  resolve();
                };
              })
            );
          }),
          show: vi.fn(),
          isDestroyed: vi.fn(() => false),
          close,
          once: vi.fn(),
          on: vi.fn(),
          webContents: {
            on: vi.fn(),
            removeListener: vi.fn(),
            executeJavaScript,
          },
        }) as never,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    const resultPromise = service.connectAndSync();
    await vi.waitFor(() => {
      expect(resolveLoad).toBeTypeOf("function");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchImpl).not.toHaveBeenCalled();

    resolveLoad?.();
    await expect(resultPromise).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });
    const requestInit = fetchImpl.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(requestInit?.headers?.["x-page-token"]).toBe("page-token");
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the login window open when quota refresh fails after auth cookies appear", async () => {
    const loginClose = vi.fn();
    const fallbackClose = vi.fn();
    let createWindowCalls = 0;
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl: vi.fn(async () =>
        new Response(JSON.stringify({ success: false, code: "missing_page_token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
      createWindow: () => {
        createWindowCalls += 1;
        const close = createWindowCalls > 1 ? fallbackClose : loginClose;
        return {
          loadURL: vi.fn(async () => undefined),
          show: vi.fn(),
          isDestroyed: vi.fn(() => false),
          close,
          once: vi.fn(),
          on: vi.fn(),
          webContents: {
            on: vi.fn(),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => undefined),
          },
        } as never;
      },
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    await expect(service.connectAndSync()).resolves.toMatchObject({
      synced: false,
      diagnostics: { state: "error" },
    });
    expect(loginClose).not.toHaveBeenCalled();
    expect(fallbackClose).toHaveBeenCalledOnce();
  });

  it("sends page token captured during login", async () => {
    let closedHandler: (() => void) | undefined;
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          total_usage_rate: 4.39306,
          total_used: 307.51419999999996,
          total_quota: 7000.0,
          remaining_percentage_total: 95.61,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const getCookies = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: "RIO_TOKEN", value: "secret" }])
      .mockResolvedValue([{ name: "RIO_TOKEN", value: "secret" }]);
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      now: () => 1_775_000_000_000,
      createWindow: () =>
        ({
          loadURL: vi.fn(async () => undefined),
          isDestroyed: vi.fn(() => false),
          close: vi.fn(),
          on: vi.fn((event: string, handler: () => void) => {
            if (event === "closed") {
              closedHandler = handler;
            }
          }),
          webContents: {
            on: vi.fn(),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => "page-token"),
          },
        }) as never,
      session: {
        cookies: {
          get: getCookies,
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    const resultPromise = service.connectAndSync();
    await vi.waitFor(() => {
      expect(closedHandler).toBeTypeOf("function");
    });
    closedHandler?.();
    await expect(resultPromise).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });

    const requestInit = fetchImpl.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(requestInit?.headers?.["x-page-token"]).toBe("page-token");
  });

  it("sends page token captured from login request headers", async () => {
    let beforeSendHeadersListener:
      | ((details: { requestHeaders?: Record<string, string> }, callback: (response: unknown) => void) => void)
      | undefined;
    const onBeforeSendHeaders = vi.fn((_: unknown, listener: typeof beforeSendHeadersListener | null) => {
      beforeSendHeadersListener = listener ?? undefined;
    });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          total_usage_rate: 4.39306,
          total_used: 307.51419999999996,
          total_quota: 7000.0,
          remaining_percentage_total: 95.61,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl,
      createWindow: () =>
        ({
          loadURL: vi.fn(async () => {
            beforeSendHeadersListener?.(
              { requestHeaders: { "x-page-token": "header-token" } },
              vi.fn(),
            );
          }),
          isDestroyed: vi.fn(() => false),
          close: vi.fn(),
          once: vi.fn(),
          on: vi.fn(),
          webContents: {
            on: vi.fn(),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => undefined),
          },
        }) as never,
      session: {
        webRequest: {
          onBeforeSendHeaders,
        },
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
    });

    await expect(service.connectAndSync()).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });

    const requestInit = fetchImpl.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(requestInit?.headers?.["x-page-token"]).toBe("header-token");
    expect(onBeforeSendHeaders).toHaveBeenLastCalledWith(expect.any(Object), null);
  });
});
