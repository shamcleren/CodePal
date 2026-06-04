import type { AppSettings } from "../../shared/appSettings";
import type {
  ProviderGatewayClientSetupStatus,
  ProviderGatewayHealthCheckSummary,
  ProviderGatewayListenerStatus,
  ProviderGatewayStatus,
  ProviderGatewayTokenSource,
} from "../../shared/providerGatewayTypes";

export type ProviderGatewayListenerInput =
  | { state: "listening"; host: string; port: number }
  | { state: "disabled"; host: string; port: number }
  | { state: "unavailable"; host: string; port: number; message: string };

type BuildProviderGatewayStatusInput = {
  settings: AppSettings;
  tokenConfigured: boolean;
  tokenStatusByProvider?: Record<string, { configured: boolean; source: ProviderGatewayTokenSource }>;
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

function isClaudeDesktopSafeModelId(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized === "sonnet" ||
    normalized === "opus" ||
    normalized === "haiku" ||
    normalized.startsWith("claude-") ||
    normalized.startsWith("anthropic/claude-") ||
    normalized.startsWith("sonnet-") ||
    normalized.startsWith("opus-") ||
    normalized.startsWith("haiku-")
  );
}

function isCanonicalClaudeModelId(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith("claude-") || normalized.startsWith("anthropic/claude-");
}

function claudeDesktopModelMappings<T extends { claudeModel: string }>(modelMappings: T[]): T[] {
  const canonicalModels = modelMappings.filter((mapping) =>
    isCanonicalClaudeModelId(mapping.claudeModel),
  );
  if (canonicalModels.length > 0) {
    return canonicalModels;
  }
  const safeModels = modelMappings.filter((mapping) => isClaudeDesktopSafeModelId(mapping.claudeModel));
  return safeModels.length > 0 ? safeModels : modelMappings;
}

function claudeDesktopInferenceModels(modelMappings: Array<{ claudeModel: string }>): string[] {
  const allModels = modelMappings.map((mapping) => mapping.claudeModel);
  const canonicalModels = allModels.filter(isCanonicalClaudeModelId);
  if (canonicalModels.length > 0) {
    return canonicalModels;
  }
  const safeModels = allModels.filter(isClaudeDesktopSafeModelId);
  return safeModels.length > 0 ? safeModels : allModels;
}

function codexProfileModel(
  modelMappings: Array<{ claudeModel: string; upstreamModel: string }>,
): string | null {
  const preferredKeys = new Set([
    "claude-opus-4-7",
    "opus",
  ]);
  const preferredMapping = modelMappings.find(
    (mapping) => preferredKeys.has(mapping.claudeModel.toLowerCase()),
  );
  return preferredMapping?.upstreamModel ?? modelMappings[0]?.upstreamModel ?? null;
}

export function buildProviderGatewayStatus(
  input: BuildProviderGatewayStatusInput,
): ProviderGatewayStatus {
  const gateway = input.settings.providerGateway;
  const provider = gateway.providers[gateway.activeProvider] ?? null;
  const listener = listenerStatus(input.listener);
  const fallbackActiveTokenStatus = {
    configured: input.tokenConfigured,
    source: input.tokenConfigured ? "local" : "missing",
  } satisfies { configured: boolean; source: ProviderGatewayTokenSource };
  const tokenStatusForProvider = (id: string) =>
    input.tokenStatusByProvider?.[id] ??
    (id === gateway.activeProvider ? fallbackActiveTokenStatus : { configured: false, source: "missing" as const });
  const providerOptions = Object.entries(gateway.providers).map(([id, item]) => ({
    id,
    type: item.type,
    displayName: item.displayName,
    baseUrl: item.baseUrl,
    authScheme: item.authScheme,
    tokenConfigured: tokenStatusForProvider(id).configured,
    tokenSource: tokenStatusForProvider(id).source,
    envFallback: item.envFallback,
    headers: item.headers,
    modelMappings: item.modelMappings,
  }));
  const healthByModel = new Map(
    (input.lastHealthCheck?.models ?? []).map((model) => [model.claudeModel, model]),
  );
  const allModelMappings = provider
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
  const modelMappings = claudeDesktopModelMappings(allModelMappings);

  return {
    enabled: gateway.enabled,
    listener,
    activeProviderId: provider ? gateway.activeProvider : null,
    providerOptions,
    provider: provider
      ? {
          id: gateway.activeProvider,
          type: provider.type,
          displayName: provider.displayName,
          baseUrl: provider.baseUrl,
          authScheme: provider.authScheme,
          tokenConfigured: tokenStatusForProvider(gateway.activeProvider).configured,
          tokenSource: tokenStatusForProvider(gateway.activeProvider).source,
          envFallback: provider.envFallback,
        }
      : null,
    modelMappings,
    claudeDesktop: {
      baseUrl: listener.localUrl,
      apiKey: "local-proxy",
      authScheme: "bearer",
      inferenceModels: claudeDesktopInferenceModels(allModelMappings),
      setup: input.claudeDesktopSetup ?? {
        configured: false,
        restartRequired: false,
      },
    },
    codexDesktop: {
      baseUrl: `${listener.localUrl.replace(/\/$/, "")}/v1`,
      providerId: "codepal",
      profileId: "codepal-gateway",
      wireApi: "responses",
      model: codexProfileModel(allModelMappings),
      apiKey: "local-proxy",
      setup: input.codexDesktopSetup ?? {
        configured: false,
        restartRequired: false,
      },
    },
    lastHealthCheck: input.lastHealthCheck,
  };
}
