import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHistoryStore } from "../../src/main/history/historyStore";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { sendStatusChange } from "./helpers/sendStatusChange";

const SESSION_ID = "history-retry-session";

test("retries session history without requiring the row to close", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-history-retry-home-"));
  const userDataPath = path.join(homeDir, "Library", "Application Support", "CodePal");
  const historyStore = createHistoryStore({
    dbPath: path.join(userDataPath, "history.sqlite"),
  });
  const persistedTimestamp = Date.now() - 5_000;

  historyStore.writeSessionEvent({
    session: {
      id: SESSION_ID,
      tool: "cursor",
      status: "waiting",
      title: "history retry session",
      latestTask: "history retry session",
      updatedAt: persistedTimestamp,
      hasPendingActions: false,
    },
    activityItems: [
      {
        id: "persisted-e2e-1",
        kind: "message",
        source: "assistant",
        title: "Assistant",
        body: "Persisted history recovered on retry",
        timestamp: persistedTimestamp,
      },
    ],
  });
  historyStore.close();

  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
    extraEnv: {
      CODEPAL_E2E_HISTORY_FAIL_ONCE_SESSION: SESSION_ID,
    },
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: SESSION_ID,
        tool: "cursor",
        status: "waiting",
        task: "history retry session",
        timestamp: Date.now(),
        activityItems: [
          {
            id: "live-e2e-1",
            kind: "message",
            source: "assistant",
            title: "Assistant",
            body: "Live timeline still visible",
            timestamp: Date.now(),
          },
        ],
      },
      codepal.ipcTarget,
    );

    const rowButton = page
      .getByText("history retry session")
      .locator("xpath=ancestor::button[1]");
    await expect(rowButton).toBeVisible({ timeout: 15_000 });
    await rowButton.click();

    const retryButton = page.getByRole("button", {
      name: /Local history is unavailable\. Click to retry|本地历史暂时不可用，点此重试/,
    });
    await expect(retryButton).toBeVisible({ timeout: 15_000 });
    await retryButton.click();

    await expect(page.getByText("Persisted history recovered on retry")).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
