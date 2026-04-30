import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHistoryStore } from "../../src/main/history/historyStore";
import type { ActivityItem } from "../../src/shared/sessionTypes";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { sendStatusChange } from "./helpers/sendStatusChange";

const SESSION_ID = "history-pagination-session";

function firstCursorRow(page: import("@playwright/test").Page) {
  return page.getByLabel(/Cursor (WAITING|RUNNING|DONE|IDLE|OFFLINE|ERROR)/).first();
}

function makeActivityItem(index: number, timestamp: number): ActivityItem {
  return {
    id: `persisted-history-${index}`,
    kind: "message",
    source: "assistant",
    title: "Assistant",
    body: `Persisted history item ${index}`,
    timestamp,
  };
}

test("loads older persisted history pages when scrolling upward", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-history-home-"));
  const userDataPath = path.join(homeDir, "Library", "Application Support", "CodePal");
  let historyStore: ReturnType<typeof createHistoryStore> | null = createHistoryStore({
    dbPath: path.join(userDataPath, "history.sqlite"),
  });
  const baseTimestamp = Date.now() - 10 * 60 * 1000;

  const persistedItems = Array.from({ length: 230 }, (_value, index) =>
    makeActivityItem(index, baseTimestamp + index),
  );

  historyStore.writeSessionEvent({
    session: {
      id: SESSION_ID,
      tool: "cursor",
      status: "waiting",
      title: "history pagination session",
      latestTask: "history pagination session",
      updatedAt: persistedItems[persistedItems.length - 1]?.timestamp ?? Date.now(),
      hasPendingActions: false,
    },
    activityItems: persistedItems,
  });
  historyStore.close();
  historyStore = null;

  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
  });

  try {
    const actualUserDataPath = await codepal.app.evaluate(async ({ app }) => {
      return app.getPath("userData");
    });
    expect(actualUserDataPath).toBe(userDataPath);

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
        task: "history pagination session",
        title: "history pagination session",
        timestamp: Date.now(),
        activityItems: [
          {
            id: "live-history-item",
            kind: "message",
            source: "assistant",
            title: "Assistant",
            body: "Live timeline item",
            timestamp: Date.now(),
          },
        ],
      },
      codepal.ipcTarget,
    );

    const firstPage = await page.evaluate(async (sessionId) => {
      return window.codepal.getSessionHistoryPage({
        sessionId,
        limit: 5,
      });
    }, SESSION_ID);

    expect(firstPage.items.map((item) => item.body)).toEqual([
      "Live timeline item",
      "Persisted history item 229",
      "Persisted history item 228",
      "Persisted history item 227",
      "Persisted history item 226",
    ]);

    const rowButton = firstCursorRow(page);
    await expect(rowButton).toBeVisible({ timeout: 15_000 });
    await rowButton.click();

    const details = page.locator(".session-row__details").first();
    await expect
      .poll(async () => {
        return (await details.textContent()) ?? "";
      }, {
        timeout: 15_000,
      })
      .toContain("Persisted history item 229");
    await expect(
      page.getByText(
        /Older history is available\. Keep scrolling up to load more…|还有更早历史，继续上滑即可加载…/,
      ),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("Persisted history item 0")).toBeHidden();

    await details.evaluate((node) => {
      node.scrollTop = 0;
    });
    await details.hover();
    await page.mouse.wheel(0, -700);
    // The "Recent items are shown" loading-more badge is a transient state —
    // with local SQLite the prefetch can resolve inside one render frame, so
    // we don't gate on it. Instead we observe the user-visible side effect:
    // after prefetching, the scroll-anchor restoration moves scrollTop off 0
    // so the user stays anchored to the same content while older items
    // appear above.
    await expect
      .poll(async () => {
        return details.evaluate((node) => node.scrollTop);
      }, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await details.evaluate((node) => {
        node.scrollTop = 0;
      });
      await details.hover();
      await page.mouse.wheel(0, -700);

      const oldestVisible = await page
        .getByText("Persisted history item 0")
        .isVisible()
        .catch(() => false);
      if (oldestVisible) {
        break;
      }

      await page.waitForTimeout(280);
    }

    await expect(page.getByText("Persisted history item 0")).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    historyStore?.close();
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
