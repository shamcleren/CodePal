import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { stringifyActionResponsePayload } from "../../src/shared/actionResponsePayload";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { sendStatusChange } from "./helpers/sendStatusChange";

const SESSION_ID = "e2e-golden-session";
const ACTION_ID = "e2e-golden-action";
const PENDING_TITLE = "E2E single choice prompt";
const OPTION_APPROVE = "Approve";

test.describe.configure({ timeout: 60_000 });

function firstCurrentSessionRow(page: import("@playwright/test").Page) {
  return page.getByLabel(/Cursor (WAITING|RUNNING)/).first().locator("xpath=ancestor::article[1]");
}

function pendingBadge(row: import("@playwright/test").Locator, count: number) {
  return row.getByText(new RegExp(`(?:${count} pending|${count} 个待处理)`)).first();
}

test("cursor phase1: installs cursor hooks and surfaces degraded unsupported actions", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join("/tmp", "codepal-home-"));
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
  });

  const phase1Session = "cursor-phase1-session";
  const phase1Action = "cursor-phase1-action";
  const phase1Title = "Cursor phase1 approval";

  try {
    const mainPage = await codepal.app.firstWindow();
    await mainPage.waitForLoadState("domcontentloaded");
    await mainPage.waitForLoadState("load");
    await expect(mainPage.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const installResult = await mainPage.evaluate(async () => {
      return window.codepal.installIntegrationHooks("cursor");
    });
    expect(installResult.message).toContain("已写入 Cursor 配置");

    const configPath = path.join(homeDir, ".cursor", "hooks.json");
    const installed = JSON.parse(await fs.readFile(configPath, "utf8")) as {
      hooks: { sessionStart: Array<{ command: string }>; stop: Array<{ command: string }> };
    };
    const cursorWrapperCommand = `"${path.join(homeDir, ".codepal", "bin", "cursor-hook")}"`;
    expect(installed.hooks.sessionStart[0]?.command).toBe(cursorWrapperCommand);
    expect(installed.hooks.stop[0]?.command).toBe(cursorWrapperCommand);

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: phase1Session,
        tool: "cursor",
        status: "waiting",
        task: "cursor phase1 ready",
        timestamp: Date.now(),
        pendingAction: {
          id: phase1Action,
          type: "single_choice",
          title: phase1Title,
          options: [OPTION_APPROVE, "Reject"],
        },
      },
      codepal.ipcTarget,
    );

    const row = firstCurrentSessionRow(mainPage);
    await expect(pendingBadge(row, 1)).toBeVisible({ timeout: 15_000 });
    await mainPage.evaluate(
      ([sessionId, actionId, option]) => {
        window.codepal.respondToPendingAction(sessionId, actionId, option);
      },
      [phase1Session, phase1Action, OPTION_APPROVE] as const,
    );
    await expect(collector.waitForLine()).resolves.toBe(
      stringifyActionResponsePayload(phase1Session, phase1Action, OPTION_APPROVE),
    );
    await expect(pendingBadge(row, 1)).toBeHidden();

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: phase1Session,
        tool: "cursor",
        status: "waiting",
        task: "Unsupported Cursor action: text_input",
        timestamp: Date.now(),
        meta: {
          hook_event_name: "Notification",
          unsupported_action_type: "text_input",
        },
        pendingAction: null,
      },
      codepal.ipcTarget,
    );

    await expect(
      firstCurrentSessionRow(mainPage).getByText("Unsupported Cursor action: text_input").first(),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("round-trips a single_choice pending action", async () => {
  const collector = await startActionResponseCollector();

  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: SESSION_ID,
        tool: "cursor",
        status: "waiting",
        task: "e2e golden path",
        timestamp: Date.now(),
        pendingAction: {
          id: ACTION_ID,
          type: "single_choice",
          title: PENDING_TITLE,
          options: [OPTION_APPROVE, "Reject"],
        },
      },
      codepal.ipcTarget,
    );

    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const row = firstCurrentSessionRow(page);
    await expect(pendingBadge(row, 1)).toBeVisible({ timeout: 15_000 });

    await page.evaluate(
      ([sessionId, actionId, option]) => {
        window.codepal.respondToPendingAction(sessionId, actionId, option);
      },
      [SESSION_ID, ACTION_ID, OPTION_APPROVE] as const,
    );

    const expectedLine = stringifyActionResponsePayload(
      SESSION_ID,
      ACTION_ID,
      OPTION_APPROVE,
    );
    await expect(collector.waitForLine()).resolves.toBe(expectedLine);
    await expect(pendingBadge(row, 1)).toBeHidden();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

const CONCURRENT_SESSION = "e2e-concurrent-session";
const ACTION_A = "e2e-concurrent-action-a";
const ACTION_B = "e2e-concurrent-action-b";
const TITLE_A = "E2E concurrent card A";
const TITLE_B = "E2E concurrent card B";

test("same session: two pending actions with different actionIds route action_response correctly", async () => {
  const collector = await startActionResponseCollector();
  const collectorA = await startActionResponseCollector();
  const collectorB = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const basePayload = {
    type: "status_change" as const,
    sessionId: CONCURRENT_SESSION,
    tool: "cursor",
    status: "waiting" as const,
    task: "e2e concurrent pending",
    timestamp: Date.now(),
  };

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await sendStatusChange(
      {
        ...basePayload,
        timestamp: basePayload.timestamp + 1,
        pendingAction: {
          id: ACTION_A,
          type: "single_choice",
          title: TITLE_A,
          options: ["Alpha", "Reject"],
        },
        responseTarget: collectorA.responseTarget,
      },
      codepal.ipcTarget,
    );
    await sendStatusChange(
      {
        ...basePayload,
        timestamp: basePayload.timestamp + 2,
        pendingAction: {
          id: ACTION_B,
          type: "single_choice",
          title: TITLE_B,
          options: ["Bravo", "Reject"],
        },
        responseTarget: collectorB.responseTarget,
      },
      codepal.ipcTarget,
    );

    const row = firstCurrentSessionRow(page);
    await expect(pendingBadge(row, 2)).toBeVisible({ timeout: 15_000 });

    const lineA = collectorA.waitForLine();
    const lineB = collectorB.waitForLine();

    const expectedB = stringifyActionResponsePayload(CONCURRENT_SESSION, ACTION_B, "Bravo");
    const expectedA = stringifyActionResponsePayload(CONCURRENT_SESSION, ACTION_A, "Alpha");

    await page.evaluate(
      ([sessionId, actionId, option]) => {
        window.codepal.respondToPendingAction(sessionId, actionId, option);
      },
      [CONCURRENT_SESSION, ACTION_B, "Bravo"] as const,
    );
    await expect(lineB).resolves.toBe(expectedB);
    expect(JSON.parse(await lineB).actionId).toBe(ACTION_B);
    await expect(pendingBadge(row, 1)).toBeVisible({ timeout: 15_000 });

    await page.evaluate(
      ([sessionId, actionId, option]) => {
        window.codepal.respondToPendingAction(sessionId, actionId, option);
      },
      [CONCURRENT_SESSION, ACTION_A, "Alpha"] as const,
    );
    await expect(lineA).resolves.toBe(expectedA);
    expect(JSON.parse(await lineA).actionId).toBe(ACTION_A);

    await expect(pendingBadge(row, 1)).toBeHidden();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await collectorA.close().catch(() => undefined);
    await collectorB.close().catch(() => undefined);
  }
});

