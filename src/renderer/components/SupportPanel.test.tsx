import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { SupportPanel } from "./SupportPanel";

describe("SupportPanel", () => {
  it("renders support links and diagnostics actions", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <SupportPanel
          diagnosticsReport={"CodePal Support Diagnostics\nGenerated At: 2026-04-09T00:00:00.000Z"}
          onCopyDiagnostics={vi.fn()}
          onOpenPrivacy={vi.fn()}
          onOpenSupportScope={vi.fn()}
          onOpenTroubleshooting={vi.fn()}
          onOpenIssues={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("Support &amp; Diagnostics");
    expect(html).toContain("support-panel__actions");
    expect(html).toContain("Copy Diagnostics");
    expect(html).toContain("Report Issue");
    expect(html).toContain("Privacy");
    expect(html).toContain("Support Scope");
    expect(html).toContain("Troubleshooting");
    expect(html).toContain("Diagnostics Preview");
    expect(html).toContain("CodePal Support Diagnostics");
  });
});
