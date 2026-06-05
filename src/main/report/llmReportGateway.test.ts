import { describe, expect, it } from "vitest";
import { defaultProviderGatewaySettings } from "../../shared/appSettings";
import { resolveLlmReportGatewayForReport } from "./llmReportGateway";

const enabledGateway = {
  ...defaultProviderGatewaySettings,
  enabled: true,
};

describe("resolveLlmReportGatewayForReport", () => {
  it("uses the actual listener address when env overrides the configured gateway port", () => {
    const result = resolveLlmReportGatewayForReport({
      gateway: {
        ...enabledGateway,
        port: 15721,
      },
      listener: {
        state: "listening",
        host: "127.0.0.1",
        port: 15888,
      },
      tokenConfigured: true,
    });

    expect(result).toEqual({
      ok: true,
      gatewayBaseUrl: "http://127.0.0.1:15888",
    });
  });

  it("returns an actionable error when the local gateway is not listening", () => {
    const result = resolveLlmReportGatewayForReport({
      gateway: enabledGateway,
      listener: {
        state: "unavailable",
        host: "127.0.0.1",
        port: 15721,
        message: "Provider gateway port is already in use",
      },
      tokenConfigured: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Provider Gateway is not listening at http://127.0.0.1:15721");
      expect(result.error).toContain("Provider gateway port is already in use");
    }
  });

  it("returns an actionable error when the provider token is missing", () => {
    const result = resolveLlmReportGatewayForReport({
      gateway: enabledGateway,
      listener: {
        state: "listening",
        host: "127.0.0.1",
        port: 15721,
      },
      tokenConfigured: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Provider token for MiMo Gateway is not configured");
    }
  });
});
