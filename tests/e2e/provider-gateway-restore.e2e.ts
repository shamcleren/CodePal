import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { getFreePort } from "./helpers/getFreePort";
import { launchCodePal } from "./helpers/launchCodePal";
import { canListen } from "./helpers/probeNetwork";

test.beforeEach(async () => {
  if (!(await canListen())) test.skip();
});

test("stopping Provider Gateway restores Claude Desktop, Codex, and previous Claude CLI env", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-provider-gateway-home-"));
  const claudeDesktopConfigDir = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Claude-3p",
    "configLibrary",
  );
  const codexConfigDir = path.join(homeDir, ".codex");
  const claudeCliConfigPath = path.join(homeDir, ".claude", "settings.json");
  const codexConfigPath = path.join(codexConfigDir, "config.toml");
  const gatewayPort = await getFreePort();

  await fs.mkdir(claudeDesktopConfigDir, { recursive: true });
  await fs.writeFile(
    path.join(claudeDesktopConfigDir, "existing.json"),
    JSON.stringify({ inferenceProvider: "anthropic", label: "original" }, null, 2),
  );
  await fs.writeFile(
    path.join(claudeDesktopConfigDir, "_meta.json"),
    JSON.stringify(
      {
        appliedId: "existing",
        entries: [{ id: "existing", name: "Original Claude" }],
      },
      null,
      2,
    ),
  );

  await fs.mkdir(path.dirname(claudeCliConfigPath), { recursive: true });
  await fs.writeFile(
    claudeCliConfigPath,
    JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://ccswitch.example.test" } }, null, 2),
  );

  await fs.mkdir(codexConfigDir, { recursive: true });
  await fs.writeFile(
    codexConfigPath,
    [
      'model = "gpt-5.5"',
      'model_provider = "openai"',
      'model_reasoning_effort = "high"',
      "",
      "[projects.\"/tmp/demo\"]",
      'trust_level = "trusted"',
      "",
    ].join("\n"),
  );

  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
    extraEnv: {
      CODEPAL_GATEWAY_PORT: String(gatewayPort),
    },
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const statusAfterStart = await page.evaluate(() => window.codepal.startProviderGateway());
    expect(statusAfterStart.listener.state).toBe("listening");

    await page.evaluate(() => window.codepal.configureProviderGatewayClient("claude-desktop"));
    await page.evaluate(() => window.codepal.configureProviderGatewayClient("claude-cli"));
    await page.evaluate(() => window.codepal.configureProviderGatewayClient("codex-desktop"));

    const claudeCliConfigured = JSON.parse(await fs.readFile(claudeCliConfigPath, "utf8")) as {
      env?: Record<string, string>;
    };
    expect(claudeCliConfigured.env).toMatchObject({
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayPort}`,
      ANTHROPIC_AUTH_TOKEN: "local-proxy",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
    });

    const codexConfigured = await fs.readFile(codexConfigPath, "utf8");
    expect(codexConfigured).toContain('model_provider = "codepal"');
    expect(codexConfigured).toContain("[model_providers.codepal]");

    const statusAfterStop = await page.evaluate(() => window.codepal.stopProviderGateway());
    expect(statusAfterStop.listener.state).toBe("unavailable");
    expect(statusAfterStop.listener.message).toContain("not started");

    await page.locator(".app-settings-trigger").click();
    await page.locator(".settings-nav").getByRole("button", { name: /Provider Gateway/ }).click();
    await expect(page.getByRole("button", { name: /Start Gateway|启动 Gateway/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Stop Gateway|关闭 Gateway/ })).toHaveCount(0);

    const restoredMeta = JSON.parse(
      await fs.readFile(path.join(claudeDesktopConfigDir, "_meta.json"), "utf8"),
    ) as { appliedId?: string; codePalPreviousAppliedId?: string; entries?: Array<{ id: string; name: string }> };
    expect(restoredMeta.appliedId).toBe("existing");
    expect(restoredMeta.codePalPreviousAppliedId).toBeUndefined();
    expect(restoredMeta.entries).toEqual([{ id: "existing", name: "Original Claude" }]);

    const restoredCodex = await fs.readFile(codexConfigPath, "utf8");
    const restoredRoot = restoredCodex.slice(0, restoredCodex.indexOf("[projects."));
    expect(restoredRoot).toContain('model = "gpt-5.5"');
    expect(restoredRoot).toContain('model_provider = "openai"');
    expect(restoredCodex).not.toContain('model_provider = "codepal"');
    expect(restoredCodex).not.toContain("[model_providers.codepal]");
    await expect(fs.access(path.join(codexConfigDir, "codepal-provider-gateway-state.json"))).rejects.toThrow();

    const claudeCliConfig = JSON.parse(await fs.readFile(claudeCliConfigPath, "utf8")) as {
      env?: Record<string, string>;
    };
    expect(claudeCliConfig.env).toEqual({
      ANTHROPIC_BASE_URL: "https://ccswitch.example.test",
    });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("stopping Provider Gateway removes legacy Claude CLI CodePal gateway env", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-provider-gateway-legacy-env-home-"));
  const claudeCliConfigPath = path.join(homeDir, ".claude", "settings.json");
  const gatewayPort = await getFreePort();

  await fs.mkdir(path.dirname(claudeCliConfigPath), { recursive: true });
  await fs.writeFile(
    claudeCliConfigPath,
    JSON.stringify(
      {
        env: {
          CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayPort}`,
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
  );

  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
    extraEnv: {
      CODEPAL_GATEWAY_PORT: String(gatewayPort),
    },
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const statusAfterStart = await page.evaluate(() => window.codepal.startProviderGateway());
    expect(statusAfterStart.listener.state).toBe("listening");

    const statusAfterStop = await page.evaluate(() => window.codepal.stopProviderGateway());
    expect(statusAfterStop.listener.state).toBe("unavailable");

    const claudeCliConfig = JSON.parse(await fs.readFile(claudeCliConfigPath, "utf8")) as {
      env?: Record<string, string>;
    };
    expect(claudeCliConfig.env).toEqual({
      USER_VALUE: "preserved",
    });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("Claude CLI configure remains available when desktop is active but CLI env is missing", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-provider-gateway-cli-missing-home-"));
  const claudeDesktopConfigDir = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Claude-3p",
    "configLibrary",
  );
  const claudeCliConfigPath = path.join(homeDir, ".claude", "settings.json");
  const gatewayPort = await getFreePort();

  await fs.mkdir(claudeDesktopConfigDir, { recursive: true });
  await fs.writeFile(
    path.join(claudeDesktopConfigDir, "codepal.json"),
    JSON.stringify(
      {
        inferenceProvider: "gateway",
        inferenceGatewayBaseUrl: `http://127.0.0.1:${gatewayPort}`,
        inferenceGatewayApiKey: "local-proxy",
        inferenceGatewayAuthScheme: "bearer",
        disableDeploymentModeChooser: false,
        inferenceModels: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"],
        coworkEgressAllowedHosts: ["127.0.0.1", "localhost"],
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(claudeDesktopConfigDir, "_meta.json"),
    JSON.stringify(
      {
        appliedId: "codepal",
        entries: [{ id: "codepal", name: "CodePal Gateway" }],
        codePalPreviousAppliedId: null,
      },
      null,
      2,
    ),
  );
  await fs.mkdir(path.dirname(claudeCliConfigPath), { recursive: true });
  await fs.writeFile(claudeCliConfigPath, JSON.stringify({ model: "opus", env: {} }, null, 2));

  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
    extraEnv: {
      CODEPAL_GATEWAY_PORT: String(gatewayPort),
    },
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const statusAfterStart = await page.evaluate(() => window.codepal.startProviderGateway());
    expect(statusAfterStart.listener.state).toBe("listening");

    await page.locator(".app-settings-trigger").click();
    await page.locator(".settings-nav").getByRole("button", { name: /Provider Gateway/ }).click();
    const configureButton = page.getByRole("button", { name: /配置 Claude CLI|Configure Claude CLI/ });
    await expect(configureButton).toBeEnabled();
    await configureButton.click();

    const claudeCliConfig = JSON.parse(await fs.readFile(claudeCliConfigPath, "utf8")) as {
      env?: Record<string, string>;
    };
    expect(claudeCliConfig.env).toMatchObject({
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayPort}`,
      ANTHROPIC_AUTH_TOKEN: "local-proxy",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
    });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("quitting CodePal restores client configs and next startup resumes them", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-provider-gateway-resume-home-"));
  const claudeDesktopConfigDir = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Claude-3p",
    "configLibrary",
  );
  const codexConfigDir = path.join(homeDir, ".codex");
  const claudeCliConfigPath = path.join(homeDir, ".claude", "settings.json");
  const codexConfigPath = path.join(codexConfigDir, "config.toml");
  const runtimeStatePath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "CodePal",
    "provider-gateway-runtime-state.json",
  );
  const gatewayPort = await getFreePort();

  await fs.mkdir(claudeDesktopConfigDir, { recursive: true });
  await fs.writeFile(
    path.join(claudeDesktopConfigDir, "existing.json"),
    JSON.stringify({ inferenceProvider: "anthropic", label: "original" }, null, 2),
  );
  await fs.writeFile(
    path.join(claudeDesktopConfigDir, "_meta.json"),
    JSON.stringify(
      {
        appliedId: "existing",
        entries: [{ id: "existing", name: "Original Claude" }],
      },
      null,
      2,
    ),
  );

  await fs.mkdir(path.dirname(claudeCliConfigPath), { recursive: true });
  await fs.writeFile(
    claudeCliConfigPath,
    JSON.stringify({ env: { USER_VALUE: "preserved" } }, null, 2),
  );

  await fs.mkdir(codexConfigDir, { recursive: true });
  await fs.writeFile(
    codexConfigPath,
    [
      'model = "gpt-5.5"',
      'model_provider = "openai"',
      "",
      "[projects.\"/tmp/demo\"]",
      'trust_level = "trusted"',
      "",
    ].join("\n"),
  );

  const launch = () =>
    launchCodePal({
      actionResponseTarget: collector.responseTarget,
      homeDir,
      extraEnv: {
        CODEPAL_GATEWAY_PORT: String(gatewayPort),
      },
    });

  let codepal = await launch();

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const statusAfterStart = await page.evaluate(() => window.codepal.startProviderGateway());
    expect(statusAfterStart.listener.state).toBe("listening");

    await page.evaluate(() => window.codepal.configureProviderGatewayClient("claude-desktop"));
    await page.evaluate(() => window.codepal.configureProviderGatewayClient("claude-cli"));
    await page.evaluate(() => window.codepal.configureProviderGatewayClient("codex-desktop"));

    await codepal.close();

    const restoredMeta = JSON.parse(
      await fs.readFile(path.join(claudeDesktopConfigDir, "_meta.json"), "utf8"),
    ) as { appliedId?: string; entries?: Array<{ id: string; name: string }> };
    expect(restoredMeta.appliedId).toBe("existing");
    expect(restoredMeta.entries).toEqual([{ id: "existing", name: "Original Claude" }]);

    const restoredCodex = await fs.readFile(codexConfigPath, "utf8");
    expect(restoredCodex).toContain('model_provider = "openai"');
    expect(restoredCodex).not.toContain('model_provider = "codepal"');

    const restoredClaudeCli = JSON.parse(await fs.readFile(claudeCliConfigPath, "utf8")) as {
      env?: Record<string, string>;
    };
    expect(restoredClaudeCli.env).toEqual({ USER_VALUE: "preserved" });

    const runtimeState = JSON.parse(await fs.readFile(runtimeStatePath, "utf8")) as {
      targets?: string[];
    };
    expect(runtimeState.targets).toEqual(["claude-desktop", "codex-desktop", "claude-cli"]);

    codepal = await launch();
    const restartedPage = await codepal.app.firstWindow();
    await restartedPage.waitForLoadState("domcontentloaded");
    await expect(restartedPage.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const resumedMeta = JSON.parse(
      await fs.readFile(path.join(claudeDesktopConfigDir, "_meta.json"), "utf8"),
    ) as { appliedId?: string; entries?: Array<{ id: string; name: string }> };
    expect(resumedMeta.appliedId).not.toBe("existing");
    expect(resumedMeta.entries?.some((entry) => entry.name === "CodePal Gateway")).toBe(true);

    const resumedCodex = await fs.readFile(codexConfigPath, "utf8");
    expect(resumedCodex).toContain('model_provider = "codepal"');
    expect(resumedCodex).toContain("[model_providers.codepal]");

    const resumedClaudeCli = JSON.parse(await fs.readFile(claudeCliConfigPath, "utf8")) as {
      env?: Record<string, string>;
    };
    expect(resumedClaudeCli.env).toMatchObject({
      USER_VALUE: "preserved",
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayPort}`,
      ANTHROPIC_AUTH_TOKEN: "local-proxy",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
    });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
