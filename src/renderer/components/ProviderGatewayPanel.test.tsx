import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProviderGatewayStatus } from "../../shared/providerGatewayTypes";
import { I18nProvider } from "../i18n";
import { ProviderGatewayPanel } from "./ProviderGatewayPanel";

const status: ProviderGatewayStatus = {
  enabled: true,
  listener: {
    state: "listening",
    localUrl: "http://127.0.0.1:15721",
    host: "127.0.0.1",
    port: 15721,
  },
  activeProviderId: "mimo",
  providerOptions: [
    {
      id: "mimo",
      type: "anthropic-compatible",
      displayName: "MiMo Gateway",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
      authScheme: "bearer",
      tokenConfigured: true,
      tokenSource: "local",
      envFallback: "MIMO_GATEWAY_TOKEN",
      headers: {},
      modelMappings: {
        "anthropic/MiMo-V2.5-Pro": "mimo-v2.5-pro",
      },
    },
    {
      id: "qwen",
      type: "openai-chat-compatible",
      displayName: "Qwen DashScope",
      baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      authScheme: "bearer",
      tokenConfigured: false,
      tokenSource: "missing",
      envFallback: "DASHSCOPE_API_KEY",
      headers: {},
      modelMappings: {
        default: "qwen-plus",
      },
    },
  ],
  provider: {
    id: "mimo",
    type: "anthropic-compatible",
    displayName: "MiMo Gateway",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
    authScheme: "bearer",
    tokenConfigured: true,
    tokenSource: "local",
    envFallback: "MIMO_GATEWAY_TOKEN",
  },
  modelMappings: [
    {
      claudeModel: "anthropic/MiMo-V2.5-Pro",
      upstreamModel: "mimo-v2.5-pro",
      health: "ok",
      status: 200,
    },
  ],
  claudeDesktop: {
    baseUrl: "http://127.0.0.1:15721",
    apiKey: "local-proxy",
    authScheme: "bearer",
    inferenceModels: ["anthropic/MiMo-V2.5-Pro"],
    setup: {
      configured: false,
      restartRequired: false,
    },
  },
  codexDesktop: {
    baseUrl: "http://127.0.0.1:15721/v1",
    providerId: "codepal",
    profileId: "codepal-gateway",
    wireApi: "responses",
    model: "anthropic/MiMo-V2.5-Pro",
    apiKey: "local-proxy",
    setup: {
      configured: false,
      restartRequired: false,
    },
  },
  lastHealthCheck: null,
};

