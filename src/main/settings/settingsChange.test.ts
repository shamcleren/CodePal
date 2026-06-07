import { describe, expect, it } from "vitest";
import { defaultAppSettings, mergeAppSettings } from "../../shared/appSettings";
import { shouldApplyHistorySettingsAtRuntime } from "./settingsChange";

describe("settingsChange", () => {
  it("does not run history cleanup for visual preferences", () => {
    const nextSettings = mergeAppSettings(defaultAppSettings, {
      display: {
        hiddenAgents: ["claude"],
      },
    });

    expect(shouldApplyHistorySettingsAtRuntime(defaultAppSettings, nextSettings)).toBe(false);
  });

  it("does not run history cleanup for notification preferences", () => {
    const nextSettings = mergeAppSettings(defaultAppSettings, {
      notifications: {
        soundEnabled: true,
      },
    });

    expect(shouldApplyHistorySettingsAtRuntime(defaultAppSettings, nextSettings)).toBe(false);
  });

  it("does not run history cleanup when only persistence is toggled", () => {
    const nextSettings = mergeAppSettings(defaultAppSettings, {
      history: {
        persistenceEnabled: false,
      },
    });

    expect(shouldApplyHistorySettingsAtRuntime(defaultAppSettings, nextSettings)).toBe(false);
  });

  it("runs history cleanup when retention settings change", () => {
    const nextSettings = mergeAppSettings(defaultAppSettings, {
      history: {
        detailRetention: "90d",
      },
    });

    expect(shouldApplyHistorySettingsAtRuntime(defaultAppSettings, nextSettings)).toBe(true);
  });
});
