import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal, type LaunchedCodePal } from "./helpers/launchCodePal";
import { canListen } from "./helpers/probeNetwork";

test.beforeEach(async () => {
  if (!(await canListen())) test.skip();
});

async function launchWithHome(homeDir: string): Promise<LaunchedCodePal> {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
    extraEnv: {
      CODEPAL_DISABLE_USAGE_BACKFILL: "1",
    },
  });
  const close = codepal.close;
  return {
    ...codepal,
    close: async () => {
      await close().catch(() => undefined);
      await collector.close().catch(() => undefined);
    },
  };
}

test("persists CodeBuddy quota settings and opens a visible login window", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-codebuddy-quota-home-"));
  let codepal = await launchWithHome(homeDir);

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const settingsPath = await page.evaluate(() => window.codepal.getAppSettingsPath());
    expect(settingsPath).toBe(
      path.join(homeDir, "Library", "Application Support", "CodePal", "settings.yaml"),
    );

    await page.evaluate(() =>
      window.codepal.updateAppSettings({
        codebuddy: {
          code: {
            loginUrl: "https://example.invalid/codebuddy-login",
            quotaEndpoint: "https://example.invalid/api/query-quota",
          },
        },
      }),
    );
    await codepal.close();

    codepal = await launchWithHome(homeDir);
    const relaunchedPage = await codepal.app.firstWindow();
    await relaunchedPage.waitForLoadState("domcontentloaded");
    await expect(relaunchedPage.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(async () =>
        relaunchedPage.evaluate(() => window.codepal.reloadAppSettings()),
      )
      .toMatchObject({
        codebuddy: {
          code: {
            loginUrl: "https://example.invalid/codebuddy-login",
            quotaEndpoint: "https://example.invalid/api/query-quota",
          },
        },
      });

    await relaunchedPage.locator(".app-settings-trigger").click();
    await relaunchedPage
      .locator(".settings-nav")
      .getByRole("button", { name: /Preferences|偏好设置/ })
      .click();
    const quotaPanel = relaunchedPage.locator('[aria-label="CodeBuddy quota"]');
    await expect(quotaPanel.getByText(/Quota domain|额度域名/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(quotaPanel.locator("input")).toHaveCount(2);
    await expect(quotaPanel.locator("input").nth(0)).toHaveValue("example.invalid");
    await expect(quotaPanel.locator("input").nth(1)).toHaveValue("5");
    await expect(quotaPanel.getByText(/Login URL|登录地址/)).toHaveCount(0);
    await expect(quotaPanel.getByText(/Quota endpoint|额度接口/)).toHaveCount(0);
    await relaunchedPage.locator(".app-settings-close").click();

    const loginWindowPromise = codepal.app.waitForEvent("window");
    const connectPromise = relaunchedPage.evaluate(() =>
      window.codepal.connectCodeBuddyQuota("code"),
    );
    const loginPage = await loginWindowPromise;
    await expect
      .poll(() =>
        codepal.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(
            (window) => window.getTitle() === "登录 CodeBuddy 用量" && window.isVisible(),
          ),
        ),
      )
      .toBe(true);

    const loginPageClosed = loginPage.waitForEvent("close").catch(() => undefined);
    await codepal.app.evaluate(({ BrowserWindow }) => {
      const loginWindow = BrowserWindow.getAllWindows().find(
        (window) => window.getTitle() === "登录 CodeBuddy 用量",
      );
      loginWindow?.close();
    });
    await loginPageClosed;
    const connectResult = await connectPromise;
    expect(connectResult.synced).toBe(false);
    expect([
      "codebuddy.message.login_not_established",
      "codebuddy.message.open_failed",
    ]).toContain(connectResult.diagnostics.messageKey);
  } finally {
    await codepal.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
