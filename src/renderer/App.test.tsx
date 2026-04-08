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
    expect(html).toContain("Panel Display");
    expect(html).toContain("app-shell");
    expect(html).toContain("app-header__meta");
    expect(html).toContain("app-settings-drawer");
    expect(html).toContain("app-settings-drawer__content");
    expect(html).toContain("Integrations");
    expect(html).toContain("Integrations &amp; Diagnostics");
    expect(html).toContain("Config File");
    expect(html).toContain("Open YAML");
    expect(html).toContain("aria-label=\"Open settings\"");
    expect(html.match(/aria-label="Display &amp; Usage"/g)?.length).toBe(1);
  });
});
