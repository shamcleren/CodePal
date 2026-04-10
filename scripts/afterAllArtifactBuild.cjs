const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function run(command, args) {
  const rendered = [command, ...args].join(" ");
  console.log(`[release] ${rendered}`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${rendered}`);
  }
}

function hasNotarizationCredentials() {
  const hasAppleIdFlow =
    Boolean(process.env.APPLE_ID) &&
    Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
    Boolean(process.env.APPLE_TEAM_ID);
  const hasApiKeyFlow =
    Boolean(process.env.APPLE_API_KEY) &&
    Boolean(process.env.APPLE_API_KEY_ID) &&
    Boolean(process.env.APPLE_API_ISSUER);
  const hasKeychainFlow = Boolean(process.env.APPLE_KEYCHAIN_PROFILE);

  return hasAppleIdFlow || hasApiKeyFlow || hasKeychainFlow;
}

function findFirstApp(outDir) {
  const entries = fs.readdirSync(outDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("mac")) {
      continue;
    }

    const macDir = path.join(outDir, entry.name);
    const appEntry = fs
      .readdirSync(macDir, { withFileTypes: true })
      .find((child) => child.isDirectory() && child.name.endsWith(".app"));
    if (appEntry) {
      return path.join(macDir, appEntry.name);
    }
  }

  return null;
}

exports.default = async function afterAllArtifactBuild(buildResult) {
  if (process.platform !== "darwin") {
    return [];
  }

  if (process.env.CODEPAL_SKIP_RELEASE_FINISH === "1") {
    console.log("[release] Skipping macOS release finishing because CODEPAL_SKIP_RELEASE_FINISH=1.");
    return [];
  }

  if (!hasNotarizationCredentials()) {
    throw new Error(
      "Missing Apple notarization credentials. Set APPLE_KEYCHAIN_PROFILE, or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER."
    );
  }

  const artifactPaths = buildResult.artifactPaths || [];
  const dmgPaths = artifactPaths.filter((artifactPath) => artifactPath.endsWith(".dmg"));
  const appPath = findFirstApp(buildResult.outDir);

  if (!appPath || !fs.existsSync(appPath)) {
    throw new Error(`Signed app bundle not found under ${buildResult.outDir}.`);
  }

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

  for (const dmgPath of dmgPaths) {
    run("xcrun", ["stapler", "staple", "-v", dmgPath]);
    run("xcrun", ["stapler", "validate", "-v", dmgPath]);
  }

  run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);

  console.log("[release] macOS release validation finished.");
  return [];
};
