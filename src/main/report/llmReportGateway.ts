import type { ProviderGatewaySettings } from "../../shared/appSettings";
import type { ProviderGatewayListenerInput } from "../gateway/providerGatewayStatus";

export type LlmReportGatewayResolution =
  | { ok: true; gatewayBaseUrl: string }
  | { ok: false; error: string };

function localUrl(listener: ProviderGatewayListenerInput): string {
  return `http://${listener.host}:${listener.port}`;
}

export function resolveLlmReportGatewayForReport(input: {
  gateway: ProviderGatewaySettings;
  listener: ProviderGatewayListenerInput;
  tokenConfigured: boolean;
}): LlmReportGatewayResolution {
  const { gateway, listener, tokenConfigured } = input;
  if (!gateway.enabled || listener.state === "disabled") {
    return {
      ok: false,
      error: "Provider Gateway is disabled. Enable it in Settings -> Provider Gateway before generating an LLM report.",
    };
  }

  const provider = gateway.providers[gateway.activeProvider];
  if (!provider) {
    return {
      ok: false,
      error: "Active provider is not configured. Open Settings -> Provider Gateway and choose a provider.",
    };
  }

  if (listener.state !== "listening") {
    const detail = listener.message ? `: ${listener.message}` : "";
    return {
      ok: false,
      error: `Provider Gateway is not listening at ${localUrl(listener)}${detail}. Open Settings -> Provider Gateway and run the health check.`,
    };
  }

  if (!tokenConfigured) {
    return {
      ok: false,
      error: `Provider token for ${provider.displayName} is not configured. Add it in Settings -> Provider Gateway before generating an LLM report.`,
    };
  }

  return {
    ok: true,
    gatewayBaseUrl: localUrl(listener),
  };
}
