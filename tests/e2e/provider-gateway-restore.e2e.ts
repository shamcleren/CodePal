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

test("stopping Provider Gateway restores Claude Desktop and Codex config without touching Claude CLI env", async () => {
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
    await page.evaluate(() => window.codepal.configureProviderGatewayClient("codex-desktop"));

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
