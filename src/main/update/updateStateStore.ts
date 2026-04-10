import fs from "node:fs";
import path from "node:path";

type StoredUpdateState = {
  skippedVersion: string | null;
};

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readStoredState(filePath: string): StoredUpdateState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<StoredUpdateState>;
    return {
      skippedVersion: typeof raw.skippedVersion === "string" && raw.skippedVersion.trim()
        ? raw.skippedVersion.trim()
        : null,
    };
  } catch {
    return { skippedVersion: null };
  }
}

export function createUpdateStateStore(filePath: string) {
  let state = readStoredState(filePath);

  function persist() {
    ensureParentDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  return {
    getSkippedVersion() {
      return state.skippedVersion;
    },
    setSkippedVersion(version: string | null) {
      state = {
        skippedVersion: version && version.trim() ? version.trim() : null,
      };
      persist();
      return state.skippedVersion;
    },
  };
}
