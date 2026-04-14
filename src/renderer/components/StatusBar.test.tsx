import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UsageDisplaySettings } from "../usageDisplaySettings";
import { I18nProvider } from "../i18n";
import { UsageStatusStrip } from "./UsageStatusStrip";
import { StatusBar } from "./StatusBar";

const defaultSettings: UsageDisplaySettings = {
  showInStatusBar: true,
  hiddenAgents: [],
  density: "compact",
};

describe("StatusBar", () => {
  it("does not render an empty wrapper when usage content resolves to null", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <StatusBar
          usage={<UsageStatusStrip overview={null} settings={defaultSettings} />}
        />
      </I18nProvider>,
    );

    expect(html).toBe("");
  });
});
