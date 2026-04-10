import { describe, expect, it, vi } from "vitest";
import { defaultAppSettings } from "../../shared/appSettings";
import {
  buildCodeBuddyQuotaSnapshot,
  buildCodeBuddyQuotaDiagnostics,
  createCodeBuddyQuotaService,
} from "./codebuddyQuotaService";

describe("codebuddyQuotaService", () => {
  const config = defaultAppSettings.codebuddy.code;

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

  it("reports connected when the login session cookies are present", () => {
    expect(
      buildCodeBuddyQuotaDiagnostics({
        config,
        cookies: [{ name: "KEYCLOAK_SESSION", value: "secret" }],
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
      config.quotaEndpoint,
      expect.objectContaining({
        headers: expect.objectContaining({
          origin: new URL(config.loginUrl).origin,
          cookie: "RIO_TOKEN=secret",
        }),
      }),
    );
    const requestInit = fetchImpl.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(requestInit?.headers?.referer).toBeUndefined();
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
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
          on: vi.fn(),
          removeListener: vi.fn(),
        },
      } as never,
      onUsageSnapshot,
    });

    const resultPromise = service.connectAndSync();
    await Promise.resolve();
    closedHandler?.();
    const result = await resultPromise;

    expect(result.synced).toBe(true);
    expect(result.diagnostics.state).toBe("connected");
    expect(onUsageSnapshot).toHaveBeenCalledOnce();
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
    await Promise.resolve();
    closedHandler?.();
    const result = await resultPromise;

    expect(result).toEqual({
      diagnostics: {
        kind: "code",
        label: "CodeBuddy Code",
        state: "error",
        message:
          "CodeBuddy Code 未检测到登录态，请确认登录已完成，或检查 settings.yaml 中的 loginUrl 是否正确",
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
});
