import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { AppSettings } from "../../shared/appSettings";
import { defaultAppSettings, mergeAppSettings, normalizeAppSettings } from "../../shared/appSettings";

type SettingsServiceOptions = {
  writablePath: string;
  templatePath?: string;
};

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readSettingsFile(filePath: string): AppSettings {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return normalizeAppSettings(YAML.parse(raw));
  } catch {
    return defaultAppSettings;
  }
}

function writeSettingsFile(filePath: string, settings: AppSettings) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, YAML.stringify(settings), "utf8");
}

export function createSettingsService(options: SettingsServiceOptions) {
  const writablePath = options.writablePath;
  const templatePath = options.templatePath;
  const initialSettings = fs.existsSync(writablePath)
    ? readSettingsFile(writablePath)
    : templatePath && fs.existsSync(templatePath)
      ? readSettingsFile(templatePath)
      : defaultAppSettings;
  let settings = initialSettings;

  if (!fs.existsSync(writablePath)) {
    writeSettingsFile(writablePath, initialSettings);
  }

  function getSettings(): AppSettings {
    return settings;
  }

  function reloadSettings(): AppSettings {
    settings = fs.existsSync(writablePath)
      ? readSettingsFile(writablePath)
      : templatePath && fs.existsSync(templatePath)
        ? readSettingsFile(templatePath)
        : defaultAppSettings;
    if (!fs.existsSync(writablePath)) {
      writeSettingsFile(writablePath, settings);
    }
    return settings;
  }

  function updateSettings(incoming: Partial<AppSettings>): AppSettings {
    settings = mergeAppSettings(settings, incoming);
    writeSettingsFile(writablePath, settings);
    return settings;
  }

  function replaceSettings(incoming: unknown): AppSettings {
    settings = normalizeAppSettings(incoming);
    writeSettingsFile(writablePath, settings);
    return settings;
  }

  function importSettingsFromFile(importPath: string): AppSettings {
    const raw = fs.readFileSync(importPath, "utf8");
    return replaceSettings(YAML.parse(raw));
  }

  function exportSettingsToFile(exportPath: string): string {
    writeSettingsFile(exportPath, settings);
    return exportPath;
  }

  function resetSettings(): AppSettings {
    settings =
      templatePath && fs.existsSync(templatePath)
        ? readSettingsFile(templatePath)
        : defaultAppSettings;
    writeSettingsFile(writablePath, settings);
    return settings;
  }

  return {
    filePath: writablePath,
    templatePath,
    getSettings,
    reloadSettings,
    updateSettings,
    replaceSettings,
    importSettingsFromFile,
    exportSettingsToFile,
    resetSettings,
  };
}
