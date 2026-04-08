import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayPreferencesPanel } from "./DisplayPreferencesPanel";

describe("DisplayPreferencesPanel", () => {
  it("renders density controls for usage display", () => {
    const html = renderToStaticMarkup(
      <DisplayPreferencesPanel
        settings={{ showInStatusBar: true, hiddenAgents: [], density: "detailed" }}
        onToggleStrip={vi.fn()}
        onToggleAgent={vi.fn()}
        onDensityChange={vi.fn()}
      />,
    );

    expect(html).toContain("面板显示");
    expect(html).toContain("显示的 Agent");
    expect(html).toContain("用量显示密度");
    expect(html).toContain("简洁");
    expect(html).toContain("详细");
    expect(html).not.toContain("Reset ");
    expect(html).toContain("Cursor");
  });
});
