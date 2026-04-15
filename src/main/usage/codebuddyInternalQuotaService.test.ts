import { describe, expect, it, vi } from "vitest";
import { defaultAppSettings } from "../../shared/appSettings";
import {
  buildCodeBuddyInternalQuotaDiagnostics,
  buildCodeBuddyInternalQuotaSnapshot,
  createCodeBuddyInternalQuotaService,
} from "./codebuddyInternalQuotaService";

describe("codebuddyInternalQuotaService", () => {
  const config = {
    ...defaultAppSettings.codebuddy.enterprise,
    enabled: true,
    label: "CodeBuddy Enterprise",
    loginUrl: "https://codebuddy-enterprise.example.com/login",
    quotaEndpoint: "https://codebuddy-enterprise.example.com/api/quota",
    cookieNames: ["RIO_TOKEN", "tof_auth"],
  };

  it("reports missing configuration when login url or quota endpoint is empty", () => {
    expect(
      buildCodeBuddyInternalQuotaDiagnostics({
        config: {
          ...config,
          loginUrl: "",
          quotaEndpoint: "",
        },
        cookies: [],
      }),
    ).toEqual({
      kind: "internal",
      label: "CodeBuddy Enterprise",
      state: "not_connected",
      message: "请先在设置中配置 CodeBuddy Enterprise 的登录地址和额度地址",
      messageKey: "codebuddy.message.not_configured",
      messageParams: { label: "CodeBuddy Enterprise", fields: "登录地址和额度地址" },
      endpoint: "",
      loginUrl: "",
    });
  });

  it("reports connected when an auth cookie is present", () => {
    expect(
      buildCodeBuddyInternalQuotaDiagnostics({
        config,
        cookies: [{ name: "RIO_TOKEN", value: "secret" }],
      }),
    ).toEqual({
      kind: "internal",
      label: "CodeBuddy Enterprise",
      state: "connected",
      message: "已连接 CodeBuddy Enterprise 用量",
      messageKey: "codebuddy.message.connected",
      messageParams: { label: "CodeBuddy Enterprise" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
  });

  it("reports connected when tof session cookies are present", () => {
    expect(
      buildCodeBuddyInternalQuotaDiagnostics({
        config,
        cookies: [{ name: "tof_auth", value: "secret" }],
      }),
    ).toEqual({
      kind: "internal",
      label: "CodeBuddy Enterprise",
      state: "connected",
      message: "已连接 CodeBuddy Enterprise 用量",
      messageKey: "codebuddy.message.connected",
      messageParams: { label: "CodeBuddy Enterprise" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
  });

  it("builds a usage snapshot from internal quota response", () => {
    expect(
      buildCodeBuddyInternalQuotaSnapshot(
        {
          success: true,
          usage_percentage: 1.7198805,
          remaining_percentage: 98.28,
        },
        1_775_000_000_000,
        "CodeBuddy Enterprise",
      ),
    ).toMatchObject({
      agent: "codebuddy",
      sessionId: "codebuddy-internal-quota",
      title: "CodeBuddy Enterprise usage",
      rateLimit: {
        remaining: 98.28,
        limit: 100,
        usedPercent: 1.7198805,
        windowLabel: "enterprise",
        planType: "percent",
      },
    });
  });

  it("refreshes usage when configured", async () => {
    const onUsageSnapshot = vi.fn();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          usage_percentage: 1.7198805,
          remaining_percentage: 98.28,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const service = createCodeBuddyInternalQuotaService({
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
        kind: "internal",
        label: "CodeBuddy Enterprise",
        state: "connected",
        message: "已连接 CodeBuddy Enterprise 用量",
        messageKey: "codebuddy.message.connected",
        messageParams: { label: "CodeBuddy Enterprise" },
        endpoint: config.quotaEndpoint,
        loginUrl: config.loginUrl,
        lastSyncAt: 1_775_000_000_000,
      },
      synced: true,
    });
    expect(onUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "codebuddy",
        sessionId: "codebuddy-internal-quota",
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      config.quotaEndpoint,
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "RIO_TOKEN=secret",
        }),
      }),
    );
    const requestInit = fetchImpl.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(requestInit?.headers?.referer).toBeUndefined();
  });

  it("surfaces a configuration hint when login closes without establishing auth", async () => {
    let closedHandler: (() => void) | undefined;
    const service = createCodeBuddyInternalQuotaService({
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
        kind: "internal",
        label: "CodeBuddy Enterprise",
        state: "error",
        message:
          "CodeBuddy Enterprise 未检测到登录态，请确认登录已完成，或检查 settings.yaml 中的 loginUrl 是否正确",
        messageKey: "codebuddy.message.login_not_established",
        messageParams: { label: "CodeBuddy Enterprise" },
        endpoint: config.quotaEndpoint,
        loginUrl: config.loginUrl,
      },
      synced: false,
    });
  });

  it("clears the isolated codebuddy internal auth session", async () => {
    const clearStorageData = vi.fn(async () => undefined);
    const clearCache = vi.fn(async () => undefined);
    const service = createCodeBuddyInternalQuotaService({
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
      kind: "internal",
      label: "CodeBuddy Enterprise",
      state: "not_connected",
      message: "未连接 CodeBuddy Enterprise 用量，请在 CodePal 弹出的登录窗口内完成登录",
      messageKey: "codebuddy.message.not_connected",
      messageParams: { label: "CodeBuddy Enterprise" },
      endpoint: config.quotaEndpoint,
      loginUrl: config.loginUrl,
    });
    expect(clearStorageData).toHaveBeenCalledOnce();
    expect(clearCache).toHaveBeenCalledOnce();
  });

  it("does not open the auth window again when codebuddy enterprise is already connected", async () => {
    const createWindow = vi.fn();
    const service = createCodeBuddyInternalQuotaService({
      config,
      createWindow: createWindow as never,
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            usage_percentage: 1.7198805,
            remaining_percentage: 98.28,
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
    expect(createWindow).not.toHaveBeenCalled();
  });
});
