const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { spawnSync } = require("child_process");
const YAML = require("yaml");

function run(command, args) {
  const rendered = [command, ...args].join(" ");
  console.log(`[release-verify] ${rendered}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${rendered}`);
  }
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    output: `${result.stdout || ""}${result.stderr || ""}`,
    status: result.status,
  };
}

function sha512Base64(filePath) {
  return crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");
}

function findTopLevelApp(dir) {
  const appEntry = fs
    .readdirSync(dir, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  return appEntry ? path.join(dir, appEntry.name) : null;
}

function verifyAppGatekeeper(appPath) {
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  verifyDeveloperIdAuthority(appPath);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
}

function verifyDeveloperIdAuthority(appPath) {
  const display = runCapture("codesign", ["--display", "--verbose=4", appPath]);
  if (display.status !== 0) {
    throw new Error(`Unable to inspect code signature for ${appPath}:\n${display.output}`);
  }
  if (!display.output.includes("Authority=Developer ID Application:")) {
    throw new Error(`${appPath} is not signed with an embedded Developer ID Application authority.`);
  }
  if (display.output.includes("Authority=(unavailable)")) {
    throw new Error(`${appPath} has no portable embedded signing authority.`);
  }

  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-release-certs-"));
  try {
    const certs = runCapture("codesign", ["--display", "--extract-certificates", appPath], {
      cwd: certDir,
    });
    if (certs.status !== 0) {
      throw new Error(`Unable to extract code signing certificates for ${appPath}:\n${certs.output}`);
    }
    const extractedCertificates = fs.readdirSync(certDir).filter((fileName) => fileName.startsWith("codesign"));
    if (extractedCertificates.length === 0) {
      throw new Error(`${appPath} code signature does not embed any signing certificates.`);
    }
  } finally {
    fs.rmSync(certDir, { recursive: true, force: true });
  }
}

function verifyZipApp(zipPath) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-release-zip-"));
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
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-release-dmg-"));
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

function listReleaseFiles(releaseDir, extension) {
  return fs
    .readdirSync(releaseDir)
    .filter((fileName) => fileName.endsWith(extension))
    .map((fileName) => path.join(releaseDir, fileName));
}

function validateLatestMacYml(releaseDir, artifactPaths) {
  const latestMacPath = path.join(releaseDir, "latest-mac.yml");
  if (!fs.existsSync(latestMacPath)) {
    throw new Error(`Missing ${latestMacPath}.`);
  }

  const updateInfo = YAML.parse(fs.readFileSync(latestMacPath, "utf8"));
  if (!updateInfo || !Array.isArray(updateInfo.files)) {
    throw new Error(`${latestMacPath} is missing a files array.`);
  }

  for (const artifactPath of artifactPaths) {
    const fileName = path.basename(artifactPath);
    const fileInfo = updateInfo.files.find((candidate) => candidate.url === fileName);
    if (!fileInfo) {
      throw new Error(`${latestMacPath} is missing updater metadata for ${fileName}.`);
    }
    if (fileInfo.size !== fs.statSync(artifactPath).size) {
      throw new Error(`${latestMacPath} size does not match ${fileName}.`);
    }
    if (fileInfo.sha512 !== sha512Base64(artifactPath)) {
      throw new Error(`${latestMacPath} sha512 does not match ${fileName}.`);
    }
    if (!fs.existsSync(`${artifactPath}.blockmap`)) {
      throw new Error(`Missing blockmap for ${artifactPath}.`);
    }
  }
}

function main() {
  const releaseDir = path.resolve(process.argv[2] || "release");
  const zipPaths = listReleaseFiles(releaseDir, ".zip");
  const dmgPaths = listReleaseFiles(releaseDir, ".dmg");
  const artifactPaths = [...zipPaths, ...dmgPaths];

  if (zipPaths.length === 0) {
    throw new Error(`Missing .zip artifact under ${releaseDir}.`);
  }
  if (dmgPaths.length === 0) {
    throw new Error(`Missing .dmg artifact under ${releaseDir}.`);
  }

  validateLatestMacYml(releaseDir, artifactPaths);

  for (const zipPath of zipPaths) {
    verifyZipApp(zipPath);
  }
  for (const dmgPath of dmgPaths) {
    verifyDmgApp(dmgPath);
  }

  console.log("[release-verify] macOS release assets passed final validation.");
}

main();
