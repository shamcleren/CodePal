import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { canListen } from "./helpers/probeNetwork";

test.beforeEach(async () => {
  if (!(await canListen())) test.skip();
});

test("keeps the renderer alive while editing Provider Gateway providers", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-provider-gateway-edit-home-"));
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
    extraEnv: {
      CODEPAL_DISABLE_USAGE_BACKFILL: "1",
    },
  });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  try {
    const page = await codepal.app.firstWindow();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator(".app-settings-trigger").click();
    await page.locator(".settings-nav").getByRole("button", { name: /Provider Gateway/ }).click();
    await expect(page.locator(".provider-gateway-panel")).toBeVisible({
      timeout: 15_000,
    });
    const providerSections = page.locator(".provider-gateway-panel__details--section summary");
    await providerSections.first().waitFor({ state: "visible", timeout: 1_000 }).catch(() => undefined);
    if ((await providerSections.count()) < 2) {
      const startGateway = page.getByRole("button", { name: /Start Gateway|启动 Gateway/ });
      await expect(startGateway).toBeVisible({ timeout: 15_000 });
      await startGateway.click();
      await expect(providerSections.nth(1)).toBeVisible({ timeout: 15_000 });
    }
    await providerSections
      .nth(1)
      .evaluate((summary) => {
        (summary as HTMLElement).click();
      });
    await expect(page.getByRole("button", { name: /Add provider|新增 provider/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /Edit|编辑/ }).first().click();
    await page.locator('input[placeholder="Provider name"], input[placeholder="Provider 名称"]').fill("MiMo Gateway Edited");
    await expect(page.locator('input[placeholder="https://api.example.com/v1"]')).toBeVisible({
      timeout: 3_000,
    });
    await page.locator('input[placeholder="https://api.example.com/v1"]').fill("https://example.test/v1");
    await page.getByText(/Advanced configuration|高级配置/).click();
    await page.locator('textarea[placeholder="claude-sonnet-4-6=upstream-model"]').fill("default=test-model");

    await expect(page.getByRole("heading", { name: "CodePal", exact: true })).toBeVisible();
    await expect(page.locator(".provider-gateway-panel")).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
