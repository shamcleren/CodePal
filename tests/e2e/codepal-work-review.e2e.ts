import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { canListen } from "./helpers/probeNetwork";
import { sendStatusChange } from "./helpers/sendStatusChange";

test.beforeEach(async () => {
  if (!(await canListen())) test.skip();
});

test("renders Work Review from live sessions and jumps back to the current session", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-work-review-home-"));
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

    const timestamp = Date.now() - 90_000;
    await sendStatusChange(
      {
        type: "status_change",
        sessionId: "work-review-e2e-session",
        tool: "codex",
        status: "running",
        task: "Ship Work Review E2E coverage",
        title: "Ship Work Review E2E coverage",
        timestamp,
        latestRunningStartedAt: timestamp,
      },
      codepal.ipcTarget,
    );

    await expect(page.getByText("Ship Work Review E2E coverage")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /Work Review|工作回顾/ }).click();
    await expect(page.getByRole("heading", { name: /Work Review|工作回顾/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Ship Work Review E2E coverage")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(".work-review__coverage")).toBeVisible();

    await page.getByRole("button", { name: /30 days|30 天/ }).click();
    await expect(page.getByRole("button", { name: /30 days|30 天/ })).toHaveClass(
      /work-review__range-btn--active/,
    );

    await page.getByRole("button", { name: /Open session|查看会话/ }).click();
    await expect(page.locator(".session-list")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Ship Work Review E2E coverage")).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
