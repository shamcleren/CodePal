import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayPreferencesPanel } from "./DisplayPreferencesPanel";
import { I18nProvider } from "../i18n";

describe("DisplayPreferencesPanel", () => {
  it("renders density controls for usage display", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <DisplayPreferencesPanel
          settings={{ showInStatusBar: true, hiddenAgents: [], density: "detailed" }}
          onToggleStrip={vi.fn()}
          onToggleAgent={vi.fn()}
          onDensityChange={vi.fn()}
          localeSetting="system"
          onLocaleChange={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("面板显示");
    expect(html).toContain("显示的 Agent");
    expect(html).toContain("用量显示密度");
    expect(html).toContain("简洁");
    expect(html).toContain("详细");
    expect(html).toContain("界面语言");
    expect(html).toContain("跟随系统");
    expect(html).not.toContain("Reset ");
    expect(html).toContain("Cursor");
  });

});
