import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderGatewayStatus } from "../../shared/providerGatewayTypes";
import {
  codexConfigContents,
  configureProviderGatewayClient,
  inspectProviderGatewayClientSetup,
} from "./providerGatewayClientSetup";

const tempDirs: string[] = [];

function mkHome() {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-client-setup-"));
  tempDirs.push(homeDir);
  return homeDir;
}

function status(): ProviderGatewayStatus {
  return {
    enabled: true,
    listener: {
      state: "listening",
      host: "127.0.0.1",
      port: 15721,
      localUrl: "http://127.0.0.1:15721",
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
          "claude-sonnet-4-6": "mimo-v2.5",
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
        claudeModel: "claude-sonnet-4-6",
        upstreamModel: "mimo-v2.5",
        health: "ok",
        status: 200,
      },
    ],
    claudeDesktop: {
      baseUrl: "http://127.0.0.1:15721",
      apiKey: "local-proxy",
      authScheme: "bearer",
      inferenceModels: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"],
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
      model: "mimo-v2.5-pro",
      apiKey: "local-proxy",
      setup: {
        configured: false,
        restartRequired: false,
      },
    },
    lastHealthCheck: null,
  };
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("provider gateway client setup", () => {
  it("adds a Claude Desktop CodePal profile without replacing existing profiles", () => {
    const homeDir = mkHome();
    const configDir = path.join(homeDir, "Library", "Application Support", "Claude-3p", "configLibrary");
    fs.mkdirSync(configDir, { recursive: true });
    const existingPath = path.join(configDir, "existing.json");
    fs.writeFileSync(existingPath, JSON.stringify({ inferenceProvider: "anthropic", stale: true }), "utf8");
    fs.writeFileSync(
      path.join(configDir, "_meta.json"),
      JSON.stringify({ appliedId: "existing", entries: [{ id: "existing", name: "Original Claude" }] }),
      "utf8",
    );

    const result = configureProviderGatewayClient({
      target: "claude-desktop",
      status: status(),
      homeDir,
      now: () => 123,
    });

    expect(result).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(result.configPath).not.toBe(existingPath);
    expect(result.backupPath).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(existingPath, "utf8"))).toEqual({
      inferenceProvider: "anthropic",
      stale: true,
    });
    expect(JSON.parse(fs.readFileSync(result.configPath, "utf8"))).toEqual({
      inferenceProvider: "gateway",
      inferenceGatewayBaseUrl: "http://127.0.0.1:15721",
      inferenceGatewayApiKey: "local-proxy",
      inferenceGatewayAuthScheme: "bearer",
      disableDeploymentModeChooser: false,
      inferenceModels: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"],
      coworkEgressAllowedHosts: ["127.0.0.1", "localhost"],
    });
    const meta = JSON.parse(fs.readFileSync(path.join(configDir, "_meta.json"), "utf8"));
    expect(meta.entries).toContainEqual({ id: "existing", name: "Original Claude" });
    expect(meta.entries).toContainEqual({
      id: path.basename(result.configPath, ".json"),
      name: "CodePal Gateway",
    });
    expect(meta.appliedId).toBe(path.basename(result.configPath, ".json"));
    expect(fs.readFileSync(result.configPath, "utf8")).not.toContain("mimo.gateway.token");

    const restore = configureProviderGatewayClient({
      target: "claude-desktop-restore",
      status: status(),
      homeDir,
      now: () => 124,
    });

    const restoredMeta = JSON.parse(fs.readFileSync(path.join(configDir, "_meta.json"), "utf8"));
    expect(restore.changed).toBe(true);
    expect(restoredMeta.appliedId).toBe("existing");
    expect(restoredMeta.entries).toEqual([{ id: "existing", name: "Original Claude" }]);
    expect(restoredMeta.codePalPreviousAppliedId).toBeUndefined();
    expect(fs.existsSync(result.configPath)).toBe(false);
  });

  it("restores Claude Desktop to first-party mode when the previous profile was another gateway", () => {
    const homeDir = mkHome();
    const configDir = path.join(homeDir, "Library", "Application Support", "Claude-3p", "configLibrary");
    fs.mkdirSync(configDir, { recursive: true });
    const previousPath = path.join(configDir, "previous-gateway.json");
    fs.writeFileSync(previousPath, JSON.stringify({ inferenceProvider: "gateway" }), "utf8");
    const codepalPath = path.join(configDir, "codepal.json");
    fs.writeFileSync(codepalPath, JSON.stringify({ inferenceProvider: "gateway" }), "utf8");
    fs.writeFileSync(
      path.join(configDir, "_meta.json"),
      JSON.stringify({
        appliedId: "codepal",
        codePalPreviousAppliedId: "previous-gateway",
        entries: [
          { id: "previous-gateway", name: "MiMo Gateway" },
          { id: "codepal", name: "CodePal Gateway" },
        ],
      }),
      "utf8",
    );

    const restore = configureProviderGatewayClient({
      target: "claude-desktop-restore",
      status: status(),
      homeDir,
      now: () => 125,
    });

    const restoredMeta = JSON.parse(fs.readFileSync(path.join(configDir, "_meta.json"), "utf8"));
    expect(restore.changed).toBe(true);
    expect(restoredMeta.appliedId).toBeUndefined();
    expect(restoredMeta.entries).toEqual([{ id: "previous-gateway", name: "MiMo Gateway" }]);
    expect(fs.existsSync(codepalPath)).toBe(false);
  });

  it("does not create Claude Desktop metadata when there is no saved gateway state to restore", () => {
    const homeDir = mkHome();
    const metaPath = path.join(
      homeDir,
      "Library",
      "Application Support",
      "Claude-3p",
      "configLibrary",
      "_meta.json",
    );

    const restore = configureProviderGatewayClient({
      target: "claude-desktop-restore",
      status: status(),
      homeDir,
      now: () => 222,
    });

    expect(restore.changed).toBe(false);
    expect(fs.existsSync(metaPath)).toBe(false);
  });

  it("removes legacy Claude CLI gateway env when restoring Claude Desktop", () => {
    const homeDir = mkHome();
    const configDir = path.join(homeDir, "Library", "Application Support", "Claude-3p", "configLibrary");
    fs.mkdirSync(configDir, { recursive: true });
    const codepalPath = path.join(configDir, "codepal.json");
    fs.writeFileSync(codepalPath, JSON.stringify({ inferenceProvider: "gateway" }), "utf8");
    fs.writeFileSync(
      path.join(configDir, "_meta.json"),
      JSON.stringify({
        appliedId: "codepal",
        codePalPreviousAppliedId: null,
        entries: [{ id: "codepal", name: "CodePal Gateway" }],
      }),
      "utf8",
    );
    const claudeCliPath = path.join(homeDir, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(claudeCliPath), { recursive: true });
    fs.writeFileSync(
      claudeCliPath,
      JSON.stringify(
        {
          env: {
            CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
            ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
            ANTHROPIC_AUTH_TOKEN: "local-proxy",
            ANTHROPIC_MODEL: "claude-sonnet-4-6",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-7",
            ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
            USER_VALUE: "preserved",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const restore = configureProviderGatewayClient({
      target: "claude-desktop-restore",
      status: status(),
      homeDir,
      now: () => 333,
    });

    const parsed = JSON.parse(fs.readFileSync(claudeCliPath, "utf8"));
    expect(restore.changed).toBe(true);
    expect(parsed.env).toEqual({
      USER_VALUE: "preserved",
    });
  });

  it("keeps provider-switch Claude CLI env that does not point at CodePal", () => {
    const homeDir = mkHome();
    const configDir = path.join(homeDir, "Library", "Application Support", "Claude-3p", "configLibrary");
    fs.mkdirSync(configDir, { recursive: true });
    const codepalPath = path.join(configDir, "codepal.json");
    fs.writeFileSync(codepalPath, JSON.stringify({ inferenceProvider: "gateway" }), "utf8");
    fs.writeFileSync(
      path.join(configDir, "_meta.json"),
      JSON.stringify({
        appliedId: "codepal",
        codePalPreviousAppliedId: null,
        entries: [{ id: "codepal", name: "CodePal Gateway" }],
      }),
      "utf8",
    );
    const claudeCliPath = path.join(homeDir, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(claudeCliPath), { recursive: true });
    fs.writeFileSync(
      claudeCliPath,
      JSON.stringify(
        {
          env: {
            CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
            ANTHROPIC_BASE_URL: "https://ccswitch.example.test",
            ANTHROPIC_AUTH_TOKEN: "ccswitch-token",
            ANTHROPIC_MODEL: "ccswitch-model",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "ccswitch-sonnet",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    configureProviderGatewayClient({
      target: "claude-desktop-restore",
      status: status(),
      homeDir,
      now: () => 334,
    });

    const parsed = JSON.parse(fs.readFileSync(claudeCliPath, "utf8"));
    expect(parsed.env).toEqual({
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
      ANTHROPIC_BASE_URL: "https://ccswitch.example.test",
      ANTHROPIC_AUTH_TOKEN: "ccswitch-token",
      ANTHROPIC_MODEL: "ccswitch-model",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "ccswitch-sonnet",
    });
  });

  it("switches Codex globally to CodePal and can restore the previous default settings", () => {
    const homeDir = mkHome();
    const configDir = path.join(homeDir, ".codex");
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, "config.toml");
    fs.writeFileSync(
      configPath,
      [
        'model = "gpt-5.5"',
        'model_provider = "openai"',
        'model_reasoning_effort = "high"',
        "",
        "[projects.\"/tmp/demo\"]",
        'trust_level = "trusted"',
        "",
      ].join("\n"),
      "utf8",
    );

    const result = configureProviderGatewayClient({
      target: "codex-desktop",
      status: status(),
      homeDir,
      now: () => 456,
    });

    const contents = fs.readFileSync(configPath, "utf8");
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      configPath,
      backupPath: `${configPath}.bak.456`,
    });
    const root = contents.slice(0, contents.indexOf("[projects."));
    expect(root).toContain('model = "mimo-v2.5-pro"');
    expect(root).toContain('model_provider = "codepal"');
    expect(contents).toContain('model = "mimo-v2.5-pro"');
    expect(contents).toContain('model_provider = "codepal"');
    expect(contents).toContain("[model_providers.codepal]");
    expect(contents).toContain("[profiles.codepal-gateway]");
    expect(contents).toContain('base_url = "http://127.0.0.1:15721/v1"');
    expect(contents).toContain('wire_api = "responses"');
    expect(contents).toContain("requires_openai_auth = false");
    expect(contents).toContain('http_headers = { Authorization = "Bearer local-proxy" }');
    expect(contents).toContain("[projects.\"/tmp/demo\"]");
    expect(contents).not.toContain("mimo.gateway.token");
    expect(JSON.parse(fs.readFileSync(path.join(configDir, "codepal-provider-gateway-state.json"), "utf8"))).toMatchObject({
      previousModel: "gpt-5.5",
      previousModelProvider: "openai",
    });

    const restore = configureProviderGatewayClient({
      target: "codex-desktop-restore",
      status: status(),
      homeDir,
      now: () => 789,
    });

    const restored = fs.readFileSync(configPath, "utf8");
    const restoredRoot = restored.slice(0, restored.indexOf("[projects."));
    expect(restore.changed).toBe(true);
    expect(restoredRoot).toContain('model = "gpt-5.5"');
    expect(restoredRoot).toContain('model_provider = "openai"');
    expect(restoredRoot).not.toContain('model_provider = "codepal"');
    expect(restored).not.toContain("[profiles.codepal-gateway]");
    expect(restored).not.toContain("[model_providers.codepal]");
    expect(fs.existsSync(path.join(configDir, "codepal-provider-gateway-state.json"))).toBe(false);
  });

  it("does not create Codex config when there is no saved gateway state to restore", () => {
    const homeDir = mkHome();
    const configPath = path.join(homeDir, ".codex", "config.toml");

    const restore = configureProviderGatewayClient({
      target: "codex-desktop-restore",
      status: status(),
      homeDir,
      now: () => 333,
    });

    expect(restore.changed).toBe(false);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("removes legacy global CodePal defaults from older Codex auto setup", () => {
    const contents = codexConfigContents(
      [
        'model = "mimo-v2.5-pro"',
        'model_provider = "codepal"',
        'model_reasoning_effort = "high"',
        "",
        "[projects.\"/tmp/demo\"]",
        'trust_level = "trusted"',
        "",
      ].join("\n"),
      status(),
    );

    const root = contents.slice(0, contents.indexOf("[projects."));
    expect(root).not.toContain('model = "mimo-v2.5-pro"');
    expect(root).not.toContain('model_provider = "codepal"');
    expect(root).toContain('model_reasoning_effort = "high"');
    expect(contents).toContain("[profiles.codepal-gateway]");
    expect(contents).toContain('model = "mimo-v2.5-pro"');
    expect(contents).toContain('model_provider = "codepal"');
  });

  it("keeps Codex managed provider block idempotent", () => {
    const first = codexConfigContents("", status());
    const second = codexConfigContents(first, status());

    expect(second.match(/BEGIN CODEPAL PROVIDER GATEWAY/g)).toHaveLength(1);
    expect(second.match(/\[model_providers\.codepal\]/g)).toHaveLength(1);
  });

  it("reports configured client setup status after writing configs", () => {
    const homeDir = mkHome();
    configureProviderGatewayClient({
      target: "claude-desktop",
      status: status(),
      homeDir,
      now: () => 1,
    });
    configureProviderGatewayClient({
      target: "codex-desktop",
      status: status(),
      homeDir,
      now: () => 2,
    });

    expect(inspectProviderGatewayClientSetup({
      target: "claude-desktop",
      status: status(),
      homeDir,
    })).toMatchObject({
      configured: true,
      active: true,
      restartRequired: true,
    });
    expect(inspectProviderGatewayClientSetup({
      target: "codex-desktop",
      status: status(),
      homeDir,
    })).toMatchObject({
      configured: true,
      active: true,
      canRestore: true,
      restartRequired: true,
    });
  });
});
