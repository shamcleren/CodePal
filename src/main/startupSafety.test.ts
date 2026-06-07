import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("main process startup safety", () => {
  it("does not mutate third-party agent config during app startup", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(mainSource).not.toContain(".autoMigrateExistingCodePalHooks(");
    expect(mainSource).not.toContain(".autoInstallMissingSupportedHooks(");
  });

  it("does not start the provider gateway during app startup", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const startupSource = mainSource.slice(
      mainSource.indexOf("void app.whenReady().then(async () => {"),
      mainSource.indexOf("wireActionResponseIpc("),
    );

    expect(startupSource).not.toContain("startClaudeDesktopProviderGateway(");
  });

  it("restores provider gateway client configs before stopping the gateway", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const startHandlerStart = mainSource.indexOf('ipcMain.handle("codepal:start-provider-gateway"');
    const startHandlerEnd = mainSource.indexOf('ipcMain.handle("codepal:stop-provider-gateway"', startHandlerStart);
    const startHandlerSource = mainSource.slice(startHandlerStart, startHandlerEnd);
    const stopStart = mainSource.indexOf("function restoreProviderGatewayClients(");
    const stopEnd = mainSource.indexOf("function markProviderGatewayNotStarted", stopStart);
    const stopSource = mainSource.slice(stopStart, stopEnd);
    const beforeQuitStart = mainSource.indexOf('app.on("before-quit"');
    const beforeQuitEnd = mainSource.indexOf('app.on("window-all-closed"', beforeQuitStart);
    const beforeQuitSource = mainSource.slice(beforeQuitStart, beforeQuitEnd);

    expect(mainSource).toContain('ipcMain.handle("codepal:stop-provider-gateway"');
    expect(startHandlerSource).toContain("setProviderGatewayEnabled(settingsService, true)");
    expect(startHandlerSource.indexOf("setProviderGatewayEnabled(settingsService, true)")).toBeLessThan(
      startHandlerSource.indexOf("startClaudeDesktopProviderGateway("),
    );
    expect(stopSource).toContain('target: "claude-desktop-restore"');
    expect(stopSource).toContain('target: "codex-desktop-restore"');
    expect(stopSource.indexOf("restoreProviderGatewayClients(")).toBeGreaterThanOrEqual(0);
    expect(stopSource.indexOf("restoreProviderGatewayClients(")).toBeLessThan(
      stopSource.indexOf("closeProviderGatewayServer("),
    );
    expect(stopSource).toContain("setProviderGatewayEnabled(settingsService, false)");
    expect(beforeQuitSource).toContain("stopProviderGateway(");
    expect(beforeQuitSource).not.toContain("providerGatewayServer?.close()");
  });
});
