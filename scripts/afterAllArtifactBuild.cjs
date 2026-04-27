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

function getNotaryAuthArgs() {
  if (process.env.APPLE_KEYCHAIN_PROFILE) {
    return ["--keychain-profile", process.env.APPLE_KEYCHAIN_PROFILE];
  }

  if (
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
  ) {
    return [
      "--apple-id",
      process.env.APPLE_ID,
      "--password",
      process.env.APPLE_APP_SPECIFIC_PASSWORD,
      "--team-id",
      process.env.APPLE_TEAM_ID,
    ];
  }

  if (
    process.env.APPLE_API_KEY &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER
  ) {
    return [
      "--key",
      process.env.APPLE_API_KEY,
      "--key-id",
      process.env.APPLE_API_KEY_ID,
      "--issuer",
      process.env.APPLE_API_ISSUER,
    ];
  }

  throw new Error("Missing Apple notarization credentials.");
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
    run("xcrun", ["notarytool", "submit", dmgPath, ...getNotaryAuthArgs(), "--wait"]);
  }

  // Staple the notary ticket onto the .app and the .dmg so Gatekeeper can
  // verify them offline. Without this, downloads from GitHub still hit the
  // "damaged / unidentified developer" prompt because macOS quarantines the
  // file and there's no embedded ticket to short-circuit the online check.
  run("xcrun", ["stapler", "staple", appPath]);
  for (const dmgPath of dmgPaths) {
    run("xcrun", ["stapler", "staple", dmgPath]);
  }
  run("xcrun", ["stapler", "validate", "-v", appPath]);

  // electron-builder uploads artifacts to the draft release BEFORE this hook
  // runs, so those uploaded copies are pre-staple. Re-upload the stapled dmg
  // (the user-facing download) so the GitHub release matches what we just
  // verified locally. The .zip is regenerated below from the stapled .app
  // and re-uploaded for the auto-updater.
  const tagForUpload = `v${
    buildResult.configuration.buildVersion || require("../package.json").version
  }`;
  for (const dmgPath of dmgPaths) {
    run("gh", ["release", "upload", tagForUpload, dmgPath, "--clobber"]);
  }

  console.log("[release] macOS release validation finished.");

  // electron-builder creates a draft release by default.
  // Publish it so the auto-updater can detect the new version.
  // Notes: `gh release edit` does NOT accept `--generate-notes` (that flag
  // only exists on `gh release create`). Prefer the project's release-notes
  // markdown when present; otherwise publish without notes and let the
  // author edit the release on GitHub.
  const version = buildResult.configuration.buildVersion || require("../package.json").version;
  const tag = `v${version}`;
  const notesFile = path.join(__dirname, "..", "docs", `release-notes-${tag}.md`);
  const editArgs = ["release", "edit", tag, "--draft=false", "--latest"];
  if (fs.existsSync(notesFile)) {
    editArgs.push("--notes-file", notesFile);
  }
  try {
    run("gh", editArgs);
    console.log(`[release] Published GitHub release ${tag}.`);
  } catch (err) {
    console.warn(`[release] Failed to publish release ${tag} — publish it manually on GitHub.`);
  }

  return [];
};
