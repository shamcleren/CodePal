import { describe, expect, it, vi } from "vitest";
import {
  buildCursorSpendSnapshot,
  buildCursorUsageDiagnostics,
  createCursorDashboardService,
} from "./cursorDashboardService";

describe("cursorDashboardService", () => {
  it("reports connected when auth and team cookies exist", () => {
    const diagnostics = buildCursorUsageDiagnostics([
      { name: "WorkosCursorSessionToken", value: "token" },
      { name: "team_id", value: "14634113" },
    ]);

    expect(diagnostics).toEqual({
      state: "connected",
      message: "已连接 Cursor Dashboard",
      messageKey: "cursor.message.connected",
      teamId: "14634113",
    });
  });

  it("reports not connected when required cookies are missing", () => {
    const diagnostics = buildCursorUsageDiagnostics([{ name: "team_id", value: "14634113" }]);

    expect(diagnostics).toEqual({
      state: "not_connected",
      message: "未连接 Cursor Dashboard",
      messageKey: "cursor.message.not_connected",
      teamId: "14634113",
    });
  });

  it("builds a cursor usage snapshot from dashboard spend data", () => {
    const snapshot = buildCursorSpendSnapshot(
      {
        maxUserSpendCents: 24425,
        nextCycleStart: "1777450344000",
        teamMemberSpend: [
          {
            userId: 297732718,
            spendCents: 24425,
            email: "shamcleren@tencent.com",
            hardLimitOverrideDollars: 960,
            effectivePerUserLimitDollars: 960,
          },
        ],
      },
      [
        { name: "team_id", value: "14634113" },
        { name: "WorkosCursorSessionToken", value: "token" },
      ],
      1_775_000_000_000,
    );

    expect(snapshot).toEqual({
      agent: "cursor",
      sessionId: "cursor-dashboard:14634113",
      source: "provider-derived",
      updatedAt: 1_775_000_000_000,
      title: "Cursor Dashboard spend",
      rateLimit: {
        remaining: 71575,
        limit: 96000,
        usedPercent: expect.closeTo(25.4427083333, 6),
        resetAt: 1777450344,
        windowLabel: "月度",
        planType: "usd-cents",
      },
      meta: {
        usedCents: 24425,
        limitCents: 96000,
      },
    });
  });

  it("returns null when the dashboard response lacks quota dimensions", () => {
    const snapshot = buildCursorSpendSnapshot(
      {
        maxUserSpendCents: 24425,
        teamMemberSpend: [{ spendCents: 24425 }],
      },
      [
        { name: "team_id", value: "14634113" },
        { name: "WorkosCursorSessionToken", value: "token" },
      ],
      1_775_000_000_000,
    );

    expect(snapshot).toBeNull();
  });

  it("marks dashboard auth as expired on unauthorized refresh responses", async () => {
    const service = createCursorDashboardService({
      fetchImpl: vi.fn(async () => new Response("expired", { status: 401, statusText: "Unauthorized" })),
      session: {
        cookies: {
          get: vi.fn(async () => [
            { name: "team_id", value: "14634113" },
            { name: "WorkosCursorSessionToken", value: "token" },
          ]),
        },
      } as never,
    });

    await expect(service.refreshUsage()).resolves.toEqual({
      diagnostics: {
        state: "expired",
        message: "Cursor 登录已过期，请重新登录",
        messageKey: "cursor.message.expired",
        teamId: "14634113",
      },
      synced: false,
    });
  });

  it("clears the isolated cursor auth session", async () => {
    const clearStorageData = vi.fn(async () => undefined);
    const clearCache = vi.fn(async () => undefined);
    const service = createCursorDashboardService({
      session: {
        clearStorageData,
        clearCache,
        cookies: {
          get: vi.fn(async () => []),
        },
      } as never,
    });

    await expect(service.clearAuth()).resolves.toEqual({
      state: "not_connected",
      message: "未连接 Cursor Dashboard",
      messageKey: "cursor.message.not_connected",
    });
    expect(clearStorageData).toHaveBeenCalledOnce();
    expect(clearCache).toHaveBeenCalledOnce();
  });
});
