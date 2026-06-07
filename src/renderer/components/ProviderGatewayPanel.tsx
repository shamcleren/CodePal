import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ProviderGatewayConfig } from "../../shared/appSettings";
import { defaultProviderGatewaySettings } from "../../shared/appSettings";
import type {
  ProviderGatewayClientSetupTarget,
  ProviderGatewayClientSetupStatus,
  ProviderGatewayStatus,
  ProviderGatewayTokenSource,
} from "../../shared/providerGatewayTypes";
import { useI18n } from "../i18n";

type ProviderGatewayPanelProps = {
  status: ProviderGatewayStatus | null;
  loading: boolean;
  tokenSaving: boolean;
  healthChecking: boolean;
  clientSetupTarget: ProviderGatewayClientSetupTarget | null;
  feedback: string | null;
  error: string | null;
  onRefresh: () => void;
  onSelectProvider: (providerId: string) => Promise<void> | void;
  onSaveProvider: (providerId: string, provider: ProviderGatewayConfig) => Promise<void> | void;
  onDeleteProvider: (providerId: string) => Promise<void> | void;
  onSaveToken: (providerId: string, token: string) => Promise<void> | void;
  onRunHealthCheck: () => Promise<void> | void;
  onStartGateway: () => Promise<void> | void;
  onStopGateway: () => Promise<void> | void;
  onConfigureClient: (target: ProviderGatewayClientSetupTarget) => Promise<void> | void;
  onCopy: (text: string) => void;
};

function healthLabel(health: string, status?: number): string {
  if (health === "ok") {
    return status ? `OK ${status}` : "OK";
  }
  if (health === "error") {
    return status ? `Error ${status}` : "Error";
  }
  if (health === "checking") {
    return "Checking";
  }
  return "Unknown";
}

function listenerLabel(status: ProviderGatewayStatus): string {
  if (status.listener.state === "listening") {
    return status.listener.localUrl;
  }
  if (status.listener.state === "disabled") {
    return "Disabled";
  }
  return status.listener.message;
}

function setupLabel(setup: ProviderGatewayClientSetupStatus, fallback: string): string {
  return setup.message ?? fallback;
}

function tokenSourceLabel(source: ProviderGatewayTokenSource, t: ReturnType<typeof useI18n>["t"]): string {
  if (source === "local") return t("providerGateway.token.source.local");
  if (source === "env") return t("providerGateway.token.source.env");
  return t("providerGateway.token.source.missing");
}

function modelSummary(
  status: ProviderGatewayStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const ok = status.modelMappings.filter((mapping) => mapping.health === "ok").length;
  const errors = status.modelMappings.filter((mapping) => mapping.health === "error").length;
  return t("providerGateway.models.summary", {
    count: status.modelMappings.length,
    ok,
    errors,
  });
}

function keyValueLines(value: Record<string, string>): string {
  return Object.entries(value).map(([key, item]) => `${key}=${item}`).join("\n");
}

function parseKeyValueLines(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator === -1) return [line, ""];
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
      .filter(([key, value]) => key && value),
  );
}

const emptyProviderForm = {
  id: "",
  displayName: "",
  type: "openai-chat-compatible" as ProviderGatewayConfig["type"],
  baseUrl: "",
  envFallback: "",
  headers: "",
  modelMappings: "default=\nsonnet=\nopus=\nhaiku=",
};

function providerToForm(id: string, provider: ProviderGatewayConfig) {
  return {
    id,
    displayName: provider.displayName,
    type: provider.type,
    baseUrl: provider.baseUrl,
    envFallback: provider.envFallback,
    headers: keyValueLines(provider.headers),
    modelMappings: keyValueLines(provider.modelMappings),
  };
}

