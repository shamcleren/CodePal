import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

type SpawnLike = typeof spawn;
type SpawnSyncLike = typeof spawnSync;

type ScheduleMacShipItKickstartOptions = {
  platform?: NodeJS.Platform;
  bundleIdentifier: string;
  uid?: number;
  attempts?: number;
  intervalSeconds?: number;
  spawnImpl?: SpawnLike;
};

type SchedulePendingMacShipItKickstartOptions = ScheduleMacShipItKickstartOptions & {
  cacheDir: string;
  currentVersion: string;
  spawnSyncImpl?: SpawnSyncLike;
};

const MINIMAL_LAUNCHCTL_ENV = {
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseVersionSegments(version: string): number[] | null {
  const normalized = version.trim().replace(/^v/i, "").split(/[+-]/, 1)[0];
  if (!normalized) {
    return null;
  }
  const segments = normalized.split(".");
  if (!segments.every((segment) => /^\d+$/.test(segment))) {
    return null;
  }
  return segments.map((segment) => Number.parseInt(segment, 10));
}

function compareVersions(left: string, right: string): number | null {
  const leftSegments = parseVersionSegments(left);
  const rightSegments = parseVersionSegments(right);
  if (!leftSegments || !rightSegments) {
    return null;
  }
  const length = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftSegments[index] ?? 0) - (rightSegments[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

function readInfoPlistVersion(infoPlistPath: string): string | null {
  const source = fs.readFileSync(infoPlistPath, "utf8");
  const match = source.match(
    /<key>\s*CFBundleShortVersionString\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/,
  );
  return match?.[1]?.trim() || null;
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function clearStaleShipItState(statePath: string): void {
  try {
    fs.rmSync(statePath, { force: true });
  } catch {
    // Best-effort cleanup only; stale state should not block startup.
  }
}

function readPendingShipItVersion(cacheDir: string, bundleIdentifier: string): string | null {
  const statePath = path.join(cacheDir, `${bundleIdentifier}.ShipIt`, "ShipItState.plist");
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as { updateBundleURL?: unknown };
    if (typeof parsed.updateBundleURL !== "string") {
      return null;
    }
    const updateBundlePath = fileURLToPath(parsed.updateBundleURL);
    const infoPlistPath = path.join(updateBundlePath, "Contents", "Info.plist");
    if (!fs.existsSync(infoPlistPath)) {
      clearStaleShipItState(statePath);
      return null;
    }
    return readInfoPlistVersion(infoPlistPath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      clearStaleShipItState(statePath);
      return null;
    }
    console.error("[CodePal Update] failed to inspect pending ShipIt update:", error);
    return null;
  }
}

function launchdServiceFor(uid: number, bundleIdentifier: string): string {
  return `gui/${Math.trunc(uid)}/${bundleIdentifier}.ShipIt`;
}

function hasShipItLaunchdJob(
  service: string,
  spawnSyncImpl: SpawnSyncLike = spawnSync,
): boolean {
  const result = spawnSyncImpl("/bin/launchctl", ["print", service], {
    stdio: "ignore",
    env: MINIMAL_LAUNCHCTL_ENV,
  });
  return result.status === 0;
}

export function scheduleMacShipItKickstart(options: ScheduleMacShipItKickstartOptions): boolean {
  if ((options.platform ?? process.platform) !== "darwin") {
    return false;
  }

  const bundleIdentifier = options.bundleIdentifier.trim();
  const uid = options.uid ?? process.getuid?.();
  if (!bundleIdentifier || typeof uid !== "number" || !Number.isFinite(uid)) {
    return false;
  }

  const service = launchdServiceFor(uid, bundleIdentifier);
  const attempts = normalizePositiveInteger(options.attempts, 120);
  const intervalSeconds = normalizePositiveNumber(options.intervalSeconds, 0.5);
  const script = [
    `service=${shellQuote(service)}`,
    `attempts=${attempts}`,
    "i=0",
    'while [ "$i" -lt "$attempts" ]; do',
    '  if /bin/launchctl print "$service" >/dev/null 2>&1; then',
    '    /bin/launchctl kickstart -k "$service" >/dev/null 2>&1 || true',
    "    exit 0",
    "  fi",
    '  i=$((i + 1))',
    `  /bin/sleep ${intervalSeconds}`,
    "done",
  ].join("\n");

  try {
    const child = (options.spawnImpl ?? spawn)("/bin/sh", ["-c", script], {
      detached: true,
      stdio: "ignore",
      env: MINIMAL_LAUNCHCTL_ENV,
    });
    child.unref();
    return true;
  } catch (error) {
    console.error("[CodePal Update] failed to schedule ShipIt kickstart:", error);
    return false;
  }
}

export function schedulePendingMacShipItKickstart(
  options: SchedulePendingMacShipItKickstartOptions,
): boolean {
  if ((options.platform ?? process.platform) !== "darwin") {
    return false;
  }

  const bundleIdentifier = options.bundleIdentifier.trim();
  const uid = options.uid ?? process.getuid?.();
  if (!bundleIdentifier || typeof uid !== "number" || !Number.isFinite(uid)) {
    return false;
  }

  const pendingVersion = readPendingShipItVersion(options.cacheDir, bundleIdentifier);
  const comparison = pendingVersion ? compareVersions(pendingVersion, options.currentVersion) : null;
  if (comparison === null || comparison <= 0) {
    return false;
  }

  const service = launchdServiceFor(uid, bundleIdentifier);
  if (!hasShipItLaunchdJob(service, options.spawnSyncImpl)) {
    return false;
  }

  return scheduleMacShipItKickstart(options);
}
