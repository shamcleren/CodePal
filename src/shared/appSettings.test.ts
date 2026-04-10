import { describe, expect, it } from "vitest";
import {
  mergeAppSettings,
  normalizeAppSettings,
  normalizeCodeBuddyEndpointSettings,
  type AppSettingsPatch,
} from "./appSettings";

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

  it("returns fresh default-backed settings objects", () => {
    const first = normalizeAppSettings({});
    first.display.hiddenAgents.push("claude");
    first.codebuddy.code.cookieNames.push("custom-cookie");

    const second = normalizeAppSettings({});

    expect(second.display.hiddenAgents).toEqual([]);
    expect(second.codebuddy.code.cookieNames).toEqual([
      "RIO_TOKEN",
      "RIO_TOKEN_HTTPS",
      "P_RIO_TOKEN",
      "BK_TICKET",
      "tof_auth",
      "keycloak_session",
      "x_host_key_access",
      "x_host_key_access_https",
      "x-tofapi-host-key",
    ]);
  });

  it("returns a fresh hiddenAgents array when display is present without hiddenAgents", () => {
    const first = normalizeAppSettings({
      version: 1,
      display: {
        showInStatusBar: false,
      },
    });

    first.display.hiddenAgents.push("claude");

    const second = normalizeAppSettings({
      version: 1,
      display: {
        showInStatusBar: false,
      },
    });

    expect(second.display.hiddenAgents).toEqual([]);
    expect(first.display.hiddenAgents).not.toBe(second.display.hiddenAgents);
  });

  it("applies default history settings when history is missing", () => {
    const settings = normalizeAppSettings({
      version: 1,
      locale: "system",
    });

    expect(settings.history).toEqual({
      persistenceEnabled: true,
      retentionDays: 2,
      maxStorageMb: 100,
    });
  });

  it("clamps history settings to the supported range", () => {
    const settings = normalizeAppSettings({
      version: 1,
      history: {
        persistenceEnabled: false,
        retentionDays: 99,
        maxStorageMb: 2,
      },
    });

    expect(settings.history).toEqual({
      persistenceEnabled: false,
      retentionDays: 30,
      maxStorageMb: 10,
    });
  });

  it("merges nested history settings without dropping existing values", () => {
    const patch: AppSettingsPatch = {
      history: {
        retentionDays: 1,
      },
    };

    const merged = mergeAppSettings(
      normalizeAppSettings({
        version: 1,
        history: {
          persistenceEnabled: true,
          retentionDays: 10,
          maxStorageMb: 250,
        },
      }),
      patch,
    );

    expect(merged.history).toEqual({
      persistenceEnabled: true,
      retentionDays: 1,
      maxStorageMb: 250,
    });
  });

  it("uses endpoint-specific cookie defaults when cookie names are missing", () => {
    const endpointDefaults = {
      enabled: true,
      label: "Custom Endpoint",
      loginUrl: "https://example.com/login",
      quotaEndpoint: "https://example.com/quota",
      cookieNames: ["ONE", "TWO"],
    };

    const settings = normalizeCodeBuddyEndpointSettings(
      {
        enabled: false,
        label: "Custom Endpoint",
      },
      endpointDefaults,
    );

    expect(settings.cookieNames).toEqual(["ONE", "TWO"]);
    expect(settings.cookieNames).not.toBe(endpointDefaults.cookieNames);
  });
});
