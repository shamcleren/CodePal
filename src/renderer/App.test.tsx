import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  App,
  buildFallbackHistoryDiagnostics,
  workReviewHistoryMaxAgeMs,
  workReviewTokenRange,
  workReviewUsageRefreshKey,
} from "./App";

function localDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addLocalDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

describe("App", () => {
  it("renders sessions and the in-app settings drawer shell together", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("CodePal");
    expect(html).toContain('data-theme="graphite-ops"');
    expect(html).not.toContain("Control Deck");
    expect(html).not.toContain("Run ");
    expect(html).not.toContain("Wait ");
    expect(html).not.toContain("Err ");
    expect(html).toContain("Sessions");
    // Locale-dependent text: en or zh-CN depending on test environment
    expect(html.includes("Provider Gateway")).toBe(true);
    expect(html).toContain("app-shell");
    expect(html).toContain("app-header__meta");
    expect(html).toContain("app-header__actions");
    expect(html).toContain("app-settings-drawer");
    expect(html).toContain("app-settings-drawer__content");
    expect(html).toContain("settings-nav");
    expect(html).toContain("settings-content");
    expect(
      html.includes("Agent Integrations") || html.includes("Agent \u63a5\u5165"),
    ).toBe(true);
    expect(html.includes("Preferences") || html.includes("\u504f\u597d\u8bbe\u7f6e")).toBe(true);
    expect(html.includes("Advanced") || html.includes("\u9ad8\u7ea7")).toBe(true);
    expect(html).not.toContain("Maintenance &amp; History");
    expect(html).not.toContain("Handle listener state, hook repairs, and login issues in one place.");
    expect(
      html.includes('aria-label="Open settings"') || html.includes('aria-label="\u6253\u5f00\u8bbe\u7f6e"'),
    ).toBe(true);
    expect(
      html.includes('aria-label="Overview"') || html.includes('aria-label="\u6982\u89c8"'),
    ).toBe(true);
  });

  it("resolves system appearance before applying the root theme", () => {
    const source = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");

    expect(source).toContain('matchMedia("(prefers-color-scheme: light)")');
    expect(source).toContain("data-theme={resolvedTheme}");
    expect(source).toContain('data-theme-setting={appSettings.display.theme}');
  });

  it("builds fallback history diagnostics from the intended enabled state", () => {
    expect(buildFallbackHistoryDiagnostics(true)).toEqual({
      enabled: true,
      dbPath: "",
      dbSizeBytes: 0,
      estimatedSessionCount: 0,
      estimatedActivityCount: 0,
      lastCleanupAt: null,
    });

    expect(buildFallbackHistoryDiagnostics(false).enabled).toBe(false);
  });

  it("refreshes work review analytics when usage overview changes", () => {
    expect(workReviewUsageRefreshKey(null)).toBe(0);
    expect(workReviewUsageRefreshKey({
      updatedAt: 200,
      summary: { rateLimits: [], contextMode: "none" },
      sessions: [{ agent: "codex", sessionId: "s1", updatedAt: 100, sources: [], completeness: "minimal" }],
    })).toBe(200);
    expect(workReviewUsageRefreshKey({
      summary: { rateLimits: [], contextMode: "none", updatedAt: 150 },
      sessions: [{ agent: "codex", sessionId: "s1", updatedAt: 300, sources: [], completeness: "minimal" }],
    })).toBe(300);
  });

  it("preloads the full 30-day work review range on natural day boundaries", () => {
    const now = Date.parse("2026-06-01T17:30:00+08:00");
    const localTodayStart = localDayStart(now);
    const expectedStart = addLocalDays(localTodayStart, -29);

    expect(workReviewTokenRange(now)).toEqual({
      start: expectedStart,
      end: addLocalDays(localTodayStart, 1),
    });
    expect(workReviewHistoryMaxAgeMs(now)).toBe(now - expectedStart);
  });

  it("does not expose unfinished LLM report settings", () => {
    const source = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");

    expect(source).not.toContain("ReportPreferencesPanel");
  });

  it("does not duplicate initial provider gateway, history, or session refresh work", () => {
    const source = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");

    expect(source).not.toContain("void loadProviderGatewayStatus();\n  }, []);");
    expect(source).not.toContain("void loadHistoryDiagnostics(appSettings.history.persistenceEnabled);\n  }, []);");
    expect(source).not.toContain("setRows(rowsFromSessions(sessions, resolvedLocale));");
  });

  it("switches Provider Gateway providers through the dedicated status-returning IPC", () => {
    const source = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");

    expect(source).toContain(".selectProviderGatewayProvider(providerId)");
    expect(source).not.toContain("updateAppSettings({ providerGateway: { activeProvider: providerId } })");
  });

  it("keeps integration refresh scoped to integration diagnostics", () => {
    const source = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");
    const refreshStart = source.indexOf("function refreshIntegrations(");
    const refreshEnd = source.indexOf("function refreshSettingsOverview(", refreshStart);
    const refreshSource = source.slice(refreshStart, refreshEnd);

    expect(refreshSource).toContain("getIntegrationDiagnostics()");
    expect(refreshSource).not.toContain("loadProviderGatewayStatus()");
    expect(refreshSource).not.toContain("loadHistoryDiagnostics(");
  });

  it("memoizes support diagnostics so session ticks do not rebuild the report", () => {
    const source = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");
    const diagnosticsIndex = source.indexOf("const supportDiagnosticsReport = useMemo(");

    expect(diagnosticsIndex).toBeGreaterThan(-1);
    expect(source.slice(diagnosticsIndex, source.indexOf("const settingsSections", diagnosticsIndex)))
      .toContain("buildSupportDiagnosticsReport({");
  });

  it("applies app setting changes optimistically before waiting for IPC persistence", () => {
    const source = fs.readFileSync(path.join(__dirname, "App.tsx"), "utf8");
    const updateStart = source.indexOf("function updateAppSettings(nextValue: AppSettingsPatch)");
    const updateSource = source.slice(updateStart, source.indexOf("function clearPersistedHistory(", updateStart));

    expect(updateSource).toContain("const optimisticSettings = mergeAppSettings(previousSettings, nextValue)");
    expect(updateSource.indexOf("setAppSettings(optimisticSettings)")).toBeLessThan(
      updateSource.indexOf("window.codepal.updateAppSettings(nextValue)"),
    );
    expect(updateSource).toContain("appSettingsSaveSequence.current === requestId");
  });
});
