import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { commitHistoryNumberDraft, HistorySettingsPanel } from "./HistorySettingsPanel";

describe("HistorySettingsPanel", () => {
  it("renders persisted history controls and diagnostics", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <HistorySettingsPanel
          settings={{
            persistenceEnabled: true,
            retentionDays: 2,
            maxStorageMb: 100,
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
    expect(html).toContain("Retention Days");
    expect(html).toContain("Max Storage (MB)");
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
            retentionDays: 7,
            maxStorageMb: 200,
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
    expect(html).toContain("保留天数");
    expect(html).toContain("清理中…");
    expect(html).toContain("历史库：已停用");
  });

  it("commits numeric drafts only when finalized and clamps them into range", () => {
    expect(commitHistoryNumberDraft("14", 2, 1, 30)).toBe(14);
    expect(commitHistoryNumberDraft("", 2, 1, 30)).toBe(2);
    expect(commitHistoryNumberDraft("bad", 2, 1, 30)).toBe(2);
    expect(commitHistoryNumberDraft("0", 2, 1, 30)).toBe(1);
    expect(commitHistoryNumberDraft("2048", 100, 10, 1024)).toBe(1024);
    expect(commitHistoryNumberDraft("12.9", 100, 10, 1024)).toBe(12);
  });
});
