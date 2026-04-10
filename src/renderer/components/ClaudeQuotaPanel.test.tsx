import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClaudeQuotaDiagnostics } from "../../shared/claudeQuotaTypes";
import type { UsageOverview } from "../../shared/usageTypes";
import { I18nProvider } from "../i18n";
import { ClaudeQuotaPanel } from "./ClaudeQuotaPanel";

const overviewWithClaudeQuota: UsageOverview = {
  summary: {
    rateLimits: [{ agent: "claude", usedPercent: 22, resetAt: 1775635200, windowLabel: "5h" }],
    contextMode: "none",
  },
  sessions: [],
};

const connectedDiagnostics: ClaudeQuotaDiagnostics = {
  state: "connected",
  message: "已接收 Claude Code CLI quota",
  messageKey: "claudeQuota.message.connected",
  lastSyncAt: 1_776_000_000_000,
  source: "statusline-derived",
};

const disconnectedDiagnostics: ClaudeQuotaDiagnostics = {
  state: "not_connected",
  message: "尚未收到 Claude Code CLI rate_limits",
  messageKey: "claudeQuota.message.not_connected",
};

describe("ClaudeQuotaPanel", () => {
  it("renders synced state when a Claude quota snapshot exists", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <ClaudeQuotaPanel
          overview={overviewWithClaudeQuota}
          diagnostics={connectedDiagnostics}
          loading={false}
          onRefresh={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("Claude quota");
    expect(html).toContain("已收到 Claude quota 快照");
    expect(html).toContain("已接收 Claude Code CLI quota");
  });

  it("renders CLI guidance when no Claude Code rate_limits have been received", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <ClaudeQuotaPanel
          overview={null}
          diagnostics={disconnectedDiagnostics}
          loading={false}
          onRefresh={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("当前未收到 Claude quota 快照");
    expect(html).toContain("尚未收到 Claude Code CLI rate_limits");
    expect(html).toContain("请使用已接入 CodePal 的 Claude Code CLI 会话");
    expect(html).toContain(">刷新<");
  });
});
