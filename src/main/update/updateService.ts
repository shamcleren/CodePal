import electronUpdater from "electron-updater";
import type { AppUpdateState } from "../../shared/updateTypes";
import { createUpdateStateStore } from "./updateStateStore";

const { autoUpdater } = electronUpdater;

type UpdateServiceOptions = {
  isPackaged: boolean;
  currentVersion: string;
  stateFilePath: string;
  onStateChange?: (state: AppUpdateState) => void;
};

type UpdateInfoLike = {
  version?: string | null;
  releaseName?: string | null;
  releaseDate?: string | null;
  releaseNotes?: unknown;
};

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  gt: ">",
  lt: "<",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return HTML_ENTITY_MAP[entity] ?? match;
  });
}

function normalizeHtmlReleaseNotes(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol)\s*>/gi, "\n\n")
      .replace(/<\s*li\b[^>]*>/gi, "- ")
      .replace(/<\s*\/\s*li\s*>/gi, "\n")
      .replace(/<\s*a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\s*\/\s*a\s*>/gis, "$2 ($1)")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function normalizeReleaseNotes(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    return /<\/?[a-z][\s\S]*>/i.test(trimmed) ? normalizeHtmlReleaseNotes(trimmed) : trimmed;
  }
  if (Array.isArray(value)) {
    const combined = value
      .map((item) => {
        if (typeof item === "string") {
          return normalizeReleaseNotes(item) ?? "";
        }
        if (item && typeof item === "object" && typeof (item as { note?: unknown }).note === "string") {
          return normalizeReleaseNotes((item as { note: string }).note) ?? "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
    return combined || null;
  }
  return null;
}

function createBaseState(
  currentVersion: string,
  skippedVersion: string | null,
  supported: boolean,
): AppUpdateState {
  return {
    supported,
    phase: "idle",
    currentVersion,
    availableVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseDate: null,
    skippedVersion,
    downloadPercent: null,
    errorMessage: null,
    lastCheckedAt: null,
  };
}

function mergeUpdateInfo(state: AppUpdateState, info?: UpdateInfoLike): AppUpdateState {
  return {
    ...state,
    availableVersion: info?.version?.trim() || null,
    releaseName: info?.releaseName?.trim() || null,
    releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
    releaseDate: info?.releaseDate?.trim() || null,
  };
}

export function createUpdateService(options: UpdateServiceOptions) {
  const store = createUpdateStateStore(options.stateFilePath);
  let state = createBaseState(options.currentVersion, store.getSkippedVersion(), options.isPackaged);

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  function emitState(nextState: AppUpdateState) {
    state = nextState;
    options.onStateChange?.(state);
  }

  function setPhase(phase: AppUpdateState["phase"], extra?: Partial<AppUpdateState>) {
    emitState({
      ...state,
      phase,
      ...extra,
    });
  }

  autoUpdater.on("checking-for-update", () => {
    setPhase("checking", {
      errorMessage: null,
      downloadPercent: null,
    });
  });

  autoUpdater.on("update-not-available", () => {
    setPhase("idle", {
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      releaseDate: null,
      downloadPercent: null,
      errorMessage: null,
      lastCheckedAt: Date.now(),
    });
  });

  autoUpdater.on("update-available", (info) => {
    const withInfo = mergeUpdateInfo(state, info);
    const nextPhase =
      withInfo.availableVersion && withInfo.availableVersion === state.skippedVersion
        ? "skipped"
        : "available";
    emitState({
      ...withInfo,
      phase: nextPhase,
      downloadPercent: null,
      errorMessage: null,
      lastCheckedAt: Date.now(),
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setPhase("downloading", {
      downloadPercent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      errorMessage: null,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const withInfo = mergeUpdateInfo(state, info);
    emitState({
      ...withInfo,
      phase: "downloaded",
      downloadPercent: 100,
      errorMessage: null,
      lastCheckedAt: Date.now(),
    });
  });

  autoUpdater.on("error", (error) => {
    setPhase("error", {
      errorMessage: error == null ? "Unknown update error" : String(error.message || error),
      downloadPercent: null,
      lastCheckedAt: Date.now(),
    });
  });

  function ensureSupported() {
    if (!options.isPackaged) {
      setPhase("error", {
        errorMessage: "In-app updates are only available in packaged macOS builds.",
      });
      return false;
    }
    return true;
  }

  async function checkForUpdates() {
    if (!ensureSupported()) {
      return state;
    }
    await autoUpdater.checkForUpdates();
    return state;
  }

  async function downloadUpdate() {
    if (!ensureSupported()) {
      return state;
    }
    await autoUpdater.downloadUpdate();
    return state;
  }

  function installUpdate() {
    if (!ensureSupported()) {
      return state;
    }
    autoUpdater.quitAndInstall();
    return state;
  }

  function skipVersion() {
    if (!state.availableVersion) {
      return state;
    }
    const skippedVersion = store.setSkippedVersion(state.availableVersion);
    emitState({
      ...state,
      phase: "skipped",
      skippedVersion,
    });
    return state;
  }

  function clearSkippedVersion() {
    const skippedVersion = store.setSkippedVersion(null);
    const nextPhase = state.availableVersion ? "available" : "idle";
    emitState({
      ...state,
      skippedVersion,
      phase: nextPhase,
    });
    return state;
  }

  function initialize() {
    if (options.isPackaged) {
      void checkForUpdates().catch((error) => {
        setPhase("error", {
          errorMessage: error == null ? "Unknown update error" : String(error.message || error),
          lastCheckedAt: Date.now(),
        });
      });
    }
    return state;
  }

  return {
    initialize,
    getState() {
      return state;
    },
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    skipVersion,
    clearSkippedVersion,
  };
}