function renderPanel(nextStatus: ProviderGatewayStatus | null = status) {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <ProviderGatewayPanel
        status={nextStatus}
        loading={false}
        tokenSaving={false}
        healthChecking={false}
        clientSetupTarget={null}
        feedback={null}
        error={null}
        onRefresh={vi.fn()}
        onSelectProvider={vi.fn()}
        onSaveProvider={vi.fn()}
        onDeleteProvider={vi.fn()}
        onSaveToken={vi.fn()}
        onRunHealthCheck={vi.fn()}
        onStartGateway={vi.fn()}
        onStopGateway={vi.fn()}
        onConfigureClient={vi.fn()}
        onCopy={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("ProviderGatewayPanel", () => {
  it("renders provider status and model mappings without secrets", () => {
    const html = renderPanel();

    expect(html).toContain("MiMo Gateway");
    expect(html).toContain("Qwen DashScope");
    expect(html).toContain("Local token");
    expect(html).toContain("Token missing");
    expect(html).toContain("Add provider");
    expect(html).toContain("Edit");
    expect(html).toContain("http://127.0.0.1:15721");
    expect(html).toContain("http://127.0.0.1:15721/v1");
    expect(html).toContain("Codex Desktop setup");
    expect(html).toContain("Copy config");
    expect(html).toContain("Claude model");
    expect(html).toContain("Upstream model");
    expect(html).toContain("anthropic/MiMo-V2.5-Pro");
    expect(html).toContain("mimo-v2.5-pro");
    expect(html).toContain("local-proxy");
    expect(html).toContain("Token configured");
    expect(html).not.toContain("mimo.gateway.token");
  });

  it("keeps advanced gateway configuration collapsed by default", () => {
    const html = renderPanel();

    expect(html).toContain("Stop Gateway");
    expect(html).toContain("View model mappings");
    expect(html).toContain("View connection details");
    expect(html).toContain("1 mappings · 1 OK · 0 errors");
    expect(html).not.toContain("Header-Name=value");
    expect(html).not.toContain("<details open");
  });

  it("renders a missing token state", () => {
    const html = renderPanel({
      ...status,
      provider: status.provider ? { ...status.provider, tokenConfigured: false } : null,
    });

    expect(html).toContain("Token missing");
  });

  it("keeps the start action available after the gateway is stopped", () => {
    const html = renderPanel({
      ...status,
      enabled: false,
      listener: {
        state: "unavailable",
        localUrl: "http://127.0.0.1:15721",
        host: "127.0.0.1",
        port: 15721,
        message: "Provider gateway not started",
      },
    });

    expect(html).toContain("Provider gateway not started");
    expect(html).toContain("Start Gateway");
    expect(html).not.toContain("Current provider");
    expect(html).not.toContain("Provider token");
    expect(html).not.toContain("Provider profile");
    expect(html).not.toContain("Save token");
    expect(html).not.toContain("MiMo Gateway · Local token");
    expect(html).not.toContain("Configure Claude");
    expect(html).not.toContain("Configure Codex");
    expect(html).not.toContain("Stop Gateway");
  });

  it("requires starting the gateway before client setup actions can write agent config", () => {
    const html = renderPanel({
      ...status,
      listener: {
        state: "disabled",
        localUrl: "http://127.0.0.1:15721",
        host: "127.0.0.1",
        port: 15721,
      },
    });

    expect(html).toContain("Start Gateway");
    expect(html).toContain("Gateway not running");
    expect(html).toContain("While stopped, CodePal will not write or change Claude / Codex config.");
    expect(html).not.toContain("Current provider");
    expect(html).not.toContain("Provider token");
    expect(html).not.toContain("Provider profile");
    expect(html).not.toContain("Configure Claude");
    expect(html).not.toContain("Configure Codex");
    expect(html).not.toContain("Providers");
    expect(html).not.toContain("Model mappings");
    expect(html).not.toContain("Codex Desktop setup");
  });

  it("disables client setup actions after matching config is detected", () => {
    const html = renderPanel({
      ...status,
      claudeDesktop: {
        ...status.claudeDesktop,
        setup: {
          configured: true,
          active: true,
          canRestore: true,
          restartRequired: true,
          message: "Configured and active. Restart Claude Desktop to make sure it reloads this gateway profile.",
        },
      },
      codexDesktop: {
        ...status.codexDesktop,
        setup: {
          configured: true,
          active: true,
          canRestore: true,
          restartRequired: true,
          message: "Configured and active. Restart Codex Desktop to reload CodePal Gateway.",
        },
      },
    });

    expect(html).toContain("Configured");
    expect(html).toContain("Restart Claude Desktop");
    expect(html).toContain("Restart Codex Desktop");
    expect(html).toContain("Claude on CodePal");
    expect(html).toContain("Codex on CodePal");
    expect(html).toContain("Restore Claude");
    expect(html).toContain("Restore Codex");
  });

  it("keeps Claude setup action available when the CodePal profile is configured but inactive", () => {
    const html = renderPanel({
      ...status,
      claudeDesktop: {
        ...status.claudeDesktop,
        setup: {
          configured: true,
          active: false,
          restartRequired: true,
          message: "Configured but not active. Click Configure Claude to switch Claude Desktop to CodePal Gateway.",
        },
      },
    });

    expect(html).toContain("Switch to CodePal");
    expect(html).not.toContain("Claude on CodePal");
  });
});
