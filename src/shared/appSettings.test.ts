import { describe, expect, it } from "vitest";
import {
  APP_THEME_IDS,
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

  it("normalizes display theme to the two built-in theme presets", () => {
    expect(APP_THEME_IDS).toEqual(["graphite-ops", "paper-ops"]);

    expect(normalizeAppSettings({}).display.theme).toBe("graphite-ops");
    expect(
      normalizeAppSettings({
        version: 1,
        display: {
          theme: "paper-ops",
        },
      }).display.theme,
    ).toBe("paper-ops");
    expect(
      normalizeAppSettings({
        version: 1,
        display: {
          theme: "classic",
        },
      }).display.theme,
    ).toBe("graphite-ops");
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
      detailRetention: "30d",
      analyticsRetention: "forever",
    });
  });

  it("normalizes history retention settings and migrates legacy day values", () => {
    const settings = normalizeAppSettings({
      version: 1,
      history: {
        persistenceEnabled: false,
        retentionDays: 99,
        maxStorageMb: 2,
        analyticsRetention: "180d",
      },
    });

    expect(settings.history).toEqual({
      persistenceEnabled: false,
      detailRetention: "180d",
      analyticsRetention: "180d",
    });
  });

  it("merges nested history settings without dropping existing values", () => {
    const patch: AppSettingsPatch = {
      history: {
        detailRetention: "90d",
      },
    };

    const merged = mergeAppSettings(
      normalizeAppSettings({
        version: 1,
        history: {
          persistenceEnabled: true,
          detailRetention: "30d",
          analyticsRetention: "forever",
        },
      }),
      patch,
    );

    expect(merged.history).toEqual({
      persistenceEnabled: true,
      detailRetention: "90d",
      analyticsRetention: "forever",
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

  it("adds the default MiMo provider gateway profile without storing a token", () => {
    const settings = normalizeAppSettings({});

    expect(settings.providerGateway).toMatchObject({
      enabled: true,
      host: "127.0.0.1",
      port: 15721,
      activeProvider: "mimo",
      providers: {
        mimo: {
          type: "anthropic-compatible",
          displayName: "MiMo Gateway",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
          authScheme: "bearer",
          tokenRef: "mimo.gateway.token",
          envFallback: "MIMO_GATEWAY_TOKEN",
          modelMappings: {
            "anthropic/MiMo-V2.5-Pro": "mimo-v2.5-pro",
            "anthropic/MiMo-V2.5": "mimo-v2.5",
            "anthropic/MiMo-V2-Pro": "mimo-v2-pro",
            "anthropic/MiMo-V2-Omni": "mimo-v2-omni",
            default: "mimo-v2.5",
            sonnet: "mimo-v2.5",
            opus: "mimo-v2.5-pro",
            "claude-sonnet-4-6": "mimo-v2.5",
            "claude-opus-4-7": "mimo-v2.5-pro",
            "claude-haiku-4-5": "mimo-v2.5",
          },
        },
      },
    });
    expect(JSON.stringify(settings.providerGateway)).not.toContain("sk-");
    expect(JSON.stringify(settings.providerGateway)).not.toContain("token-plan-secret");
  });

  it("normalizes custom provider gateway profiles and preserves mappings", () => {
    const settings = normalizeAppSettings({
      version: 1,
      providerGateway: {
        enabled: true,
        host: "0.0.0.0",
        port: 70000,
        activeProvider: "custom",
        providers: {
          custom: {
            type: "anthropic-compatible",
            displayName: " Custom ",
            baseUrl: "http://127.0.0.1:9999/root/",
            authScheme: "bearer",
            tokenRef: "custom.token",
            envFallback: "CUSTOM_TOKEN",
            headers: {
              "anthropic-beta": "tools-2024-04-04",
              authorization: "Bearer should-not-export",
              "x-api-key": "should-not-export",
              Cookie: "should-not-export",
            },
            modelMappings: {
              "anthropic/Test-Sonnet": "real-model",
              "": "ignored",
            },
          },
        },
      },
    });

    expect(settings.providerGateway.host).toBe("127.0.0.1");
    expect(settings.providerGateway.port).toBe(15721);
    expect(settings.providerGateway.activeProvider).toBe("custom");
    expect(settings.providerGateway.providers.custom).toEqual({
      type: "anthropic-compatible",
      displayName: "Custom",
      baseUrl: "http://127.0.0.1:9999/root",
      authScheme: "bearer",
      tokenRef: "custom.token",
      envFallback: "CUSTOM_TOKEN",
      headers: {
        "anthropic-beta": "tools-2024-04-04",
      },
      modelMappings: {
        "anthropic/Test-Sonnet": "real-model",
      },
    });
  });

  it("preserves user-customized MiMo model mappings without re-adding defaults", () => {
    const settings = normalizeAppSettings({
      version: 1,
      providerGateway: {
        activeProvider: "mimo",
        providers: {
          mimo: {
            type: "anthropic-compatible",
            displayName: "MiMo Gateway",
            baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
            authScheme: "bearer",
            tokenRef: "mimo.gateway.token",
            envFallback: "MIMO_GATEWAY_TOKEN",
            headers: {},
            modelMappings: {
              "anthropic/MiMo-V2.5-Pro": "mimo-v2.5-pro",
            },
          },
        },
      },
    });

    expect(settings.providerGateway.providers.mimo.modelMappings).toEqual({
      "anthropic/MiMo-V2.5-Pro": "mimo-v2.5-pro",
    });
  });

  it("migrates the stale MiMo Haiku route while preserving custom mappings", () => {
    const settings = normalizeAppSettings({
      version: 1,
      providerGateway: {
        activeProvider: "mimo",
        providers: {
          mimo: {
            type: "anthropic-compatible",
            displayName: "MiMo Gateway",
            baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
            authScheme: "bearer",
            tokenRef: "mimo.gateway.token",
            envFallback: "MIMO_GATEWAY_TOKEN",
            headers: {},
            modelMappings: {
              default: "mimo-v2.5-pro",
              "claude-haiku-4-5": "mimo-v2",
              "anthropic/Custom": "custom-upstream",
            },
          },
        },
      },
    });

    expect(settings.providerGateway.providers.mimo.modelMappings).toEqual({
      default: "mimo-v2.5-pro",
      "claude-haiku-4-5": "mimo-v2.5",
      "anthropic/Custom": "custom-upstream",
    });
  });
});
