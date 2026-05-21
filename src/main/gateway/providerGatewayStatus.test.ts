import { describe, expect, it } from "vitest";
import { normalizeAppSettings } from "../../shared/appSettings";
import { buildProviderGatewayStatus } from "./providerGatewayStatus";

describe("providerGatewayStatus", () => {
  it("builds a sanitized configured status", () => {
    const settings = normalizeAppSettings({});
    const status = buildProviderGatewayStatus({
      settings,
      tokenConfigured: true,
      listener: { state: "listening", host: "127.0.0.1", port: 15721 },
      lastHealthCheck: null,
    });

    expect(status.provider?.tokenConfigured).toBe(true);
    expect(status.listener).toMatchObject({
      state: "listening",
      localUrl: "http://127.0.0.1:15721",
    });
    expect(status.claudeDesktop).toEqual({
      baseUrl: "http://127.0.0.1:15721",
      apiKey: "local-proxy",
      authScheme: "bearer",
      inferenceModels: [
        "claude-sonnet-4-6",
        "claude-opus-4-7",
        "claude-haiku-4-5",
      ],
      setup: {
        configured: false,
        restartRequired: false,
      },
    });
    expect(status.modelMappings.map((model) => model.claudeModel)).toEqual([
      "claude-sonnet-4-6",
      "claude-opus-4-7",
      "claude-haiku-4-5",
    ]);
    expect(status.codexDesktop).toEqual({
      baseUrl: "http://127.0.0.1:15721/v1",
      providerId: "codepal",
      profileId: "codepal-mimo",
      wireApi: "responses",
      model: "mimo-v2.5-pro",
      apiKey: "local-proxy",
      setup: {
        configured: false,
        restartRequired: false,
      },
    });
    expect(JSON.stringify(status)).not.toContain("mimo.gateway.token");
  });

  it("marks health results onto model mappings", () => {
    const settings = normalizeAppSettings({});
    const status = buildProviderGatewayStatus({
      settings,
      tokenConfigured: true,
      listener: { state: "listening", host: "127.0.0.1", port: 15721 },
      lastHealthCheck: {
        checkedAt: 10,
        ok: false,
        models: [
          {
            claudeModel: "claude-opus-4-7",
            upstreamModel: "mimo-v2.5-pro",
            health: "error",
            status: 401,
          },
        ],
      },
    });

    expect(status.modelMappings[1]).toMatchObject({
      claudeModel: "claude-opus-4-7",
      upstreamModel: "mimo-v2.5-pro",
      health: "error",
      status: 401,
    });
  });

  it("uses the Pro upstream model for Codex even when MiMo mappings are reordered", () => {
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
              sonnet: "mimo-v2.5",
              default: "mimo-v2.5",
              "claude-sonnet-4-6": "mimo-v2.5",
              "claude-haiku-4-5": "mimo-v2.5",
              "claude-opus-4-7": "mimo-v2.5-pro",
            },
          },
        },
      },
    });

    const status = buildProviderGatewayStatus({
      settings,
      tokenConfigured: true,
      listener: { state: "listening", host: "127.0.0.1", port: 15721 },
      lastHealthCheck: null,
    });

    expect(status.codexDesktop.model).toBe("mimo-v2.5-pro");
  });
});
