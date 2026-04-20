import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { sendStatusChange } from "./helpers/sendStatusChange";

const TARGET_SESSION_ID = "notification-focus-target-session";

test("renders notification settings and persists notification toggles", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-notification-settings-home-"));
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await page.locator(".app-settings-trigger").click();
    await page.getByRole("button", { name: /Notifications|通知/ }).click();

    const enabledToggle = page.getByLabel(/Enable notifications|启用通知/);
    const soundToggle = page.getByLabel(/Play sounds|播放声音/);

    await expect(enabledToggle).toBeVisible({ timeout: 15_000 });
    if (!(await enabledToggle.isChecked())) {
      await enabledToggle.click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.codepal.getAppSettings().then((settings) => settings.notifications.enabled),
          ),
        )
        .toBe(true);
    }
    await expect(soundToggle).toBeVisible();

    await enabledToggle.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.codepal.getAppSettings().then((settings) => settings.notifications.enabled),
        ),
      )
      .toBe(false);
    await expect(soundToggle).toBeHidden();
    await expect(enabledToggle).not.toBeChecked();

    await enabledToggle.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.codepal.getAppSettings().then((settings) => settings.notifications.enabled),
        ),
      )
      .toBe(true);
    await expect(enabledToggle).toBeChecked();
    await expect(soundToggle).toBeVisible();
    // Sound toggle should start unchecked (soundEnabled defaults to false).
    // Wait for it to settle before clicking to avoid race conditions.
    await expect(soundToggle).not.toBeChecked({ timeout: 5_000 });
    await soundToggle.click();
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.codepal.getAppSettings().then((settings) => settings.notifications.soundEnabled),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect(soundToggle).toBeChecked();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("focus-session IPC expands and scrolls the target session into view", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-notification-focus-home-"));
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const baseTimestamp = Date.now() - 60_000;
    await sendStatusChange(
      {
        type: "status_change",
        sessionId: TARGET_SESSION_ID,
        tool: "cursor",
        status: "waiting",
        task: "notification focus target session",
        title: "notification focus target session",
        timestamp: baseTimestamp,
        activityItems: Array.from({ length: 28 }, (_value, index) => ({
          id: `notification-target-activity-${index}`,
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: `Notification target activity line ${index}`,
          timestamp: baseTimestamp + index,
        })),
      },
      codepal.ipcTarget,
    );

    for (let index = 0; index < 14; index += 1) {
      await sendStatusChange(
        {
          type: "status_change",
          sessionId: `notification-focus-filler-${index}`,
          tool: "cursor",
          status: "waiting",
          task: `notification focus filler session ${index}`,
          title: `notification focus filler session ${index}`,
          timestamp: baseTimestamp + 10_000 + index,
          activityItems: [
            {
              id: `notification-filler-activity-${index}`,
              kind: "message",
              source: "assistant",
              title: "Assistant",
              body: `Notification filler activity ${index}`,
              timestamp: baseTimestamp + 10_000 + index,
            },
          ],
        },
        codepal.ipcTarget,
      );
    }

    const sessionList = page.locator(".session-list");
    await expect(page.getByText("notification focus target session")).toBeVisible({
      timeout: 15_000,
    });
    await sessionList.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });

    await codepal.app.evaluate(({ BrowserWindow }, sessionId) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) {
        throw new Error("expected a BrowserWindow to send focus-session");
      }
      win.webContents.send("codepal:focus-session", sessionId);
    }, TARGET_SESSION_ID);

    const details = page.locator(".session-row__details").first();
    await expect(details.getByText("Notification target activity line 27")).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(async () => {
        return page.getByText("notification focus target session").evaluate((node) => {
          const row = node.closest(".session-row");
          const list = document.querySelector(".session-list");
          if (!row || !list) {
            return false;
          }
          const rowRect = row.getBoundingClientRect();
          const listRect = list.getBoundingClientRect();
          return rowRect.bottom > listRect.top && rowRect.top < listRect.bottom;
        });
      })
      .toBe(true);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
