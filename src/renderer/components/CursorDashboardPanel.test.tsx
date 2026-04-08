import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CursorDashboardDiagnostics } from "../../shared/cursorDashboardTypes";
import { I18nProvider } from "../i18n";
import { CursorDashboardPanel } from "./CursorDashboardPanel";

const connected: CursorDashboardDiagnostics = {
  state: "connected",
  message: "已连接 Cursor Dashboard",
  messageKey: "cursor.message.connected",
  teamId: "14634113",
  lastSyncAt: Date.parse("2026-04-03T20:51:00.000Z"),
};

describe("CursorDashboardPanel", () => {
  it("renders connected status and refresh action", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <CursorDashboardPanel
          diagnostics={connected}
          loading={false}
          onConnect={vi.fn()}
          onRefresh={vi.fn()}
          onClearAuth={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("Cursor 用量");
    expect(html).toContain("已连接 Cursor Dashboard");
    expect(html).toContain("Team 14634113");
    expect(html).toContain(">刷新<");
    expect(html).toContain(">删除登录态<");
  });

  it("renders login action when not connected", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <CursorDashboardPanel
          diagnostics={{
            state: "not_connected",
            message: "未连接 Cursor Dashboard",
            messageKey: "cursor.message.not_connected",
          }}
          loading={false}
          onConnect={vi.fn()}
          onRefresh={vi.fn()}
          onClearAuth={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain(">Log in to Cursor<");
    expect(html).not.toContain(">删除登录态<");
  });

  it("renders reconnect action when the dashboard session expired", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <CursorDashboardPanel
          diagnostics={{
            state: "expired",
            message: "Cursor 登录已过期，请重新登录",
            messageKey: "cursor.message.expired",
          }}
          loading={false}
          onConnect={vi.fn()}
          onRefresh={vi.fn()}
          onClearAuth={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("Cursor login expired. Please log in again");
    expect(html).toContain(">Re-login Cursor<");
    expect(html).toContain(">Clear login state<");
  });
});
