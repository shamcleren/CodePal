export const UNKNOWN_PROJECT_PATH = "unknown";
export const UNKNOWN_PROJECT_NAME = "unknown";

export type ProjectAttribution = {
  projectPath: string;
  projectName: string;
};

export type ProjectUsageSortable = {
  projectPath: string;
  projectName: string;
  totalTokens: number;
  requestCount: number;
};

export function isUnknownProjectPath(projectPath: string | null | undefined): boolean {
  return !projectPath || projectPath === UNKNOWN_PROJECT_PATH;
}

export function projectDisplayName(projectPath: string | null | undefined): string {
  if (isUnknownProjectPath(projectPath)) {
    return UNKNOWN_PROJECT_NAME;
  }
  const normalized = projectPath.replace(/[\\/]+$/, "");
  const basename = normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  return basename || normalized || UNKNOWN_PROJECT_NAME;
}

export function normalizeProjectAttribution(
  projectPath: string | null | undefined,
  projectName?: string | null,
): ProjectAttribution | null {
  const trimmedPath = typeof projectPath === "string" ? projectPath.trim() : "";
  if (!trimmedPath || trimmedPath === UNKNOWN_PROJECT_PATH) {
    return null;
  }
  const trimmedName = typeof projectName === "string" ? projectName.trim() : "";
  return {
    projectPath: trimmedPath,
    projectName: trimmedName || projectDisplayName(trimmedPath),
  };
}

export function sortProjectRows<T extends ProjectUsageSortable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aUnknown = isUnknownProjectPath(a.projectPath);
    const bUnknown = isUnknownProjectPath(b.projectPath);
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
    return (
      b.totalTokens - a.totalTokens ||
      b.requestCount - a.requestCount ||
      a.projectName.localeCompare(b.projectName) ||
      a.projectPath.localeCompare(b.projectPath)
    );
  });
}
