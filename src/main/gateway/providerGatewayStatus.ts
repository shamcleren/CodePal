import type { AppSettings } from "../../shared/appSettings";
import type {
  ProviderGatewayClientSetupStatus,
  ProviderGatewayHealthCheckSummary,
  ProviderGatewayListenerStatus,
  ProviderGatewayStatus,
} from "../../shared/providerGatewayTypes";

export type ProviderGatewayListenerInput =
  | { state: "listening"; host: string; port: number }
  | { state: "disabled"; host: string; port: number }
  | { state: "unavailable"; host: string; port: number; message: string };

type BuildProviderGatewayStatusInput = {
  settings: AppSettings;
  tokenConfigured: boolean;
  listener: ProviderGatewayListenerInput;
  lastHealthCheck: ProviderGatewayHealthCheckSummary | null;
  claudeDesktopSetup?: ProviderGatewayClientSetupStatus;
  codexDesktopSetup?: ProviderGatewayClientSetupStatus;
};

function localUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

function listenerStatus(input: ProviderGatewayListenerInput): ProviderGatewayListenerStatus {
  return {
    ...input,
    localUrl: localUrl(input.host, input.port),
  };
}

export function buildProviderGatewayStatus(
  input: BuildProviderGatewayStatusInput,
): ProviderGatewayStatus {
  const gateway = input.settings.providerGateway;
  const provider = gateway.providers[gateway.activeProvider] ?? null;
  const listener = listenerStatus(input.listener);
  const healthByModel = new Map(
    (input.lastHealthCheck?.models ?? []).map((model) => [model.claudeModel, model]),
  );
  const modelMappings = provider
    ? Object.entries(provider.modelMappings).map(([claudeModel, upstreamModel]) => {
        const health = healthByModel.get(claudeModel);
        return {
          claudeModel,
          upstreamModel,
          health: health?.health ?? "unknown",
          status: health?.status,
          error: health?.error,
        };
      })
    : [];

  return {
    enabled: gateway.enabled,
    listener,
    activeProviderId: provider ? gateway.activeProvider : null,
    provider: provider
      ? {
          id: gateway.activeProvider,
          type: provider.type,
          displayName: provider.displayName,
          baseUrl: provider.baseUrl,
          authScheme: provider.authScheme,
          tokenConfigured: input.tokenConfigured,
          envFallback: provider.envFallback,
        }
      : null,
    modelMappings,
    claudeDesktop: {
      baseUrl: listener.localUrl,
      apiKey: "local-proxy",
      authScheme: "bearer",
      inferenceModels: modelMappings.map((mapping) => mapping.claudeModel),
      setup: input.claudeDesktopSetup ?? {
        configured: false,
        restartRequired: false,
      },
    },
    codexDesktop: {
      baseUrl: `${listener.localUrl.replace(/\/$/, "")}/v1`,
      providerId: "codepal",
      profileId: "codepal-mimo",
      wireApi: "responses",
      model: modelMappings[0]?.claudeModel ?? null,
      apiKey: "local-proxy",
      setup: input.codexDesktopSetup ?? {
        configured: false,
        restartRequired: false,
      },
    },
    lastHealthCheck: input.lastHealthCheck,
  };
}
