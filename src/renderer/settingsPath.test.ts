import { describe, expect, it } from "vitest";
import { formatSettingsPathForDisplay } from "./settingsPath";

describe("formatSettingsPathForDisplay", () => {
  it("redacts the home directory with tilde", () => {
    expect(
      formatSettingsPathForDisplay(
        "/Users/renjinming/Library/Application Support/codepal/settings.yaml",
        "/Users/renjinming",
      ),
    ).toBe("~/Library/Application Support/codepal/settings.yaml");
  });

  it("leaves unrelated paths unchanged", () => {
    expect(formatSettingsPathForDisplay("/tmp/codepal/settings.yaml", "/Users/renjinming")).toBe(
      "/tmp/codepal/settings.yaml",
    );
  });
});
