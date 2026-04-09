import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { stringifyActionResponsePayload } from "../../src/shared/actionResponsePayload";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { sendStatusChange } from "./helpers/sendStatusChange";

/** Matches pending-count badge in both en ("1 pending") and zh-CN ("1 个待处理"). */
function pendingText(count: number) {
  return new RegExp(`${count} (pending|个待处理)`);
}

/* ---------- Claude-Internal ---------- */

test("claude-internal: installs hooks and displays session events", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join("/tmp", "codepal-ci-home-"));
  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
    homeDir,
  });

  const sessionId = "claude-internal-e2e-1";

  try {
    const mainPage = await codepal.app.firstWindow();
    await mainPage.waitForLoadState("domcontentloaded");
    await mainPage.waitForLoadState("load");
    await expect(mainPage.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    // Install hooks for claude-internal
    const installResult = await mainPage.evaluate(async () => {
      return window.codepal.installIntegrationHooks("claude-internal");
    });
    expect(installResult.message).toBeTruthy();

    // Verify the settings.json was created under ~/.claude-internal
    const configPath = path.join(homeDir, ".claude-internal", "settings.json");
    const configRaw = await fs.readFile(configPath, "utf8");
    JSON.parse(configRaw); // validate JSON
    expect(configRaw).toContain("claude-internal");

    // Send a running status_change event
    await sendStatusChange(
      {
        type: "status_change",
        sessionId,
        tool: "claude-internal",
        status: "running",
        task: "claude-internal e2e task",
        timestamp: Date.now(),
      },
      codepal.ipcSocketPath,
    );

    // Verify the UI shows a Claude Internal session row
    const row = mainPage.getByLabel(/Claude Internal (RUNNING|WAITING)/).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

/* ---------- Codex-Internal ---------- */

test("codex-internal: installs hooks and displays session events", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join("/tmp", "codepal-xi-home-"));
  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
    homeDir,
  });

  const sessionId = "codex-internal-e2e-1";

  try {
    const mainPage = await codepal.app.firstWindow();
    await mainPage.waitForLoadState("domcontentloaded");
    await mainPage.waitForLoadState("load");
    await expect(mainPage.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    // Install hooks for codex-internal
    const installResult = await mainPage.evaluate(async () => {
      return window.codepal.installIntegrationHooks("codex-internal");
    });
    expect(installResult.message).toBeTruthy();

    // Verify the config.toml was created under ~/.codex-internal
    const configPath = path.join(homeDir, ".codex-internal", "config.toml");
    const configRaw = await fs.readFile(configPath, "utf8");
    expect(configRaw).toContain("codex-internal");

    // Send a running status_change event
    await sendStatusChange(
      {
        type: "status_change",
        sessionId,
        tool: "codex-internal",
        status: "running",
        task: "codex-internal e2e task",
        timestamp: Date.now(),
      },
      codepal.ipcSocketPath,
    );

    // Verify the UI shows a Codex Internal session row
    const row = mainPage.getByLabel(/Codex Internal (RUNNING|WAITING)/).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

/* ---------- Claude-Internal pending action round-trip ---------- */

const CI_SESSION = "claude-internal-pending-e2e";
const CI_ACTION = "claude-internal-pending-action-1";
const CI_TITLE = "Claude Internal approval prompt";
const CI_OPTION = "Approve";

test("claude-internal: round-trips a single_choice pending action", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    // Send a waiting event with a pending action
    await sendStatusChange(
      {
        type: "status_change",
        sessionId: CI_SESSION,
        tool: "claude-internal",
        status: "waiting",
        task: "claude-internal pending action e2e",
        timestamp: Date.now(),
        pendingAction: {
          id: CI_ACTION,
          type: "single_choice",
          title: CI_TITLE,
          options: [CI_OPTION, "Reject"],
        },
      },
      codepal.ipcSocketPath,
    );

    // Verify the pending action appears
    const row = page.getByLabel(/Claude Internal (WAITING|RUNNING)/).first().locator("xpath=ancestor::article[1]");
    await expect(row.getByText(pendingText(1))).toBeVisible({ timeout: 15_000 });

    // Respond to the pending action
    await page.evaluate(
      ([sessionId, actionId, option]) => {
        window.codepal.respondToPendingAction(sessionId, actionId, option);
      },
      [CI_SESSION, CI_ACTION, CI_OPTION] as const,
    );

    // Verify the response reaches the collector
    const expectedLine = stringifyActionResponsePayload(CI_SESSION, CI_ACTION, CI_OPTION);
    await expect(collector.waitForLine()).resolves.toBe(expectedLine);

    // Verify the pending card hides
    await expect(row.getByText(pendingText(1))).toBeHidden();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});
