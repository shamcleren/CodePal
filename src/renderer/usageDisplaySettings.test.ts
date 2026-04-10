import { describe, expect, it } from "vitest";
import { defaultUsageDisplaySettings } from "../shared/appSettings";

describe("usageDisplaySettings", () => {
  it("re-exports the shared default display settings", () => {
    expect(defaultUsageDisplaySettings).toEqual({
      showInStatusBar: true,
      hiddenAgents: [],
      density: "detailed",
    });
  });
});
