import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CODEBUDDY_AUTH_COOKIE_NAMES, defaultAppSettings, normalizeAppSettings } from "../../shared/appSettings";
import { createSettingsService } from "./settingsService";
import YAML from "yaml";

let tmpDir: string | null = null;

describe("settingsService", () => {
  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("materializes a writable settings file on first load", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-settings-"));
    const templatePath = path.join(tmpDir, "config", "settings.template.yaml");
    const writablePath = path.join(tmpDir, "settings.local.yaml");
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    fs.writeFileSync(
      templatePath,
      fs.readFileSync(path.join(process.cwd(), "config", "settings.template.yaml"), "utf8"),
      "utf8",
    );
    const service = createSettingsService({ writablePath, templatePath });

    expect(service.getSettings()).toMatchObject({
      version: 1,
      display: {
        showInStatusBar: true,
        hiddenAgents: [],
        density: "detailed",
      },
      history: {
        persistenceEnabled: true,
        retentionDays: 2,
        maxStorageMb: 100,
      },
      codebuddy: {
        enterprise: {
          enabled: false,
          label: "CodeBuddy Enterprise",
        },
        code: defaultAppSettings.codebuddy.code,
      },
    });
    expect(fs.existsSync(writablePath)).toBe(true);
    expect(fs.readFileSync(writablePath, "utf8")).toContain("version: 1");
  });

  it("updates and persists nested settings", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-settings-"));
    const templatePath = path.join(tmpDir, "config", "settings.template.yaml");
    const writablePath = path.join(tmpDir, "settings.local.yaml");
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    fs.writeFileSync(templatePath, "version: 1\n", "utf8");
    const service = createSettingsService({ writablePath, templatePath });

    const updated = service.updateSettings({
      display: {
        showInStatusBar: false,
        hiddenAgents: ["claude"],
        density: "compact",
      },
      codebuddy: {
        enterprise: {
          enabled: true,
          label: "Team CodeBuddy",
          loginUrl: "https://codebuddy-enterprise.example.com/login",
          quotaEndpoint: "https://codebuddy-enterprise.example.com/api/quota",
          cookieNames: ["RIO_TOKEN"],
        },
      },
    });

    expect(updated).toMatchObject({
      display: {
        showInStatusBar: false,
        hiddenAgents: ["claude"],
        density: "compact",
      },
      codebuddy: {
        enterprise: {
          enabled: true,
          label: "Team CodeBuddy",
          loginUrl: "https://codebuddy-enterprise.example.com/login",
          quotaEndpoint: "https://codebuddy-enterprise.example.com/api/quota",
          cookieNames: ["RIO_TOKEN"],
        },
      },
    });

    updated.display.hiddenAgents.push("cursor");
    expect(service.getSettings().display.hiddenAgents).toEqual(["claude"]);

    const reloaded = createSettingsService({ writablePath, templatePath });
    expect(reloaded.getSettings()).toMatchObject({
      display: {
        showInStatusBar: false,
        hiddenAgents: ["claude"],
        density: "compact",
      },
      codebuddy: {
        enterprise: {
          enabled: true,
          label: "Team CodeBuddy",
          loginUrl: "https://codebuddy-enterprise.example.com/login",
          quotaEndpoint: "https://codebuddy-enterprise.example.com/api/quota",
          cookieNames: ["RIO_TOKEN"],
        },
      },
    });
  });

  it("returns cloned settings snapshots instead of live mutable state", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-settings-"));
    const templatePath = path.join(tmpDir, "config", "settings.template.yaml");
    const writablePath = path.join(tmpDir, "settings.local.yaml");
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    fs.writeFileSync(templatePath, "version: 1\n", "utf8");
    const service = createSettingsService({ writablePath, templatePath });

    const snapshot = service.getSettings();
    snapshot.display.hiddenAgents.push("claude");
    snapshot.codebuddy.code.cookieNames.push("custom-cookie");

    expect(service.getSettings().display.hiddenAgents).toEqual([]);
    expect(service.getSettings().codebuddy.code.cookieNames).toEqual(
      defaultAppSettings.codebuddy.code.cookieNames,
    );
  });

  it("reloads settings from disk when the yaml file changes externally", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-settings-"));
    const templatePath = path.join(tmpDir, "config", "settings.template.yaml");
    const writablePath = path.join(tmpDir, "settings.local.yaml");
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    fs.writeFileSync(templatePath, "version: 1\n", "utf8");
    const service = createSettingsService({ writablePath, templatePath });

    fs.writeFileSync(
      writablePath,
      YAML.stringify({
        version: 1,
        display: {
          showInStatusBar: true,
          hiddenAgents: [],
          density: "detailed",
        },
        codebuddy: {
          code: {
            enabled: true,
            label: "CodeBuddy Code",
            loginUrl: "https://example.com/login",
            quotaEndpoint: "https://example.com/quota",
            cookieNames: ["RIO_TOKEN"],
          },
          enterprise: {
            enabled: false,
            label: "CodeBuddy Enterprise",
            loginUrl: "",
            quotaEndpoint: "",
            cookieNames: [],
          },
        },
      }),
      "utf8",
    );

    expect(service.reloadSettings()).toMatchObject({
      codebuddy: {
        code: {
          loginUrl: "https://example.com/login",
          quotaEndpoint: "https://example.com/quota",
          cookieNames: ["RIO_TOKEN"],
        },
      },
    });
  });

  it("keeps default-backed reset settings isolated from in-memory mutation", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-settings-"));
    const writablePath = path.join(tmpDir, "settings.local.yaml");
    const service = createSettingsService({ writablePath });

    service.getSettings().display.hiddenAgents.push("claude");
    service.getSettings().codebuddy.code.cookieNames.push("custom-cookie");

    const reset = service.resetSettings();

    expect(reset.display.hiddenAgents).toEqual([]);
    expect(reset.codebuddy.code.cookieNames).toEqual(DEFAULT_CODEBUDDY_AUTH_COOKIE_NAMES);
    expect(defaultAppSettings.display.hiddenAgents).toEqual([]);
  });

  it("round-trips notification settings through normalize", () => {
    const result = normalizeAppSettings({
      version: 1,
      notifications: {
        enabled: false,
        soundEnabled: true,
        completed: false,
        waiting: true,
        error: true,
        resumed: false,
      },
    });
    expect(result.notifications).toEqual({
      enabled: false,
      soundEnabled: true,
      completed: false,
      waiting: true,
      error: true,
      resumed: false,
    });
  });

  it("fills default notification settings when key is missing", () => {
    const result = normalizeAppSettings({ version: 1 });
    expect(result.notifications).toEqual({
      enabled: true,
      soundEnabled: false,
      completed: true,
      waiting: true,
      error: true,
      resumed: true,
    });
  });

  it("logs and falls back when the template yaml is malformed", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-settings-"));
    const templatePath = path.join(tmpDir, "config", "settings.template.yaml");
    const writablePath = path.join(tmpDir, "settings.local.yaml");
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    fs.writeFileSync(templatePath, "version: [\n", "utf8");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const service = createSettingsService({ writablePath, templatePath });

    expect(service.getSettings()).toMatchObject(defaultAppSettings);
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[0]).toContain(templatePath);

    errorSpy.mockRestore();
  });
});
