import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { HistorySettingsPanel } from "./HistorySettingsPanel";

describe("HistorySettingsPanel", () => {
  it("renders persisted history controls and diagnostics", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <HistorySettingsPanel
          settings={{
            persistenceEnabled: true,
            detailRetention: "30d",
            analyticsRetention: "forever",
          }}
          diagnostics={{
            enabled: true,
            dbPath: "/tmp/history.sqlite",
            dbSizeBytes: 2048,
            estimatedSessionCount: 3,
            estimatedActivityCount: 10,
            lastCleanupAt: Date.parse("2026-04-09T12:00:00.000Z"),
          }}
          loading={false}
          sessionHistoryLoading={false}
          onUpdate={vi.fn()}
          onClear={vi.fn()}
          onClearSessionHistory={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("Persisted History");
    expect(html).toContain("Detailed Session Retention");
    expect(html).toContain("Analytics Retention");
    expect(html).toContain("Forever");
    expect(html).toContain("Current DB Size: 2.0 KB");
    expect(html).toContain("Stored Sessions: 3");
    expect(html).toContain("Stored Events: 10");
    expect(html).toContain("History Store: Enabled");
    expect(html).toContain("Clear persisted history");
    expect(html).toContain("Clear session history");
    expect(html).toContain("Only CodePal&#x27;s local history database is removed");
  });

  it("renders the loading state for clearing persisted history", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <HistorySettingsPanel
          settings={{
            persistenceEnabled: false,
            detailRetention: "30d",
            analyticsRetention: "forever",
          }}
          diagnostics={null}
          loading={true}
          sessionHistoryLoading={false}
          onUpdate={vi.fn()}
          onClear={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("持久化历史");
    expect(html).toContain("详细会话保留");
    expect(html).toContain("分析数据保留");
    expect(html).toContain("清理中…");
    expect(html).toContain("历史库：已停用");
  });
});