export function ProviderGatewayPanel({
  status,
  loading,
  tokenSaving,
  healthChecking,
  clientSetupTarget,
  feedback,
  error,
  onRefresh,
  onSelectProvider,
  onSaveProvider,
  onDeleteProvider,
  onSaveToken,
  onRunHealthCheck,
  onStartGateway,
  onStopGateway,
  onConfigureClient,
  onCopy,
}: ProviderGatewayPanelProps) {
  const i18n = useI18n();
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenProviderId, setTokenProviderId] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [providerForm, setProviderForm] = useState(emptyProviderForm);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const providerId = status?.activeProviderId ?? "";
  const gatewayStarted = status?.listener.state === "listening";
  const clientSetupDisabled = !gatewayStarted;
  const canSaveToken = Boolean(tokenProviderId && tokenDraft.trim() && !tokenSaving);

  useEffect(() => {
    if (!status) return;
    setTokenProviderId((current) => {
      if (current && status.providerOptions.some((provider) => provider.id === current)) {
        return current;
      }
      return status.activeProviderId ?? status.providerOptions[0]?.id ?? "";
    });
  }, [status]);

  async function handleTokenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSaveToken) {
      return;
    }
    await onSaveToken(tokenProviderId, tokenDraft);
    setTokenDraft("");
  }

  async function handleProviderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextId = providerForm.id.trim();
    if (!nextId) return;
    await onSaveProvider(nextId, {
      type: providerForm.type,
      displayName: providerForm.displayName.trim() || nextId,
      baseUrl: providerForm.baseUrl.trim(),
      authScheme: "bearer",
      tokenRef: `${nextId}.api_key`,
      envFallback: providerForm.envFallback.trim(),
      headers: parseKeyValueLines(providerForm.headers),
      modelMappings: parseKeyValueLines(providerForm.modelMappings),
    });
    setEditingProviderId(null);
    setProviderForm(emptyProviderForm);
  }

  if (!status) {
    return (
      <section className="display-panel provider-gateway-panel" aria-label={i18n.t("providerGateway.title")}>
        <div className="display-panel__header">
          <div className="display-panel__title">{i18n.t("providerGateway.title")}</div>
          <div className="display-panel__subtitle">{i18n.t("providerGateway.loading")}</div>
        </div>
      </section>
    );
  }

  const tokenLabel = status.provider?.tokenConfigured
    ? i18n.t("providerGateway.status.tokenConfigured")
    : i18n.t("providerGateway.status.tokenMissing");
  const activeProviderTokenSource = status.provider
    ? tokenSourceLabel(status.provider.tokenSource, i18n.t)
    : i18n.t("providerGateway.status.tokenMissing");
  const modelList = status.claudeDesktop.inferenceModels.join("\n");
  const claudeConfigured = status.claudeDesktop.setup.configured;
  const claudeActive = claudeConfigured && status.claudeDesktop.setup.active;
  const codexConfigured = status.codexDesktop.setup.configured;
  const codexActive = codexConfigured && status.codexDesktop.setup.active;
  const builtinProviderIds = new Set(Object.keys(defaultProviderGatewaySettings.providers));

  if (!gatewayStarted) {
    return (
      <section className="display-panel provider-gateway-panel" aria-label={i18n.t("providerGateway.title")}>
        <div className="display-panel__header">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.title")}</div>
            <div className="display-panel__subtitle">{i18n.t("providerGateway.subtitle")}</div>
          </div>
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? i18n.t("integration.refreshing") : i18n.t("integration.refresh")}
          </button>
        </div>

        {feedback ? <p className="integration-panel__feedback">{feedback}</p> : null}
        {error ? <p className="integration-panel__error">{error}</p> : null}

        <div className="provider-gateway-panel__offline">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.start.offlineTitle")}</div>
            <div className="display-panel__subtitle">{i18n.t("providerGateway.start.offlineSubtitle")}</div>
          </div>
          <div className="provider-gateway-panel__offline-status">
            <span>{i18n.t("providerGateway.status.local")}</span>
            <strong>{listenerLabel(status)}</strong>
          </div>
          <button
            type="button"
            className="integration-panel__refresh"
            disabled={loading}
            onClick={() => {
              void onStartGateway();
            }}
          >
            {loading ? i18n.t("integration.refreshing") : i18n.t("providerGateway.start.button")}
          </button>
        </div>
      </section>
    );
  }

  const codexConfig = [
    "[model_providers.codepal]",
    'name = "CodePal Gateway"',
    `base_url = "${status.codexDesktop.baseUrl}"`,
    'wire_api = "responses"',
    "requires_openai_auth = false",
    'http_headers = { Authorization = "Bearer local-proxy" }',
    "",
    `[profiles.${status.codexDesktop.profileId}]`,
    `model = "${status.codexDesktop.model ?? ""}"`,
    `model_provider = "${status.codexDesktop.providerId}"`,
  ].join("\n");

  return (
    <section className="display-panel provider-gateway-panel" aria-label={i18n.t("providerGateway.title")}>
      <div className="display-panel__header">
        <div>
          <div className="display-panel__title">{i18n.t("providerGateway.title")}</div>
          <div className="display-panel__subtitle">{i18n.t("providerGateway.subtitle")}</div>
        </div>
        <button
          type="button"
          className="integration-panel__refresh integration-panel__refresh--secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? i18n.t("integration.refreshing") : i18n.t("integration.refresh")}
        </button>
        {gatewayStarted ? (
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            onClick={() => {
              void onStopGateway();
            }}
            disabled={loading}
          >
            {loading ? i18n.t("integration.refreshing") : i18n.t("providerGateway.stop.button")}
          </button>
        ) : null}
      </div>

      {feedback ? <p className="integration-panel__feedback">{feedback}</p> : null}
      {error ? <p className="integration-panel__error">{error}</p> : null}
      <div className="provider-gateway-panel__switchboard">
        <div className="provider-gateway-panel__switchboard-main">
          <div className="display-panel__title">{i18n.t("providerGateway.profile.switchboard")}</div>
          <div className="display-panel__subtitle">
            {status.provider
              ? `${status.provider.displayName} · ${activeProviderTokenSource}`
              : i18n.t("providerGateway.provider.missing")}
          </div>
        </div>
        <label className="provider-gateway-panel__switch-control">
          <span>{i18n.t("providerGateway.status.provider")}</span>
          <select
            className="provider-gateway-panel__token-input"
            value={providerId}
            disabled={loading || status.providerOptions.length === 0}
            aria-label={i18n.t("providerGateway.status.provider")}
            onChange={(event) => {
              void onSelectProvider(event.currentTarget.value);
            }}
          >
            {status.providerOptions.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="provider-gateway-panel__switch-meta">
          <span>{i18n.t("providerGateway.status.local")}</span>
          <strong title={listenerLabel(status)}>{listenerLabel(status)}</strong>
        </div>
        <div className="provider-gateway-panel__switch-meta">
          <span>{i18n.t("providerGateway.token.title")}</span>
          <strong>{tokenLabel}</strong>
        </div>
      </div>

      <div className="provider-gateway-panel__status-grid">
        <div className="display-panel__card">
          <div className="display-panel__title">{i18n.t("providerGateway.status.local")}</div>
          <div className="provider-gateway-panel__value" title={listenerLabel(status)}>
            {listenerLabel(status)}
          </div>
        </div>
        <div className="display-panel__card">
          <div className="display-panel__title">{i18n.t("providerGateway.status.provider")}</div>
          <div className="provider-gateway-panel__value">{status.provider?.displayName ?? i18n.t("providerGateway.provider.missing")}</div>
        </div>
        <div className="display-panel__card">
          <div className="display-panel__title">{i18n.t("providerGateway.token.title")}</div>
          <div className="provider-gateway-panel__value">{tokenLabel}</div>
        </div>
      </div>

      <details className="display-panel__subsection-block provider-gateway-panel__details provider-gateway-panel__details--section">
        <summary>{i18n.t("providerGateway.token.manage")}</summary>
        <div className="display-panel__header">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.profile.title")}</div>
            <div className="display-panel__subtitle">
              {status.provider
                ? `${status.provider.displayName} · ${activeProviderTokenSource}`
                : i18n.t("providerGateway.provider.missing")}
            </div>
          </div>
        </div>
        <form className="provider-gateway-panel__token-form" onSubmit={handleTokenSubmit}>
          <select
            className="provider-gateway-panel__token-input"
            value={tokenProviderId}
            disabled={tokenSaving || status.providerOptions.length === 0}
            aria-label={i18n.t("providerGateway.token.provider")}
            onChange={(event) => setTokenProviderId(event.currentTarget.value)}
          >
            {status.providerOptions.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.displayName}
              </option>
            ))}
          </select>
          <input
            className="provider-gateway-panel__token-input"
            type={tokenVisible ? "text" : "password"}
            value={tokenDraft}
            placeholder={i18n.t("providerGateway.token.placeholder")}
            onChange={(event) => setTokenDraft(event.currentTarget.value)}
          />
          <button
            type="button"
            className="provider-gateway-panel__token-toggle"
            onClick={() => setTokenVisible((v) => !v)}
            aria-label={tokenVisible ? i18n.t("providerGateway.token.hide") : i18n.t("providerGateway.token.show")}
          >
            {tokenVisible ? i18n.t("providerGateway.token.hide") : i18n.t("providerGateway.token.show")}
          </button>
          <button
            type="submit"
            className="integration-panel__refresh"
            disabled={!canSaveToken}
          >
            {tokenSaving ? i18n.t("providerGateway.token.saving") : i18n.t("providerGateway.token.save")}
          </button>
        </form>
      </details>

      <details className="display-panel__subsection-block provider-gateway-panel__details provider-gateway-panel__details--section">
        <summary>{i18n.t("providerGateway.providers.manage")}</summary>
        <div className="display-panel__header">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.providers.title")}</div>
            <div className="display-panel__subtitle">{i18n.t("providerGateway.providers.subtitle")}</div>
          </div>
          <button
            type="button"
            className="integration-panel__refresh"
            onClick={() => {
              setEditingProviderId("new");
              setProviderForm(emptyProviderForm);
            }}
          >
            {i18n.t("providerGateway.provider.add")}
          </button>
        </div>
        <div className="provider-gateway-panel__mapping-list provider-gateway-panel__provider-list">
          <div className="provider-gateway-panel__mapping-row provider-gateway-panel__mapping-row--header provider-gateway-panel__provider-row">
            <span>{i18n.t("providerGateway.providers.provider")}</span>
            <span>{i18n.t("providerGateway.providers.token")}</span>
            <span>{i18n.t("providerGateway.providers.actions")}</span>
          </div>
          {status.providerOptions.map((provider) => (
            <div key={provider.id} className="provider-gateway-panel__mapping-row provider-gateway-panel__provider-row">
              <span className="provider-gateway-panel__value" title={provider.baseUrl}>
                {provider.displayName}
                {provider.id === status.activeProviderId ? ` · ${i18n.t("providerGateway.provider.active")}` : ""}
              </span>
              <span className={`hook-badge provider-gateway-panel__token-badge hook-badge--${provider.tokenConfigured ? "active" : "repair"}`}>
                {tokenSourceLabel(provider.tokenSource, i18n.t)}
              </span>
              <span className="provider-gateway-panel__actions">
                {provider.id === status.activeProviderId ? null : (
                  <button
                    type="button"
                    className="integration-panel__refresh integration-panel__refresh--secondary provider-gateway-panel__row-action"
                    onClick={() => {
                      void onSelectProvider(provider.id);
                    }}
                  >
                    {i18n.t("providerGateway.provider.activate")}
                  </button>
                )}
                <button
                  type="button"
                  className="integration-panel__refresh integration-panel__refresh--secondary provider-gateway-panel__row-action"
                  onClick={() => {
                    const config = {
                      type: provider.type,
                      displayName: provider.displayName,
                      baseUrl: provider.baseUrl,
                      authScheme: provider.authScheme,
                      tokenRef: `${provider.id}.api_key`,
                      envFallback: provider.envFallback,
                      headers: provider.headers,
                      modelMappings: provider.modelMappings,
                    } satisfies ProviderGatewayConfig;
                    setEditingProviderId(provider.id);
                    setProviderForm(providerToForm(provider.id, config));
                  }}
                >
                  {i18n.t("providerGateway.provider.edit")}
                </button>
                {builtinProviderIds.has(provider.id) ? null : (
                  <button
                    type="button"
                    className="integration-panel__refresh integration-panel__refresh--secondary provider-gateway-panel__row-action"
                    onClick={() => {
                      void onDeleteProvider(provider.id);
                    }}
                  >
                    {i18n.t("providerGateway.provider.delete")}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
        {editingProviderId ? (
          <form className="provider-gateway-panel__provider-form" onSubmit={handleProviderSubmit}>
            <div className="provider-gateway-panel__form-grid">
              <input
                className="provider-gateway-panel__token-input"
                value={providerForm.id}
                disabled={editingProviderId !== "new"}
                placeholder="provider-id"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setProviderForm((current) => ({ ...current, id: value }));
                }}
              />
              <input
                className="provider-gateway-panel__token-input"
                value={providerForm.displayName}
                placeholder={i18n.t("providerGateway.provider.name")}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setProviderForm((current) => ({ ...current, displayName: value }));
                }}
              />
              <select
                className="provider-gateway-panel__token-input"
                value={providerForm.type}
                onChange={(event) => {
                  const value = event.currentTarget.value as ProviderGatewayConfig["type"];
                  setProviderForm((current) => ({ ...current, type: value }));
                }}
              >
                <option value="anthropic-compatible">anthropic-compatible</option>
                <option value="openai-chat-compatible">openai-chat-compatible</option>
              </select>
              <input
                className="provider-gateway-panel__token-input"
                value={providerForm.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setProviderForm((current) => ({ ...current, baseUrl: value }));
                }}
              />
            </div>
            <details className="provider-gateway-panel__details">
              <summary>{i18n.t("providerGateway.provider.advanced")}</summary>
              <div className="provider-gateway-panel__form-grid provider-gateway-panel__form-grid--advanced">
                <input
                  className="provider-gateway-panel__token-input"
                  value={providerForm.envFallback}
                  placeholder={i18n.t("providerGateway.provider.env")}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setProviderForm((current) => ({ ...current, envFallback: value }));
                  }}
                />
                <textarea
                  className="provider-gateway-panel__token-input"
                  value={providerForm.modelMappings}
                  placeholder="claude-sonnet-4-6=upstream-model"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setProviderForm((current) => ({ ...current, modelMappings: value }));
                  }}
                />
                <textarea
                  className="provider-gateway-panel__token-input"
                  value={providerForm.headers}
                  placeholder="Header-Name=value"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setProviderForm((current) => ({ ...current, headers: value }));
                  }}
                />
              </div>
            </details>
            <div className="provider-gateway-panel__actions">
              <button type="submit" className="integration-panel__refresh">
                {i18n.t("providerGateway.provider.save")}
              </button>
              <button
                type="button"
                className="integration-panel__refresh integration-panel__refresh--secondary"
                onClick={() => setEditingProviderId(null)}
              >
                {i18n.t("providerGateway.provider.cancel")}
              </button>
            </div>
          </form>
        ) : null}
      </details>

      <div className="display-panel__subsection-block">
        <div className="display-panel__header">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.models.title")}</div>
            <div className="display-panel__subtitle">{modelSummary(status, i18n.t)}</div>
          </div>
          <button
            type="button"
            className="integration-panel__refresh"
            disabled={healthChecking}
            onClick={() => {
              void onRunHealthCheck();
            }}
          >
            {healthChecking ? i18n.t("providerGateway.health.checking") : i18n.t("providerGateway.health.run")}
          </button>
        </div>
        <details className="provider-gateway-panel__details">
          <summary>{i18n.t("providerGateway.models.details")}</summary>
          <div className="provider-gateway-panel__mapping-list">
            <div className="provider-gateway-panel__mapping-row provider-gateway-panel__mapping-row--header">
              <span>{i18n.t("providerGateway.models.clientModel")}</span>
              <span>{i18n.t("providerGateway.models.upstreamModel")}</span>
              <span>{i18n.t("providerGateway.models.health")}</span>
            </div>
            {status.modelMappings.map((mapping) => (
              <div key={mapping.claudeModel} className="provider-gateway-panel__mapping-row">
                <span className="provider-gateway-panel__value" title={mapping.claudeModel}>
                  {mapping.claudeModel}
                </span>
                <span className="provider-gateway-panel__value" title={mapping.upstreamModel}>
                  {mapping.upstreamModel}
                </span>
                <span className={`hook-badge hook-badge--${mapping.health === "ok" ? "active" : mapping.health === "error" ? "repair" : "inactive"}`}>
                  {healthLabel(mapping.health, mapping.status)}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="display-panel__subsection-block">
        <div className="display-panel__header">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.claude.title")}</div>
            <div className="display-panel__subtitle">{i18n.t("providerGateway.claude.subtitle")}</div>
          </div>
          <div className="provider-gateway-panel__actions">
            <button
              type="button"
              className="integration-panel__refresh"
              disabled={clientSetupDisabled || clientSetupTarget !== null || claudeActive}
              onClick={() => {
                void onConfigureClient("claude-desktop");
              }}
            >
              {claudeActive
                ? i18n.t("providerGateway.client.activeClaude")
                : clientSetupTarget === "claude-desktop"
                ? i18n.t("providerGateway.client.configuring")
                : claudeConfigured
                ? i18n.t("providerGateway.client.activateClaude")
                : i18n.t("providerGateway.client.configureClaude")}
            </button>
            {status.claudeDesktop.setup.canRestore ? (
              <button
                type="button"
                className="integration-panel__refresh integration-panel__refresh--secondary"
                disabled={clientSetupTarget !== null || !claudeActive}
                onClick={() => {
                  void onConfigureClient("claude-desktop-restore");
                }}
              >
                {clientSetupTarget === "claude-desktop-restore"
                  ? i18n.t("providerGateway.client.configuring")
                  : i18n.t("providerGateway.client.restoreClaude")}
              </button>
            ) : null}
          </div>
        </div>
        <p className="provider-gateway-panel__setup-status">
          {setupLabel(status.claudeDesktop.setup, i18n.t("providerGateway.client.notConfigured"))}
        </p>
        <details className="provider-gateway-panel__details">
          <summary>{i18n.t("providerGateway.client.connectionDetails")}</summary>
          <div className="provider-gateway-panel__setup-list">
            <div className="provider-gateway-panel__setup-row">
              <span>{i18n.t("providerGateway.claude.baseUrl")}</span>
              <span className="provider-gateway-panel__value">{status.claudeDesktop.baseUrl}</span>
              <button type="button" className="integration-panel__refresh integration-panel__refresh--secondary" onClick={() => onCopy(status.claudeDesktop.baseUrl)}>
                {i18n.t("providerGateway.copyBaseUrl")}
              </button>
            </div>
            <div className="provider-gateway-panel__setup-row">
              <span>{i18n.t("providerGateway.claude.apiKey")}</span>
              <span className="provider-gateway-panel__value">{status.claudeDesktop.apiKey}</span>
              <button type="button" className="integration-panel__refresh integration-panel__refresh--secondary" onClick={() => onCopy(status.claudeDesktop.apiKey)}>
                {i18n.t("providerGateway.copyApiKey")}
              </button>
            </div>
            <div className="provider-gateway-panel__setup-row">
              <span>{i18n.t("providerGateway.claude.models")}</span>
              <span className="provider-gateway-panel__value" title={modelList}>
                {status.claudeDesktop.inferenceModels.length}
              </span>
              <button type="button" className="integration-panel__refresh integration-panel__refresh--secondary" onClick={() => onCopy(modelList)}>
                {i18n.t("providerGateway.copyModels")}
              </button>
            </div>
          </div>
        </details>
      </div>

      <div className="display-panel__subsection-block">
        <div className="display-panel__header">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.codex.title")}</div>
            <div className="display-panel__subtitle">{i18n.t("providerGateway.codex.subtitle")}</div>
          </div>
          <div className="provider-gateway-panel__actions">
            <button
              type="button"
              className="integration-panel__refresh"
              disabled={clientSetupDisabled || clientSetupTarget !== null || codexActive}
              onClick={() => {
                void onConfigureClient("codex-desktop");
              }}
            >
              {codexActive
                ? i18n.t("providerGateway.client.activeCodex")
                : clientSetupTarget === "codex-desktop"
                ? i18n.t("providerGateway.client.configuring")
                : codexConfigured
                ? i18n.t("providerGateway.client.activateCodex")
                : i18n.t("providerGateway.client.configureCodex")}
            </button>
            {status.codexDesktop.setup.canRestore ? (
              <button
                type="button"
                className="integration-panel__refresh integration-panel__refresh--secondary"
                disabled={clientSetupTarget !== null || !codexActive}
                onClick={() => {
                  void onConfigureClient("codex-desktop-restore");
                }}
              >
                {clientSetupTarget === "codex-desktop-restore"
                  ? i18n.t("providerGateway.client.configuring")
                  : i18n.t("providerGateway.client.restoreCodex")}
              </button>
            ) : null}
          </div>
        </div>
        <p className="provider-gateway-panel__setup-status">
          {setupLabel(status.codexDesktop.setup, i18n.t("providerGateway.client.notConfigured"))}
        </p>
        <details className="provider-gateway-panel__details">
          <summary>{i18n.t("providerGateway.client.connectionDetails")}</summary>
          <div className="provider-gateway-panel__setup-list">
            <div className="provider-gateway-panel__setup-row">
              <span>{i18n.t("providerGateway.codex.baseUrl")}</span>
              <span className="provider-gateway-panel__value">{status.codexDesktop.baseUrl}</span>
              <button type="button" className="integration-panel__refresh integration-panel__refresh--secondary" onClick={() => onCopy(status.codexDesktop.baseUrl)}>
                {i18n.t("providerGateway.copyBaseUrl")}
              </button>
            </div>
            <div className="provider-gateway-panel__setup-row">
              <span>{i18n.t("providerGateway.codex.profile")}</span>
              <span className="provider-gateway-panel__value">{status.codexDesktop.profileId}</span>
              <button type="button" className="integration-panel__refresh integration-panel__refresh--secondary" onClick={() => onCopy(codexConfig)}>
                {i18n.t("providerGateway.codex.copyConfig")}
              </button>
            </div>
            <div className="provider-gateway-panel__setup-row">
              <span>{i18n.t("providerGateway.codex.model")}</span>
              <span className="provider-gateway-panel__value">{status.codexDesktop.model}</span>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
