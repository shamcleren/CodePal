import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App, buildFallbackHistoryDiagnostics } from "./App";

describe("App", () => {
  it("renders sessions and the in-app settings drawer shell together", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("CodePal");
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
    expect(
      html.includes("Usage Accounts") || html.includes("\u7528\u91cf\u8d26\u6237"),
    ).toBe(true);
    expect(html.includes("Preferences") || html.includes("\u504f\u597d\u8bbe\u7f6e")).toBe(true);
    expect(html.includes("Advanced") || html.includes("\u9ad8\u7ea7")).toBe(true);
    expect(html).not.toContain("Maintenance &amp; History");
    expect(html).not.toContain("Usage &amp; Sign-ins");
    expect(html).not.toContain("Handle listener state, hook repairs, and login issues in one place.");
    expect(html).not.toContain(
      "Keep Claude, Cursor, and CodeBuddy sign-ins plus quota sync together.",
    );
    expect(
      html.includes('aria-label="Open settings"') || html.includes('aria-label="\u6253\u5f00\u8bbe\u7f6e"'),
    ).toBe(true);
    expect(
      html.includes('aria-label="Overview"') || html.includes('aria-label="\u6982\u89c8"'),
    ).toBe(true);
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
});
