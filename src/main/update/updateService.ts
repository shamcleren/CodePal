import { autoUpdater } from "electron-updater";
import type { AppUpdateState } from "../../shared/updateTypes";
import { createUpdateStateStore } from "./updateStateStore";

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

function normalizeReleaseNotes(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const combined = value
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }
        if (item && typeof item === "object" && typeof (item as { note?: unknown }).note === "string") {
          return (item as { note: string }).note.trim();
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
