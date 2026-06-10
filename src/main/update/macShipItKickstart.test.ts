import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  scheduleMacShipItKickstart,
  schedulePendingMacShipItKickstart,
} from "./macShipItKickstart";

type SpawnCall = {
  command: string;
  args: string[];
  options: {
    detached?: boolean;
    stdio?: string;
    env?: Record<string, string>;
  };
};

function createSpawnMock() {
  const calls: SpawnCall[] = [];
  const spawnImpl = vi.fn((command: string, args: string[], options: SpawnCall["options"]) => {
    calls.push({ command, args, options });
    return { unref: vi.fn() };
  });
  return { calls, spawnImpl };
}

describe("scheduleMacShipItKickstart", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-shipit-kickstart-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not spawn outside macOS", () => {
    const { calls, spawnImpl } = createSpawnMock();

    const scheduled = scheduleMacShipItKickstart({
      platform: "linux",
      bundleIdentifier: "ai.shamcleren.codepal",
      uid: 501,
      spawnImpl,
    });

    expect(scheduled).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("spawns a minimal detached launchctl kickstart helper for the app ShipIt job", () => {
    const { calls, spawnImpl } = createSpawnMock();

    const scheduled = scheduleMacShipItKickstart({
      platform: "darwin",
      bundleIdentifier: "ai.shamcleren.codepal",
      uid: 501,
      attempts: 3,
      intervalSeconds: 0.25,
      spawnImpl,
    });

    expect(scheduled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("/bin/sh");
    expect(calls[0].args[0]).toBe("-c");
    expect(calls[0].args[1]).toContain("service='gui/501/ai.shamcleren.codepal.ShipIt'");
    expect(calls[0].args[1]).toContain("/bin/launchctl print \"$service\"");
    expect(calls[0].args[1]).toContain("/bin/launchctl kickstart -k \"$service\"");
    expect(calls[0].args[1]).toContain("/bin/sleep 0.25");
    expect(calls[0].options).toMatchObject({
      detached: true,
      stdio: "ignore",
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    });
  });

  it("schedules startup repair only for a newer pending ShipIt install with a launchd job", () => {
    const updateAppPath = path.join(tempDir, "update", "CodePal.app");
    fs.mkdirSync(path.join(updateAppPath, "Contents"), { recursive: true });
    fs.writeFileSync(
      path.join(updateAppPath, "Contents", "Info.plist"),
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<plist version=\"1.0\">",
        "<dict>",
        "<key>CFBundleShortVersionString</key>",
        "<string>1.3.14</string>",
        "</dict>",
        "</plist>",
      ].join("\n"),
      "utf8",
    );
    const shipItDir = path.join(tempDir, "ai.shamcleren.codepal.ShipIt");
    fs.mkdirSync(shipItDir, { recursive: true });
    fs.writeFileSync(
      path.join(shipItDir, "ShipItState.plist"),
      JSON.stringify({
        bundleIdentifier: "ai.shamcleren.codepal",
        updateBundleURL: `file://${updateAppPath}/`,
      }),
      "utf8",
    );
    const { calls, spawnImpl } = createSpawnMock();
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }));

    const scheduled = schedulePendingMacShipItKickstart({
      platform: "darwin",
      bundleIdentifier: "ai.shamcleren.codepal",
      currentVersion: "1.3.13",
      cacheDir: tempDir,
      uid: 501,
      spawnImpl,
      spawnSyncImpl,
    });

    expect(scheduled).toBe(true);
    expect(spawnSyncImpl).toHaveBeenCalledWith("/bin/launchctl", [
      "print",
      "gui/501/ai.shamcleren.codepal.ShipIt",
    ], expect.objectContaining({ stdio: "ignore" }));
    expect(calls).toHaveLength(1);
  });

  it("does not repair when the pending ShipIt app is not newer", () => {
    const updateAppPath = path.join(tempDir, "update", "CodePal.app");
    fs.mkdirSync(path.join(updateAppPath, "Contents"), { recursive: true });
    fs.writeFileSync(
      path.join(updateAppPath, "Contents", "Info.plist"),
      "<plist><dict><key>CFBundleShortVersionString</key><string>1.3.13</string></dict></plist>",
      "utf8",
    );
    const shipItDir = path.join(tempDir, "ai.shamcleren.codepal.ShipIt");
    fs.mkdirSync(shipItDir, { recursive: true });
    fs.writeFileSync(
      path.join(shipItDir, "ShipItState.plist"),
      JSON.stringify({ updateBundleURL: `file://${updateAppPath}/` }),
      "utf8",
    );
    const { calls, spawnImpl } = createSpawnMock();
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }));

    const scheduled = schedulePendingMacShipItKickstart({
      platform: "darwin",
      bundleIdentifier: "ai.shamcleren.codepal",
      currentVersion: "1.3.13",
      cacheDir: tempDir,
      uid: 501,
      spawnImpl,
      spawnSyncImpl,
    });

    expect(scheduled).toBe(false);
    expect(spawnSyncImpl).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("ignores stale pending ShipIt state when the update app plist is gone", () => {
    const updateAppPath = path.join(tempDir, "update.MTucFWZ", "CodePal.app");
    const shipItDir = path.join(tempDir, "ai.shamcleren.codepal.ShipIt");
    fs.mkdirSync(shipItDir, { recursive: true });
    fs.writeFileSync(
      path.join(shipItDir, "ShipItState.plist"),
      JSON.stringify({ updateBundleURL: `file://${updateAppPath}/` }),
      "utf8",
    );
    const { calls, spawnImpl } = createSpawnMock();
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const scheduled = schedulePendingMacShipItKickstart({
      platform: "darwin",
      bundleIdentifier: "ai.shamcleren.codepal",
      currentVersion: "1.3.16",
      cacheDir: tempDir,
      uid: 501,
      spawnImpl,
      spawnSyncImpl,
    });

    expect(scheduled).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
    expect(spawnSyncImpl).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(fs.existsSync(path.join(shipItDir, "ShipItState.plist"))).toBe(false);
  });
});
