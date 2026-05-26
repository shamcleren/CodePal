import fs from "node:fs";
import path from "node:path";
import {
  normalizeProjectAttribution,
  type ProjectAttribution,
} from "../../shared/projectAttribution";

type ProjectAttributionInput = {
  workspacePath?: string | null;
  cwd?: string | null;
};

function cleanPath(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? path.resolve(trimmed) : null;
}

function directoryForLookup(value: string): string {
  try {
    const stat = fs.statSync(value);
    return stat.isFile() ? path.dirname(value) : value;
  } catch {
    return value;
  }
}

function findGitRoot(startPath: string): string | null {
  let cursor = directoryForLookup(startPath);
  while (true) {
    if (fs.existsSync(path.join(cursor, ".git"))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return null;
    }
    cursor = parent;
  }
}

function attributionForPath(value: string | null | undefined): ProjectAttribution | null {
  const cleaned = cleanPath(value);
  if (!cleaned) return null;
  return normalizeProjectAttribution(findGitRoot(cleaned) ?? cleaned);
}

export function resolveProjectAttribution(
  input: ProjectAttributionInput,
): ProjectAttribution | null {
  return attributionForPath(input.workspacePath) ?? attributionForPath(input.cwd);
}
