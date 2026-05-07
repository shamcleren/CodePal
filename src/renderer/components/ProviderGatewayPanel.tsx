import { useState } from "react";
import type { FormEvent } from "react";
import type {
  ProviderGatewayClientSetupTarget,
  ProviderGatewayClientSetupStatus,
  ProviderGatewayStatus,
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
  onSaveToken: (providerId: string, token: string) => Promise<void> | void;
  onRunHealthCheck: () => Promise<void> | void;
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

export function ProviderGatewayPanel({
  status,
  loading,
  tokenSaving,
  healthChecking,
  clientSetupTarget,
  feedback,
  error,
  onRefresh,
  onSaveToken,
  onRunHealthCheck,
  onConfigureClient,
  onCopy,
}: ProviderGatewayPanelProps) {
  const i18n = useI18n();
  const [tokenDraft, setTokenDraft] = useState("");
  const providerId = status?.activeProviderId ?? "";
  const canSaveToken = Boolean(providerId && tokenDraft.trim() && !tokenSaving);

  async function handleTokenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSaveToken) {
      return;
    }
    await onSaveToken(providerId, tokenDraft);
    setTokenDraft("");
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
  const modelList = status.claudeDesktop.inferenceModels.join("\n");
  const claudeConfigured = status.claudeDesktop.setup.configured;
  const claudeActive = claudeConfigured && status.claudeDesktop.setup.active;
  const codexConfigured = status.codexDesktop.setup.configured;
  const codexActive = codexConfigured && status.codexDesktop.setup.active;
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
      </div>

      {feedback ? <p className="integration-panel__feedback">{feedback}</p> : null}
      {error ? <p className="integration-panel__error">{error}</p> : null}

      <div className="provider-gateway-panel__status-grid">
        <div className="display-panel__card">
          <div className="display-panel__title">{i18n.t("providerGateway.status.local")}</div>
          <div className="provider-gateway-panel__value" title={listenerLabel(status)}>
            {listenerLabel(status)}
          </div>
        </div>
        <div className="display-panel__card">
          <div className="display-panel__title">{i18n.t("providerGateway.status.provider")}</div>
          <div className="provider-gateway-panel__value">
            {status.provider?.displayName ?? i18n.t("providerGateway.provider.missing")}
          </div>
        </div>
        <div className="display-panel__card">
          <div className="display-panel__title">{i18n.t("providerGateway.token.title")}</div>
          <div className="provider-gateway-panel__value">{tokenLabel}</div>
        </div>
      </div>

      <div className="display-panel__subsection-block">
        <div className="display-panel__header">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.profile.title")}</div>
            <div className="display-panel__subtitle">
              {status.provider?.baseUrl ?? i18n.t("providerGateway.provider.missing")}
            </div>
          </div>
        </div>
        <form className="provider-gateway-panel__token-form" onSubmit={handleTokenSubmit}>
          <input
            className="provider-gateway-panel__token-input"
            type="password"
            value={tokenDraft}
            placeholder={i18n.t("providerGateway.token.placeholder")}
            onChange={(event) => setTokenDraft(event.currentTarget.value)}
          />
          <button
            type="submit"
            className="integration-panel__refresh"
            disabled={!canSaveToken}
          >
            {tokenSaving ? i18n.t("providerGateway.token.saving") : i18n.t("providerGateway.token.save")}
          </button>
        </form>
      </div>

      <div className="display-panel__subsection-block">
        <div className="display-panel__header">
          <div>
            <div className="display-panel__title">{i18n.t("providerGateway.models.title")}</div>
            <div className="display-panel__subtitle">{i18n.t("providerGateway.models.subtitle")}</div>
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
        <div className="provider-gateway-panel__mapping-list">
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
              disabled={clientSetupTarget !== null || claudeActive}
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
              disabled={clientSetupTarget !== null || codexActive}
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
      </div>
    </section>
  );
}
