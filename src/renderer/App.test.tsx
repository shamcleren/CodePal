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
    expect(html).toContain("Panel Display");
    expect(html).toContain("app-shell");
    expect(html).toContain("app-header__meta");
    expect(html).toContain("app-settings-drawer");
    expect(html).toContain("app-settings-drawer__content");
    expect(html).toContain("settings-nav");
    expect(html).toContain("settings-content");
    expect(html).toContain("Integrations");
    expect(html).toContain("Integrations &amp; Diagnostics");
    expect(html).toContain("Usage &amp; Sign-ins");
    expect(html).toContain("Maintenance &amp; History");
    expect(html).toContain("Support &amp; Diagnostics");
    expect(html).toContain("aria-label=\"Open settings\"");
    expect(html).toContain("aria-label=\"Integrations\"");
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
