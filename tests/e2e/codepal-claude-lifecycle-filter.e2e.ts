import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHistoryStore } from "../../src/main/history/historyStore";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { sendStatusChange } from "./helpers/sendStatusChange";

const SESSION_ID = "claude-lifecycle-filter-session";

function firstClaudeRow(page: import("@playwright/test").Page) {
  return page.getByLabel(/Claude (WAITING|RUNNING|DONE|IDLE|OFFLINE|ERROR)/).first();
}

test("hides low-value Claude lifecycle history lines in expanded details", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-claude-history-home-"));
  const userDataPath = path.join(homeDir, "Library", "Application Support", "CodePal");
  let historyStore: ReturnType<typeof createHistoryStore> | null = createHistoryStore({
    dbPath: path.join(userDataPath, "history.sqlite"),
  });
  const baseTimestamp = Date.now() - 10 * 60 * 1000;

  historyStore.writeSessionEvent({
    session: {
      id: SESSION_ID,
      tool: "claude",
      status: "completed",
      title: "claude lifecycle filter session",
      latestTask: "claude lifecycle filter session",
      updatedAt: baseTimestamp + 3,
      hasPendingActions: false,
    },
    activityItems: [
      {
        id: "persisted-stop",
        kind: "system",
        source: "system",
        title: "Claude request finished",
        body: "Claude request finished",
        timestamp: baseTimestamp + 3,
        tone: "completed",
      },
      {
        id: "persisted-start",
        kind: "system",
        source: "system",
        title: "Session started",
        body: "Claude session started",
        timestamp: baseTimestamp + 2,
      },
      {
        id: "persisted-user",
        kind: "message",
        source: "user",
        title: "User",
        body: "帮我整理一下这里的状态",
        timestamp: baseTimestamp + 1,
      },
    ],
  });
  historyStore.close();
  historyStore = null;

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

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: SESSION_ID,
        tool: "claude",
        status: "completed",
        task: "还是你有其他想法？",
        title: "还是你有其他想法？",
        timestamp: Date.now(),
        activityItems: [
          {
            id: "live-assistant",
            kind: "message",
            source: "assistant",
            title: "Assistant",
            body: "还是你有其他想法？",
            timestamp: Date.now(),
          },
        ],
      },
      codepal.ipcTarget,
    );

    const rowButton = firstClaudeRow(page);
    await expect(rowButton).toBeVisible({ timeout: 15_000 });
    await rowButton.click();

    const details = page.locator(".session-row__details").first();
    await expect(details).toContainText("还是你有其他想法？");
    await expect(details).toContainText("帮我整理一下这里的状态");
    await expect(details).not.toContainText("Claude request finished");
    await expect(details).not.toContainText("Claude session started");
  } finally {
    historyStore?.close();
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
