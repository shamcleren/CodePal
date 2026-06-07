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

test("renders the designed settings sections without requiring Provider Gateway state", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-settings-nav-home-"));
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
    extraEnv: {
      CODEPAL_DISABLE_USAGE_BACKFILL: "1",
    },
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator(".app-settings-trigger").click();
    await expect(page.getByRole("dialog", { name: /Settings|设置/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Session Listener|会话监听/)).toBeVisible();
    await expect(page.getByText(/Provider token/)).toBeVisible();

    await page.locator(".settings-nav").getByRole("button", { name: /Agent Integrations|Agent 接入/ }).click();
    await expect(page.locator(".integration-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".integration-panel__metric-card--listener")).toBeVisible();
    await expect(page.locator(".integration-panel").getByRole("button", { name: /Refresh|刷新/ })).toBeVisible();

    await page.locator(".settings-nav").getByRole("button", { name: /Preferences|偏好设置/ }).click();
    await expect(page.getByRole("region", { name: /Display|显示/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Graphite Ops/)).toBeVisible();
    await expect(page.getByRole("region", { name: /Notifications|通知/ })).toBeVisible();

    await page.locator(".settings-nav").getByRole("button", { name: /Advanced|高级/ }).click();
    await expect(page.getByText(/App Updates|应用更新|应用更新/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("持久化历史", { exact: true }).or(page.getByText("Persisted History", { exact: true })),
    ).toBeVisible();
    await expect(page.locator('[aria-label="支持与诊断"], [aria-label="Support & Diagnostics"]')).toBeVisible();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
