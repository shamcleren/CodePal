import { describe, expect, it } from "vitest";
import { normalizeAppSettings } from "./appSettings";

describe("appSettings", () => {
  it("preserves explicit empty codebuddy endpoints from settings", () => {
    const settings = normalizeAppSettings({
      version: 1,
      locale: "en",
      codebuddy: {
        code: {
          enabled: true,
          label: "CodeBuddy Code",
          loginUrl: "",
          quotaEndpoint: "",
          cookieNames: [],
        },
      },
    });

    expect(settings.codebuddy.code).toMatchObject({
      enabled: true,
      label: "CodeBuddy Code",
      loginUrl: "",
      quotaEndpoint: "",
    });
    expect(settings.locale).toBe("en");
  });

  it("falls back to system locale when the configured locale is invalid", () => {
    const settings = normalizeAppSettings({
      version: 1,
      locale: "fr-FR",
    });

    expect(settings.locale).toBe("system");
  });
});
