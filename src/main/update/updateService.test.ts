import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updaterMocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload?: unknown) => void>(),
  checkForUpdates: vi.fn(async () => undefined),
  downloadUpdate: vi.fn(async () => undefined),
  quitAndInstall: vi.fn(() => undefined),
}));

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      on(event: string, handler: (payload?: unknown) => void) {
        updaterMocks.handlers.set(event, handler);
      },
      checkForUpdates: updaterMocks.checkForUpdates,
      downloadUpdate: updaterMocks.downloadUpdate,
      quitAndInstall: updaterMocks.quitAndInstall,
    },
  },
}));

import { createUpdateService } from "./updateService";

function emit(event: string, payload?: unknown) {
  updaterMocks.handlers.get(event)?.(payload);
}

describe("createUpdateService", () => {
  let tempDir: string;
  let stateFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-update-service-"));
    stateFilePath = path.join(tempDir, "update-state.json");
    updaterMocks.handlers.clear();
    updaterMocks.checkForUpdates.mockClear();
    updaterMocks.downloadUpdate.mockClear();
    updaterMocks.quitAndInstall.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("checks for updates on initialize when packaged", () => {
    const service = createUpdateService({
      isPackaged: true,
      currentVersion: "1.0.0",
      stateFilePath,
    });

    service.initialize();

    expect(updaterMocks.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("marks an available update as skipped when the version was previously skipped", () => {
    fs.writeFileSync(stateFilePath, JSON.stringify({ skippedVersion: "1.0.1" }), "utf8");
    const service = createUpdateService({
      isPackaged: true,
      currentVersion: "1.0.0",
      stateFilePath,
    });

    emit("update-available", {
      version: "1.0.1",
      releaseName: "v1.0.1",
      releaseNotes: "Fixes",
      releaseDate: "2026-04-09T00:00:00.000Z",
    });

    expect(service.getState()).toMatchObject({
      phase: "skipped",
      availableVersion: "1.0.1",
      releaseName: "v1.0.1",
      releaseNotes: "Fixes",
      skippedVersion: "1.0.1",
    });
  });

  it("normalizes HTML release notes from GitHub into readable text", () => {
    const service = createUpdateService({
      isPackaged: true,
      currentVersion: "1.0.0",
      stateFilePath,
    });

    emit("update-available", {
      version: "1.0.1",
      releaseNotes:
        '<h2>CodePal v1.0.1</h2><h3>Fixed</h3><ul><li>Fixed &amp; verified updater metadata.</li><li>See <a href="https://example.com">changelog</a>.</li></ul>',
    });

    expect(service.getState().releaseNotes).toBe(
      "CodePal v1.0.1\n\nFixed\n\n- Fixed & verified updater metadata.\n- See changelog (https://example.com).",
    );
  });

  it("persists skipped version and restores available state when cleared", () => {
    const service = createUpdateService({
      isPackaged: true,
      currentVersion: "1.0.0",
      stateFilePath,
    });

    emit("update-available", {
      version: "1.0.2",
      releaseNotes: "Notes",
    });
    service.skipVersion();

    expect(service.getState()).toMatchObject({
      phase: "skipped",
      skippedVersion: "1.0.2",
    });
    expect(JSON.parse(fs.readFileSync(stateFilePath, "utf8"))).toEqual({
      skippedVersion: "1.0.2",
    });

    service.clearSkippedVersion();

    expect(service.getState()).toMatchObject({
      phase: "available",
      skippedVersion: null,
      availableVersion: "1.0.2",
    });
  });

  it("tracks download progress and downloaded state", () => {
    const service = createUpdateService({
      isPackaged: true,
      currentVersion: "1.0.0",
      stateFilePath,
    });

    emit("update-available", {
      version: "1.0.3",
      releaseNotes: "Notes",
    });
    emit("download-progress", { percent: 42.2 });

    expect(service.getState()).toMatchObject({
      phase: "downloading",
      downloadPercent: 42,
    });

    emit("update-downloaded", {
      version: "1.0.3",
      releaseNotes: "Notes",
    });

    expect(service.getState()).toMatchObject({
      phase: "downloaded",
      downloadPercent: 100,
    });
  });

  it("surfaces unsupported state for unpackaged builds", async () => {
    const service = createUpdateService({
      isPackaged: false,
      currentVersion: "1.0.0",
      stateFilePath,
    });

    await service.checkForUpdates();

    expect(service.getState()).toMatchObject({
      supported: false,
      phase: "error",
      errorMessage: "In-app updates are only available in packaged macOS builds.",
    });
    expect(updaterMocks.checkForUpdates).not.toHaveBeenCalled();
  });

  it("runs onBeforeInstall before quitting to install", () => {
    const calls: string[] = [];
    updaterMocks.quitAndInstall.mockImplementationOnce(() => {
      calls.push("quitAndInstall");
    });
    const service = createUpdateService({
      isPackaged: true,
      currentVersion: "1.0.0",
      stateFilePath,
      onBeforeInstall: () => {
        calls.push("onBeforeInstall");
      },
    });

    service.installUpdate();

    expect(calls).toEqual(["onBeforeInstall", "quitAndInstall"]);
  });

  it("does not run onBeforeInstall when update install is unsupported", () => {
    const onBeforeInstall = vi.fn();
    const service = createUpdateService({
      isPackaged: false,
      currentVersion: "1.0.0",
      stateFilePath,
      onBeforeInstall,
    });

    service.installUpdate();

    expect(onBeforeInstall).not.toHaveBeenCalled();
    expect(updaterMocks.quitAndInstall).not.toHaveBeenCalled();
  });
});