const REMOTE_CLOSE_SESSION = "e2e-pending-closed-session";
const REMOTE_ACTION_X = "e2e-remote-close-x";
const REMOTE_ACTION_Y = "e2e-remote-close-y";
const TITLE_REMOTE_X = "E2E remote close card X";
const TITLE_REMOTE_Y = "E2E remote close card Y";

test("same session: pendingClosed removes only the matching pending card", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const base = {
    type: "status_change" as const,
    sessionId: REMOTE_CLOSE_SESSION,
    tool: "cursor" as const,
    status: "waiting" as const,
    task: "e2e pendingClosed",
    timestamp: Date.now(),
  };

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await sendStatusChange(
      {
        ...base,
        timestamp: Date.now(),
        pendingAction: {
          id: REMOTE_ACTION_X,
          type: "single_choice",
          title: TITLE_REMOTE_X,
          options: ["X1", "Reject"],
        },
      },
      codepal.ipcTarget,
    );

    await sendStatusChange(
      {
        ...base,
        timestamp: Date.now(),
        pendingAction: {
          id: REMOTE_ACTION_Y,
          type: "single_choice",
          title: TITLE_REMOTE_Y,
          options: ["Y1", "Reject"],
        },
      },
      codepal.ipcTarget,
    );

    const row = firstCurrentSessionRow(page);
    await expect(pendingBadge(row, 2)).toBeVisible({ timeout: 15_000 });

    await sendStatusChange(
      {
        ...base,
        timestamp: Date.now(),
        pendingClosed: { actionId: REMOTE_ACTION_X, reason: "consumed_remote" },
      },
      codepal.ipcTarget,
    );

    await expect(pendingBadge(row, 1)).toBeVisible({ timeout: 15_000 });

    await sendStatusChange(
      {
        ...base,
        timestamp: Date.now(),
        pendingClosed: { actionId: REMOTE_ACTION_Y, reason: "consumed_remote" },
      },
      codepal.ipcTarget,
    );

    await expect(pendingBadge(row, 1)).toBeHidden();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

test("tool artifact interactions: renders compact grouped tool activity", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const sessionId = "e2e-tool-artifact-session";
  const toolBody = [
    "```text",
    "renjinming 67781 18.2 0.0 410663008 8576 ?? Ss 10:40AM 0:00.09 /bin/zsh -c snap=$(command cat <&3)",
    "builtin unsetopt aliases 2>/dev/null; builtin unalias -m '*' 2>/dev/null || true",
    "builtin eval \"$snap\"; COMMAND_EXIT_CODE=$?",
    "dump_zsh_state >&4; builtin exit $COMMAND_EXIT_CODE",
    "```",
  ].join("\n");

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
        sessionId,
        tool: "cursor",
        status: "running",
        task: "tool artifact e2e",
        timestamp: Date.now(),
        activityItems: [
          {
            id: "tool-artifact-1",
            kind: "tool",
            source: "tool",
            title: "Tool",
            body: toolBody,
            timestamp: Date.now(),
            toolName: "Tool",
            toolPhase: "result",
          },
        ],
      },
      codepal.ipcTarget,
    );

    const summary = page.getByLabel("Cursor RUNNING").first();
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await summary.click();

    const artifactSummary = page.locator(".session-stream__artifact-group-summary").first();
    await expect(artifactSummary).toBeVisible();

    const expandButton = page.locator(".session-stream__artifact-toggle").first();
    await expandButton.click();

    const artifactGroup = page.locator(".session-stream__artifact-group-row").first();
    await expect(artifactGroup).toBeVisible();
    await expect(artifactGroup).toContainText("Tool");
    await expect(artifactGroup).toContainText("renjinming 67781");
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

