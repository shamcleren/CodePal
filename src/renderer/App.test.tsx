import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders sessions and the in-app settings drawer shell together", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("CodePal");
    expect(html).not.toContain("Control Deck");
    expect(html).not.toContain("Run ");
    expect(html).not.toContain("Wait ");
    expect(html).not.toContain("Err ");
    expect(html).toContain("Sessions");
    expect(html).toContain("面板显示");
    expect(html).toContain("app-shell");
    expect(html).toContain("app-header__meta");
    expect(html).toContain("app-settings-drawer");
    expect(html).toContain("app-settings-drawer__content");
    expect(html).toContain("接入管理");
    expect(html).toContain("接入与诊断");
    expect(html).toContain("配置文件");
    expect(html).toContain("打开 YAML");
    expect(html).toContain("aria-label=\"打开设置\"");
    expect(html.match(/aria-label="显示与用量"/g)?.length).toBe(1);
  });
});
