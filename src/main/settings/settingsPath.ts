import path from "node:path";

export function resolveTemplateSettingsPath(appPath: string): string {
  return path.join(appPath, "config", "settings.template.yaml");
}

export function resolveWritableSettingsPath(input: {
  override?: string;
  userDataPath: string;
}): string {
  const override = input.override?.trim();
  if (override) {
    return override;
  }
  return path.join(input.userDataPath, "settings.yaml");
}
