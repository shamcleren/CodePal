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
        "anthropic/MiMo-V2.5-Pro",
        "anthropic/MiMo-V2.5",
        "anthropic/MiMo-V2-Pro",
        "anthropic/MiMo-V2-Omni",
      ],
      setup: {
        configured: false,
        restartRequired: false,
      },
    });
    expect(status.codexDesktop).toEqual({
      baseUrl: "http://127.0.0.1:15721/v1",
      providerId: "codepal",
      profileId: "codepal-mimo",
      wireApi: "responses",
      model: "anthropic/MiMo-V2.5-Pro",
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
            claudeModel: "anthropic/MiMo-V2.5-Pro",
            upstreamModel: "mimo-v2.5-pro",
            health: "error",
            status: 401,
          },
        ],
      },
    });

    expect(status.modelMappings[0]).toMatchObject({
      claudeModel: "anthropic/MiMo-V2.5-Pro",
      upstreamModel: "mimo-v2.5-pro",
      health: "error",
      status: 401,
    });
  });
});
