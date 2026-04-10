export function formatSettingsPathForDisplay(path: string, homeDir: string): string {
  const trimmedPath = path.trim();
  const trimmedHome = homeDir.trim().replace(/\/+$/, "");
  if (!trimmedPath || !trimmedHome) {
    return trimmedPath;
  }
  if (trimmedPath === trimmedHome) {
    return "~";
  }
  const homePrefix = `${trimmedHome}/`;
  if (trimmedPath.startsWith(homePrefix)) {
    return `~/${trimmedPath.slice(homePrefix.length)}`;
  }
  return trimmedPath;
}
