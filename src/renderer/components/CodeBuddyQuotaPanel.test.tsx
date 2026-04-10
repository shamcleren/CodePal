import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodeBuddyQuotaDiagnostics } from "../../shared/codebuddyQuotaTypes";
import { I18nProvider } from "../i18n";
import { CodeBuddyQuotaPanel } from "./CodeBuddyQuotaPanel";

const connected: CodeBuddyQuotaDiagnostics = {
  kind: "code",
  label: "CodeBuddy Code",
  state: "connected",
  message: "已连接 CodeBuddy Code 用量",
  messageKey: "codebuddy.message.connected",
  messageParams: { label: "CodeBuddy Code" },
  endpoint: "https://tencent.sso.codebuddy.cn/billing/meter/get-enterprise-user-usage",
  loginUrl: "https://tencent.sso.codebuddy.cn/profile/usage",
  lastSyncAt: Date.parse("2026-04-03T20:51:00.000Z"),
};

describe("CodeBuddyQuotaPanel", () => {
  it("renders connected actions including clear auth", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <CodeBuddyQuotaPanel
          diagnostics={connected}
          loading={false}
          onConnect={vi.fn()}
          onRefresh={vi.fn()}
          onClearAuth={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("CodeBuddy Code 用量");
    expect(html).toContain("已连接 CodeBuddy Code 用量");
    expect(html).toContain(">刷新<");
    expect(html).toContain(">删除登录态<");
  });

  it("renders reconnect action and clear auth for expired sessions", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <CodeBuddyQuotaPanel
          diagnostics={{
            kind: "internal",
            label: "CodeBuddy Enterprise",
            state: "expired",
            message: "CodeBuddy Enterprise 登录已过期，请重新登录",
            messageKey: "codebuddy.message.expired",
            messageParams: { label: "CodeBuddy Enterprise" },
            endpoint: "https://codebuddy-enterprise.example.com/api/quota",
            loginUrl: "https://codebuddy-enterprise.example.com/login",
          }}
          loading={false}
          onConnect={vi.fn()}
          onRefresh={vi.fn()}
          onClearAuth={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain(">Re-login CodeBuddy<");
    expect(html).toContain(">Clear login state<");
  });

  it("does not render clear auth when not connected", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <CodeBuddyQuotaPanel
          diagnostics={{
            kind: "code",
            label: "CodeBuddy Code",
            state: "not_connected",
            message: "未连接 CodeBuddy Code 用量",
            messageKey: "codebuddy.message.not_connected",
            messageParams: { label: "CodeBuddy Code" },
            endpoint: "https://tencent.sso.codebuddy.cn/billing/meter/get-enterprise-user-usage",
            loginUrl: "https://tencent.sso.codebuddy.cn/profile/usage",
          }}
          loading={false}
          onConnect={vi.fn()}
          onRefresh={vi.fn()}
          onClearAuth={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain(">Log in to CodeBuddy<");
    expect(html).not.toContain(">Clear login state<");
  });

  it("disables login when configuration is incomplete", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <CodeBuddyQuotaPanel
          diagnostics={{
            kind: "code",
            label: "CodeBuddy Code",
            state: "not_connected",
            message: "请先在设置中配置 CodeBuddy Code 的登录地址和额度地址",
            messageKey: "codebuddy.message.not_configured",
            messageParams: { label: "CodeBuddy Code", fields: "登录地址和额度地址" },
            endpoint: "",
            loginUrl: "",
          }}
          loading={false}
          onConnect={vi.fn()}
          onRefresh={vi.fn()}
          onClearAuth={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("Configure the 登录地址和额度地址 for CodeBuddy Code in settings first");
    expect(html).toContain(">Configure login URL first<");
    expect(html).toContain("disabled");
  });
});
