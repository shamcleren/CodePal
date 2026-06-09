import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAppSettings } from "../../shared/appSettings";

const electronMocks = vi.hoisted(() => ({
  BrowserWindow: vi.fn(),
  fromPartition: vi.fn(),
  getAllWindows: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: Object.assign(electronMocks.BrowserWindow, {
    getAllWindows: electronMocks.getAllWindows,
  }),
  session: {
    fromPartition: electronMocks.fromPartition,
  },
}));

describe("codebuddyQuotaService window creation", () => {
  const config = {
    ...defaultAppSettings.codebuddy.code,
    loginUrl: "https://codebuddy-login.example.test/",
    quotaEndpoint: "https://codebuddy-quota.example.test/api/query-quota",
  };

  beforeEach(() => {
    electronMocks.BrowserWindow.mockReset();
    electronMocks.fromPartition.mockReset();
    electronMocks.getAllWindows.mockReset();
  });

  it("keeps the default hidden quota window detached from existing app windows", async () => {
    const mainWindow = { isDestroyed: vi.fn(() => false) };
    const close = vi.fn();
    const executeJavaScript = vi.fn(async (code: string) => {
      if (!code.includes("fetch(")) {
        return "page-token";
      }
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
    });

    electronMocks.getAllWindows.mockReturnValue([mainWindow]);
    electronMocks.BrowserWindow.mockImplementation(
      () =>
        ({
          loadURL: vi.fn(async () => undefined),
          isDestroyed: vi.fn(() => false),
          close,
          webContents: {
            executeJavaScript,
          },
        }) as never,
    );

    const { createCodeBuddyQuotaService } = await import("./codebuddyQuotaService");
    const service = createCodeBuddyQuotaService({
      config,
      fetchImpl: vi.fn(async () =>
        new Response(JSON.stringify({ success: false, code: "invalid_fetch_site" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      ),
      now: () => 1_775_000_000_000,
      session: {
        cookies: {
          get: vi.fn(async () => [{ name: "RIO_TOKEN", value: "secret" }]),
        },
      } as never,
    });

    await expect(service.refreshUsage()).resolves.toMatchObject({
      synced: true,
      diagnostics: { state: "connected" },
    });

    expect(electronMocks.getAllWindows).not.toHaveBeenCalled();
    expect(electronMocks.BrowserWindow).toHaveBeenCalledWith(
      expect.not.objectContaining({
        parent: mainWindow,
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the default login window detached when successful login auto-closes", async () => {
    const mainWindow = { isDestroyed: vi.fn(() => false) };
    const close = vi.fn();

    electronMocks.getAllWindows.mockReturnValue([mainWindow]);
    electronMocks.BrowserWindow.mockImplementation(
      () =>
        ({
          loadURL: vi.fn(async () => undefined),
          show: vi.fn(),
          isDestroyed: vi.fn(() => false),
          close,
          on: vi.fn(),
          once: vi.fn(),
          webContents: {
            on: vi.fn(),
            removeListener: vi.fn(),
            executeJavaScript: vi.fn(async () => "page-token"),
          },
        }) as never,
    );

    const { createCodeBuddyQuotaService } = await import("./codebuddyQuotaService");
    const service = createCodeBuddyQuotaService({
      config,
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
      session: {
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

    expect(electronMocks.BrowserWindow).toHaveBeenCalledWith(
      expect.not.objectContaining({
        parent: mainWindow,
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
