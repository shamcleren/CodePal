import { describe, expect, it } from "vitest";
import { defaultAppSettings } from "../shared/appSettings";
import { buildSupportDiagnosticsReport } from "./supportDiagnostics";

describe("buildSupportDiagnosticsReport", () => {
  it("builds a redacted support summary with local source paths", () => {
    const report = buildSupportDiagnosticsReport({
      generatedAt: Date.parse("2026-04-09T12:00:00.000Z"),
      resolvedLocale: "en",
      appSettings: defaultAppSettings,
      appSettingsPath: "/Users/demo/Library/Application Support/codepal/settings.yaml",
      homeDir: "/Users/demo",
      integrationDiagnostics: {
        listener: { mode: "tcp", host: "127.0.0.1", port: 17371 },
        runtime: {
          packaged: false,
          hookScriptsRoot: "/tmp/hooks",
          executablePath: "/tmp/Electron",
          executableLabel: "CodePal Dev Build",
        },
        agents: [
          {
            id: "cursor",
            label: "Cursor",
            supported: true,
            configPath: "/Users/demo/.cursor/hooks.json",
            configExists: true,
            hookScriptPath: "/tmp/cursor.sh",
            hookScriptExists: true,
            hookInstalled: true,
            health: "active",
            healthLabel: "Active",
            actionLabel: "Repair",
            statusMessage: "OK",
          },
        ],
      },
      historyDiagnostics: {
        enabled: true,
        dbPath: "/Users/demo/Library/Application Support/codepal/history.sqlite",
        dbSizeBytes: 42,
        estimatedSessionCount: 3,
        estimatedActivityCount: 9,
        lastCleanupAt: Date.parse("2026-04-09T12:03:00.000Z"),
      },
      updateState: {
        supported: false,
        phase: "idle",
        currentVersion: "1.0.0",
        availableVersion: null,
        releaseName: null,
        releaseNotes: null,
        releaseDate: null,
        skippedVersion: null,
        downloadPercent: null,
        errorMessage: null,
        lastCheckedAt: null,
      },
    });

    expect(report).toContain("CodePal Support Diagnostics");
    expect(report).toContain("Resolved Locale: en");
    expect(report).toContain("Listener: tcp 127.0.0.1:17371");
    expect(report).toContain("History");
    expect(report).toContain("Enabled: yes");
    expect(report).toContain("DB Size Bytes: 42");
    expect(report).toContain("Session Count: 3");
    expect(report).toContain("Activity Count: 9");
    expect(report).toContain("~/Library/Application Support/codepal/settings.yaml");
    expect(report).toContain("~/.codex/sessions/");
    expect(report).not.toContain("/Users/demo");
    expect(report).not.toContain("/tmp/Electron");
  });
});