const EXPIRY_SESSION = "e2e-expiry-session";
const EXPIRY_ACTION = "e2e-expiry-action";
const EXPIRY_TITLE = "E2E short timeout pending";

test("pending card disappears when lifecycle expires without pendingClosed", async () => {
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

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: EXPIRY_SESSION,
        tool: "cursor",
        status: "waiting",
        task: "e2e expiry",
        timestamp: Date.now(),
        pendingAction: {
          id: EXPIRY_ACTION,
          type: "single_choice",
          title: EXPIRY_TITLE,
          options: ["Soon", "Never"],
        },
        responseTarget: {
          mode: "socket",
          ...collector.responseTarget,
          timeoutMs: 750,
        },
      },
      codepal.ipcTarget,
    );

    const row = firstCurrentSessionRow(page);
    await expect(pendingBadge(row, 1)).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      expect(pendingBadge(row, 1)).toBeHidden({ timeout: 12_000 }),
      collector.expectNoFurtherConnections(12_000),
    ]);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

const FIRST_WIN_SESSION = "e2e-first-win-session";
const FIRST_WIN_ACTION = "e2e-first-win-action";
const FIRST_WIN_TITLE = "E2E first-win prompt";

test("after a successful response the card hides and a second action_response is a no-op", async () => {
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

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: FIRST_WIN_SESSION,
        tool: "cursor",
        status: "waiting",
        task: "e2e first win",
        timestamp: Date.now(),
        pendingAction: {
          id: FIRST_WIN_ACTION,
          type: "single_choice",
          title: FIRST_WIN_TITLE,
          options: ["Once", "Twice"],
        },
      },
      codepal.ipcTarget,
    );

    const row = firstCurrentSessionRow(page);
    await expect(pendingBadge(row, 1)).toBeVisible({ timeout: 15_000 });

    const linePromise = collector.waitForLine();
    await page.evaluate(
      ([sessionId, actionId, option]) => {
        window.codepal.respondToPendingAction(sessionId, actionId, option);
      },
      [FIRST_WIN_SESSION, FIRST_WIN_ACTION, "Once"] as const,
    );

    const expectedLine = stringifyActionResponsePayload(
      FIRST_WIN_SESSION,
      FIRST_WIN_ACTION,
      "Once",
    );
    await expect(linePromise).resolves.toBe(expectedLine);
    await expect(pendingBadge(row, 1)).toBeHidden();

    await page.evaluate(
      ([sessionId, actionId]) => {
        window.codepal.respondToPendingAction(sessionId, actionId, "Once");
      },
      [FIRST_WIN_SESSION, FIRST_WIN_ACTION] as const,
    );

    await collector.expectNoFurtherConnections(3_000);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});
