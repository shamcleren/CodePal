export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "skipped"
  | "error";

export type AppUpdateState = {
  supported: boolean;
  phase: AppUpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  skippedVersion: string | null;
  downloadPercent: number | null;
  errorMessage: string | null;
  lastCheckedAt: number | null;
};
