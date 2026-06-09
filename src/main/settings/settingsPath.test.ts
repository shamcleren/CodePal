import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveTemplateSettingsPath,
  resolveWritableSettingsPath,
} from "./settingsPath";

describe("settingsPath", () => {
  it("stores writable settings under userData by default", () => {
    expect(
      resolveWritableSettingsPath({
        userDataPath: "/Users/demo/Library/Application Support/codepal",
      }),
    ).toBe("/Users/demo/Library/Application Support/codepal/settings.yaml");
  });

  it("keeps explicit settings path overrides", () => {
    expect(
      resolveWritableSettingsPath({
        override: "  /tmp/codepal/settings.local.yaml  ",
        userDataPath: "/Users/demo/Library/Application Support/codepal",
      }),
    ).toBe("/tmp/codepal/settings.local.yaml");
  });

  it("resolves the template from the app path", () => {
    expect(resolveTemplateSettingsPath("/Applications/CodePal.app/Contents/Resources/app")).toBe(
      path.join("/Applications/CodePal.app/Contents/Resources/app", "config", "settings.template.yaml"),
    );
  });
});
