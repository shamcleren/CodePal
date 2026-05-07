export type ProviderGatewayListenerStatus =
  | { state: "listening"; localUrl: string; host: string; port: number }
  | { state: "disabled"; localUrl: string; host: string; port: number }
  | { state: "unavailable"; localUrl: string; host: string; port: number; message: string };

export type ProviderGatewayProviderSummary = {
  id: string;
  type: "anthropic-compatible";
  displayName: string;
  baseUrl: string;
  authScheme: "bearer";
  tokenConfigured: boolean;
  envFallback: string;
};

export type ProviderGatewayModelMappingStatus = {
  claudeModel: string;
  upstreamModel: string;
  health: "unknown" | "checking" | "ok" | "error";
  status?: number;
  error?: string;
};

export type ProviderGatewayHealthCheckSummary = {
  checkedAt: number;
  ok: boolean;
  models: ProviderGatewayModelMappingStatus[];
};

export type ProviderGatewayClientSetupStatus = {
  configured: boolean;
  active?: boolean;
  canRestore?: boolean;
  configPath?: string;
  restartRequired: boolean;
  message?: string;
};

export type ProviderGatewayStatus = {
  enabled: boolean;
  listener: ProviderGatewayListenerStatus;
  activeProviderId: string | null;
  provider: ProviderGatewayProviderSummary | null;
  modelMappings: ProviderGatewayModelMappingStatus[];
  claudeDesktop: {
    baseUrl: string;
    apiKey: "local-proxy";
    authScheme: "bearer";
    inferenceModels: string[];
    setup: ProviderGatewayClientSetupStatus;
  };
  codexDesktop: {
    baseUrl: string;
    providerId: "codepal";
    profileId: "codepal-mimo";
    wireApi: "responses";
    model: string | null;
    apiKey: "local-proxy";
    setup: ProviderGatewayClientSetupStatus;
  };
  lastHealthCheck: ProviderGatewayHealthCheckSummary | null;
};

export type ProviderGatewayTokenUpdateResult = {
  ok: boolean;
  status: ProviderGatewayStatus;
  message?: string;
};

export const PROVIDER_GATEWAY_CLIENT_SETUP_TARGETS = [
  "claude-desktop",
  "claude-desktop-restore",
  "codex-desktop",
  "codex-desktop-restore",
] as const;

export type ProviderGatewayClientSetupTarget =
  typeof PROVIDER_GATEWAY_CLIENT_SETUP_TARGETS[number];

export type ProviderGatewayClientSetupResult = {
  ok: boolean;
  target: ProviderGatewayClientSetupTarget;
  changed: boolean;
  configPath: string;
  backupPath?: string;
  message: string;
};
