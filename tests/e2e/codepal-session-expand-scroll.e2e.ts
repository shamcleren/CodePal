import { expect, test } from "@playwright/test";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { sendStatusChange } from "./helpers/sendStatusChange";

const TARGET_SESSION_ID = "expand-scroll-target-session";

test("keeps the session list pinned to the expanded row bottom", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
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
        task: "expand scroll target session",
        title: "expand scroll target session",
        timestamp: baseTimestamp,
        activityItems: Array.from({ length: 28 }, (_value, index) => ({
          id: `target-activity-${index}`,
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: `Expanded target activity line ${index}`,
          timestamp: baseTimestamp + index,
        })),
      },
      codepal.ipcTarget,
    );

    for (let index = 0; index < 14; index += 1) {
      await sendStatusChange(
        {
          type: "status_change",
          sessionId: `expand-scroll-filler-${index}`,
          tool: "cursor",
          status: "waiting",
          task: `expand scroll filler session ${index}`,
          title: `expand scroll filler session ${index}`,
          timestamp: baseTimestamp + 10_000 + index,
          activityItems: [
            {
              id: `filler-activity-${index}`,
              kind: "message",
              source: "assistant",
              title: "Assistant",
              body: `Filler activity ${index}`,
              timestamp: baseTimestamp + 10_000 + index,
            },
          ],
        },
        codepal.ipcTarget,
      );
    }

    const sessionList = page.locator(".session-list");
    await expect(page.getByText("expand scroll target session")).toBeVisible({
      timeout: 15_000,
    });
    await sessionList.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });

    const targetButton = page
      .getByText("expand scroll target session")
      .locator("xpath=ancestor::button[1]");
    await targetButton.click();
    const details = page.locator(".session-row__details").first();
    await expect(details.getByText("Expanded target activity line 27")).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(async () => {
        return sessionList.evaluate((node) =>
          Math.round(node.scrollHeight - node.scrollTop - node.clientHeight),
        );
      })
      .toBeLessThanOrEqual(8);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});
