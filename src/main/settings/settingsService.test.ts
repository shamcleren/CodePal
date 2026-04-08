import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
    fs.writeFileSync(templatePath, "version: 1\n", "utf8");
    const service = createSettingsService({ writablePath, templatePath });

    expect(service.getSettings()).toMatchObject({
      version: 1,
      display: {
        showInStatusBar: true,
        hiddenAgents: [],
        density: "detailed",
      },
      codebuddy: {
        enterprise: {
          enabled: false,
          label: "CodeBuddy Enterprise",
        },
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

    const reloaded = createSettingsService({ writablePath, templatePath });
    expect(reloaded.getSettings()).toMatchObject(updated);
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
});
