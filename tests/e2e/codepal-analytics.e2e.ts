import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHistoryStore } from "../../src/main/history/historyStore";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { canListen } from "./helpers/probeNetwork";

test.beforeEach(async () => {
  if (!(await canListen())) test.skip();
});

test("renders analytics from persisted token usage", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-analytics-home-"));
  const userDataPath = path.join(homeDir, "Library", "Application Support", "CodePal");
  const now = Date.now();
  let historyStore: ReturnType<typeof createHistoryStore> | null = createHistoryStore({
    dbPath: path.join(userDataPath, "history.sqlite"),
  });

  historyStore.writeUsageSessionSummary({
    sessionId: "analytics-e2e-session",
    agent: "codex",
    title: "Analyze CodePal token history",
    timestamp: now - 60_000,
  });
  historyStore.writeTokenUsage({
    sessionId: "analytics-e2e-session",
    agent: "codex",
    model: "gpt-5.5",
    timestamp: now - 30_000,
    inputTokens: 1_200,
    outputTokens: 340,
    cacheReadTokens: 200,
    cacheCreationTokens: 60,
    sourceKind: "e2e",
    sourceKey: "analytics-e2e-token-row",
  });
  historyStore.setUsageImportStatus({
    completedAt: now - 10_000,
    claudeRowsImported: 2,
    codexRowsImported: 1,
    lastError: null,
  });
  historyStore.close();
  historyStore = null;

  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
    extraEnv: {
      CODEPAL_USAGE_BACKFILL_DELAY_MS: "60000",
    },
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /Analytics|分析/ }).click();
    await expect(page.getByRole("heading", { name: /Analytics|分析/ })).toBeVisible({
      timeout: 15_000,
    });
    await page.locator(".app").evaluate((element) => {
      element.setAttribute("data-theme", "paper-ops");
    });
    await expect(page.locator(".app")).toHaveAttribute("data-theme", "paper-ops");
    await expect(page.locator(".analytics-page__hero-value").first()).toHaveCSS(
      "color",
      "rgb(23, 33, 29)",
    );
    await expect(page.locator(".analytics-page__hero-label").first()).toHaveCSS(
      "color",
      "rgb(76, 94, 86)",
    );
    await expect(page.locator(".analytics-page__chart-y-axis").first()).toHaveCSS(
      "color",
      "rgb(76, 94, 86)",
    );
    await expect(page.locator(".analytics-page__table-model").nth(1)).toHaveCSS(
      "color",
      "rgb(23, 33, 29)",
    );
    await expect(page.locator(".analytics-page__table-num").nth(7)).toHaveCSS(
      "color",
      "rgb(45, 61, 54)",
    );

    const totalTokensCard = page
      .locator(".analytics-page__hero-card")
      .filter({ hasText: /Total Tokens|总 Token/ });
    await expect(totalTokensCard.locator(".analytics-page__hero-value")).toHaveText("1.8K");

    const topAgentCard = page
      .locator(".analytics-page__hero-card")
      .filter({ hasText: /Top Agent|主要 Agent/ });
    await expect(topAgentCard.locator(".analytics-page__hero-value")).toHaveText("Codex");

    const topModelCard = page
      .locator(".analytics-page__hero-card")
      .filter({ hasText: /Top Model|主要模型/ });
    await expect(topModelCard.locator(".analytics-page__hero-value")).toHaveText("gpt-5.5");

    await page.getByRole("button", { name: /30 Days|30 天/ }).click();
    await expect(page.locator(".analytics-page__range-btn--active")).toHaveText(/30 Days|30 天/);
    await expect(page.locator(".analytics-page__table")).toContainText("gpt-5.5");

    await page.getByRole("button", { name: /By Agent|按 Agent/ }).click();
    await expect(page.locator(".analytics-page__segment--active")).toHaveText(/By Agent|按 Agent/);
    await expect(page.locator(".analytics-page__table")).toContainText("codex");
  } finally {
    historyStore?.close();
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
