const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { spawnSync } = require("child_process");
const { appBuilderPath } = require("app-builder-bin");
const YAML = require("yaml");

function run(command, args) {
  const rendered = [command, ...redactArgs(args)].join(" ");
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

function redactArgs(args) {
  const secretValueFlags = new Set(["--password", "--key"]);
  return args.map((arg, index) =>
    index > 0 && secretValueFlags.has(args[index - 1]) ? "<redacted>" : arg
  );
}

function sha512Base64(filePath) {
  return crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");
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

function findTopLevelApp(dir) {
  const appEntry = fs
    .readdirSync(dir, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  return appEntry ? path.join(dir, appEntry.name) : null;
}

function assertNoTopLevelCodeResources(appPath) {
  const invalidTicketPath = path.join(appPath, "Contents", "CodeResources");
  if (fs.existsSync(invalidTicketPath)) {
    throw new Error(
      `Invalid app bundle: ${invalidTicketPath} exists. This usually means stapler wrote a ticket where codesign expects bundle resources, causing Gatekeeper to reject the app.`
    );
  }
}

function verifyAppCodeSignature(appPath) {
  assertNoTopLevelCodeResources(appPath);
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
}

function verifyAppGatekeeper(appPath) {
  verifyAppCodeSignature(appPath);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
}

function verifyZipApp(zipPath) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-zip-verify-"));
  try {
    run("ditto", ["-x", "-k", zipPath, extractDir]);
    const appPath = findTopLevelApp(extractDir);
    if (!appPath) {
      throw new Error(`No .app bundle found after extracting ${zipPath}.`);
    }
    verifyAppGatekeeper(appPath);
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

function verifyDmgApp(dmgPath) {
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-dmg-verify-"));
  let attached = false;
  try {
    run("hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountPoint]);
    attached = true;
    const appPath = findTopLevelApp(mountPoint);
    if (!appPath) {
      throw new Error(`No .app bundle found after mounting ${dmgPath}.`);
    }
    verifyAppGatekeeper(appPath);
  } finally {
    if (attached) {
      run("hdiutil", ["detach", mountPoint]);
    }
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
}

function refreshBlockmap(artifactPath) {
  run(appBuilderPath, [
    "blockmap",
    `--input=${artifactPath}`,
    `--output=${artifactPath}.blockmap`,
  ]);
}

function buildLatestMacYml(version, artifactPaths) {
  const publishArtifacts = artifactPaths.filter(
    (artifactPath) => artifactPath.endsWith(".zip") || artifactPath.endsWith(".dmg")
  );
  const primaryArtifact = publishArtifacts.find((artifactPath) => artifactPath.endsWith(".zip")) || publishArtifacts[0];
  if (!primaryArtifact) {
    return null;
  }

  return {
    version,
    files: publishArtifacts.map((artifactPath) => ({
      url: path.basename(artifactPath),
      sha512: sha512Base64(artifactPath),
      size: fs.statSync(artifactPath).size,
    })),
    path: path.basename(primaryArtifact),
    sha512: sha512Base64(primaryArtifact),
    releaseDate: new Date().toISOString(),
  };
}

function refreshLatestMacYml(outDir, artifactPaths, version) {
  const latestMacPath = path.join(outDir, "latest-mac.yml");
  const generated = buildLatestMacYml(version, artifactPaths);
  if (!generated) {
    return null;
  }

  let updateInfo = fs.existsSync(latestMacPath)
    ? YAML.parse(fs.readFileSync(latestMacPath, "utf8"))
    : null;
  const artifactNames = generated.files.map((fileInfo) => fileInfo.url);
  const hasCurrentArtifactSet =
    updateInfo &&
    Array.isArray(updateInfo.files) &&
    updateInfo.version === version &&
    artifactNames.every((fileName) =>
      updateInfo.files.some((fileInfo) => fileInfo.url === fileName)
    );

  if (!hasCurrentArtifactSet) {
    fs.writeFileSync(latestMacPath, YAML.stringify(generated));
    return latestMacPath;
  }

  const artifactsByName = new Map(
    artifactPaths.map((artifactPath) => [path.basename(artifactPath), artifactPath])
  );
  for (const fileInfo of updateInfo.files) {
    const artifactPath = artifactsByName.get(fileInfo.url);
    if (!artifactPath) {
      continue;
    }
    fileInfo.sha512 = sha512Base64(artifactPath);
    fileInfo.size = fs.statSync(artifactPath).size;
  }

  const primaryArtifactPath = artifactsByName.get(updateInfo.path);
  if (primaryArtifactPath) {
    updateInfo.sha512 = sha512Base64(primaryArtifactPath);
  }

  fs.writeFileSync(latestMacPath, YAML.stringify(updateInfo));
  return latestMacPath;
}

function validateLatestMacYml(latestMacPath, artifactPaths) {
  if (!latestMacPath) {
    return;
  }

  const updateInfo = YAML.parse(fs.readFileSync(latestMacPath, "utf8"));
  if (!updateInfo || !Array.isArray(updateInfo.files)) {
    throw new Error(`${latestMacPath} is missing a files array.`);
  }

  for (const artifactPath of artifactPaths) {
    if (!artifactPath.endsWith(".zip") && !artifactPath.endsWith(".dmg")) {
      continue;
    }
    const fileName = path.basename(artifactPath);
    const fileInfo = updateInfo.files.find((candidate) => candidate.url === fileName);
    if (!fileInfo) {
      throw new Error(`${latestMacPath} is missing updater metadata for ${fileName}.`);
    }
    const actualSize = fs.statSync(artifactPath).size;
    const actualSha512 = sha512Base64(artifactPath);
    if (fileInfo.size !== actualSize || fileInfo.sha512 !== actualSha512) {
      throw new Error(`${latestMacPath} metadata does not match ${fileName}.`);
    }
  }
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
  const version = buildResult.configuration.buildVersion || require("../package.json").version;
  const dmgPaths = artifactPaths.filter((artifactPath) => artifactPath.endsWith(".dmg"));
  const zipPaths = artifactPaths.filter((artifactPath) => artifactPath.endsWith(".zip"));
  const appPath = findFirstApp(buildResult.outDir);

  if (!appPath || !fs.existsSync(appPath)) {
    throw new Error(`Signed app bundle not found under ${buildResult.outDir}.`);
  }

  verifyAppCodeSignature(appPath);

  for (const artifactPath of [...zipPaths, ...dmgPaths]) {
    run("xcrun", ["notarytool", "submit", artifactPath, ...getNotaryAuthArgs(), "--wait"]);
  }

  // Staple only the DMG. On this Electron bundle, app-level stapling writes a
  // top-level Contents/CodeResources ticket that makes codesign read the wrong
  // resource seal and reject the app as modified.
  for (const dmgPath of dmgPaths) {
    run("xcrun", ["stapler", "staple", dmgPath]);
    run("xcrun", ["stapler", "validate", "-v", dmgPath]);
  }
  verifyAppCodeSignature(appPath);

  for (const dmgPath of dmgPaths) {
    refreshBlockmap(dmgPath);
  }
  const latestMacPath = refreshLatestMacYml(buildResult.outDir, artifactPaths, version);
  validateLatestMacYml(latestMacPath, artifactPaths);

  for (const zipPath of zipPaths) {
    verifyZipApp(zipPath);
  }
  for (const dmgPath of dmgPaths) {
    verifyDmgApp(dmgPath);
  }

  console.log("[release] macOS release validation finished.");

  if (process.env.CODEPAL_PUBLISH_RELEASE !== "1") {
    console.log(
      "[release] Skipping GitHub release publishing because CODEPAL_PUBLISH_RELEASE is not 1."
    );
    return [];
  }

  // electron-builder uploads artifacts to the draft release BEFORE this hook
  // runs. Re-upload the stapled dmg plus refreshed metadata so GitHub matches
  // what we just verified locally.
  const tagForUpload = `v${version}`;
  for (const dmgPath of dmgPaths) {
    run("gh", ["release", "upload", tagForUpload, dmgPath, "--clobber"]);
  }
  const refreshedArtifacts = [
    ...dmgPaths.map((dmgPath) => `${dmgPath}.blockmap`).filter((blockmapPath) => fs.existsSync(blockmapPath)),
    ...(latestMacPath ? [latestMacPath] : []),
  ];
  if (refreshedArtifacts.length > 0) {
    run("gh", ["release", "upload", tagForUpload, ...refreshedArtifacts, "--clobber"]);
  }

  // electron-builder creates a draft release by default.
  // Publish it so the auto-updater can detect the new version.
  // Notes: `gh release edit` does NOT accept `--generate-notes` (that flag
  // only exists on `gh release create`). Prefer the project's release-notes
  // markdown when present; otherwise publish without notes and let the
  // author edit the release on GitHub.
  const tag = `v${version}`;
  const notesFile = path.join(__dirname, "..", "docs", "release", "notes", `release-notes-${tag}.md`);
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
