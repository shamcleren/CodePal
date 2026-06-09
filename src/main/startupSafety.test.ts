import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("main process startup safety", () => {
  it("does not mutate third-party agent config during app startup", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(mainSource).not.toContain(".autoMigrateExistingCodePalHooks(");
    expect(mainSource).not.toContain(".autoInstallMissingSupportedHooks(");
  });

  it("uses the user data settings file in development and packaged builds", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const startupStart = mainSource.indexOf("void app.whenReady().then(async () => {");
    const startupSource = mainSource.slice(
      startupStart,
      mainSource.indexOf("const settingsService = createSettingsService(", startupStart),
    );

    expect(startupSource).toContain("resolveWritableSettingsPath({");
    expect(startupSource).toContain("userDataPath: app.getPath(\"userData\")");
    expect(startupSource).not.toContain("settings-dev.yaml");
  });

  it("auto-starts the provider gateway during app startup only when it was already enabled", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const startupStart = mainSource.indexOf("void app.whenReady().then(async () => {");
    const startupSource = mainSource.slice(
      startupStart,
      mainSource.indexOf("wireActionResponseIpc(", startupStart),
    );

    expect(startupSource).toContain("if (appSettings.providerGateway.enabled)");
    expect(startupSource).toContain(
      "await startClaudeDesktopProviderGateway(settingsService, gatewaySecretStore)",
    );
    expect(startupSource).toContain("resumeProviderGatewayClients(");
    expect(startupSource).not.toContain("setProviderGatewayEnabled(settingsService, true)");
    expect(startupSource).not.toContain("restoreProviderGatewayClients(");
    expect(startupSource).not.toContain("configureProviderGatewayClient(");
  });

  it("restores provider gateway client configs before stopping the gateway", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const startHandlerStart = mainSource.indexOf('ipcMain.handle("codepal:start-provider-gateway"');
    const startHandlerEnd = mainSource.indexOf('ipcMain.handle("codepal:stop-provider-gateway"', startHandlerStart);
    const startHandlerSource = mainSource.slice(startHandlerStart, startHandlerEnd);
    const stopStart = mainSource.indexOf("function restoreProviderGatewayClients(");
    const stopEnd = mainSource.indexOf("function markProviderGatewayNotStarted", stopStart);
    const stopSource = mainSource.slice(stopStart, stopEnd);
    const quitSuspendStart = mainSource.indexOf("async function suspendProviderGatewayForAppQuit(");
    const quitSuspendEnd = mainSource.indexOf("function markProviderGatewayNotStarted", quitSuspendStart);
    const quitSuspendSource = mainSource.slice(quitSuspendStart, quitSuspendEnd);
    const activeTargetsStart = mainSource.indexOf("function activeProviderGatewayClientTargets(");
    const activeTargetsEnd = mainSource.indexOf("function configureProviderGatewayClients(", activeTargetsStart);
    const activeTargetsSource = mainSource.slice(activeTargetsStart, activeTargetsEnd);
    const beforeQuitStart = mainSource.indexOf('app.on("before-quit"');
    const beforeQuitEnd = mainSource.indexOf('app.on("window-all-closed"', beforeQuitStart);
    const beforeQuitSource = mainSource.slice(beforeQuitStart, beforeQuitEnd);

    expect(mainSource).toContain('ipcMain.handle("codepal:stop-provider-gateway"');
    expect(startHandlerSource).toContain("setProviderGatewayEnabled(settingsService, true)");
    expect(startHandlerSource.indexOf("setProviderGatewayEnabled(settingsService, true)")).toBeLessThan(
      startHandlerSource.indexOf("startClaudeDesktopProviderGateway("),
    );
    expect(stopSource).toContain('target: "claude-desktop-restore"');
    expect(stopSource).toContain('target: "claude-cli-restore"');
    expect(stopSource).toContain('target: "codex-desktop-restore"');
    expect(stopSource.indexOf("restoreProviderGatewayClients(")).toBeGreaterThanOrEqual(0);
    expect(stopSource.indexOf("restoreProviderGatewayClients(")).toBeLessThan(
      stopSource.indexOf("closeProviderGatewayServer("),
    );
    expect(stopSource).toContain("deleteProviderGatewayResumeState(userDataPath)");
    expect(stopSource).toContain("setProviderGatewayEnabled(settingsService, false)");
    expect(activeTargetsSource).toContain("status.claudeCli.setup.active");
    expect(quitSuspendSource).toContain("activeProviderGatewayClientTargets(");
    expect(quitSuspendSource).toContain("writeProviderGatewayResumeState(userDataPath, targets)");
    expect(quitSuspendSource).toContain("restoreProviderGatewayClients(");
    expect(quitSuspendSource).not.toContain("preserveClaudeCliGatewayEnv");
    expect(quitSuspendSource).toContain("closeProviderGatewayServer()");
    expect(quitSuspendSource).not.toContain("setProviderGatewayEnabled(");
    expect(beforeQuitSource).toContain("!installingUpdate");
    expect(beforeQuitSource).toContain("suspendProviderGatewayForAppQuit(");
    expect(beforeQuitSource).not.toContain("stopProviderGateway(");
    expect(beforeQuitSource).not.toContain("setProviderGatewayEnabled(");
    expect(beforeQuitSource).not.toContain("configureProviderGatewayClient(");
  });

  it("lets macOS updater quit bypass the async provider gateway suspend path", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const beforeQuitStart = mainSource.indexOf('app.on("before-quit"');
    const beforeQuitEnd = mainSource.indexOf('app.on("window-all-closed"', beforeQuitStart);
    const beforeQuitSource = mainSource.slice(beforeQuitStart, beforeQuitEnd);
    const updateServiceStart = mainSource.indexOf("const updateService = createUpdateService(");
    const updateServiceEnd = mainSource.indexOf("const notificationService", updateServiceStart);
    const updateServiceSource = mainSource.slice(updateServiceStart, updateServiceEnd);

    expect(mainSource).toContain("let installingUpdate = false;");
    expect(mainSource).toContain('const CODEPAL_BUNDLE_IDENTIFIER = "ai.shamcleren.codepal";');
    expect(mainSource).toContain("schedulePendingMacShipItKickstart({");
    expect(mainSource).toContain("currentVersion: app.getVersion()");
    expect(mainSource).toContain("cacheDir: app.getPath(\"cache\")");
    expect(updateServiceSource).toContain("onBeforeInstall: () => {");
    expect(updateServiceSource).toContain("installingUpdate = true;");
    expect(updateServiceSource).toContain("scheduleMacShipItKickstart({");
    expect(updateServiceSource).toContain("bundleIdentifier: CODEPAL_BUNDLE_IDENTIFIER");
    expect(updateServiceSource).toContain("void closeProviderGatewayServer();");
    expect(beforeQuitSource).toContain("!installingUpdate");
    expect(beforeQuitSource.indexOf("!installingUpdate")).toBeLessThan(
      beforeQuitSource.indexOf("suspendProviderGatewayForAppQuit("),
    );
  });

  it("can resume Claude CLI gateway env after startup when it was active before quit", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const configureStart = mainSource.indexOf("function configureProviderGatewayClients(");
    const configureEnd = mainSource.indexOf("function resumeProviderGatewayClients(", configureStart);
    const configureSource = mainSource.slice(configureStart, configureEnd);

    expect(mainSource).toContain('"claude-cli"');
    expect(configureSource).toContain("configureProviderGatewayClient({");
    expect(configureSource).toContain("target,");
  });

  it("builds Provider Gateway renderer status from one shared status input", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const statusStart = mainSource.indexOf("function providerGatewayStatusForRenderer(");
    const statusEnd = mainSource.indexOf("function providerGatewayBaseStatus(", statusStart);
    const statusSource = mainSource.slice(statusStart, statusEnd);

    expect(statusSource.match(/providerGatewayStatusInput\(/g)?.length ?? 0).toBe(1);
  });

  it("keeps usage overview IPC available if history pricing has already closed", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const usageOverviewStart = mainSource.indexOf("function usageOverviewForRenderer(");
    const usageOverviewEnd = mainSource.indexOf("function broadcastUpdateState(", usageOverviewStart);
    const usageOverviewSource = mainSource.slice(usageOverviewStart, usageOverviewEnd);

    expect(usageOverviewSource).toContain("currentHistoryStore.getModelPricing()");
    expect(usageOverviewSource).toContain('error.message !== "History store is closed"');
    expect(usageOverviewSource).toContain("throw error");
  });
});
