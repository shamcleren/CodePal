import fsSync from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const require = createRequire(import.meta.url);

type SpawnCall = {
  command: string;
  args: string[];
};

const spawnCalls: SpawnCall[] = [];

const originalPlatform = process.platform;
const originalEnv = { ...process.env };
const scriptPath = path.resolve(process.cwd(), "scripts/afterAllArtifactBuild.cjs");
const repackedZipContent = "repacked-updater-zip";
const moduleWithLoad = Module as typeof Module & {
  _load: (request: string, parent: NodeJS.Module | null, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;

function loadAfterAllArtifactBuild(): (buildResult: unknown) => Promise<unknown[]> {
  delete require.cache[scriptPath];
  return require(scriptPath).default;
}

async function runHookWithFakeArtifacts() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-after-artifact-"));
  const appPath = path.join(tempDir, "mac-arm64", "CodePal.app");
  const releaseVersion = require(path.resolve(process.cwd(), "package.json")).version;
  const dmgPath = path.join(tempDir, `CodePal-${releaseVersion}-arm64.dmg`);
  const zipPath = path.join(tempDir, `CodePal-${releaseVersion}-arm64.zip`);
  const latestMacPath = path.join(tempDir, "latest-mac.yml");

  await fs.mkdir(appPath, { recursive: true });
  await fs.writeFile(dmgPath, "");
  await fs.writeFile(`${dmgPath}.blockmap`, "");
  await fs.writeFile(zipPath, "");
  await fs.writeFile(
    latestMacPath,
    YAML.stringify({
      version: releaseVersion,
      files: [
        { url: path.basename(zipPath), sha512: "old-zip", size: 1 },
        { url: path.basename(dmgPath), sha512: "old-dmg", size: 1 },
      ],
      path: path.basename(zipPath),
      sha512: "old-zip",
      releaseDate: "2026-05-19T00:00:00.000Z",
    }),
  );

  try {
    const afterAllArtifactBuild = loadAfterAllArtifactBuild();

    await afterAllArtifactBuild({
      artifactPaths: [zipPath, dmgPath],
      outDir: tempDir,
      configuration: { buildVersion: releaseVersion },
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

beforeEach(() => {
  spawnCalls.length = 0;
  vi.stubGlobal("process", process);
  Object.defineProperty(process, "platform", {
    value: "darwin",
  });
  process.env = {
    ...originalEnv,
    APPLE_ID: "apple@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "app-specific-password",
    APPLE_TEAM_ID: "TEAMID1234",
  };
  delete process.env.CODEPAL_SKIP_RELEASE_FINISH;
  delete process.env.CODEPAL_PUBLISH_RELEASE;
  delete process.env.GH_TOKEN;
  moduleWithLoad._load = (request, parent, isMain) => {
    if (request === "child_process") {
      return {
        spawnSync: (command: string, args: string[]) => {
          spawnCalls.push({ command, args });
          if (command === "ditto") {
            if (args[0] === "-c") {
              const zipPath = args.at(-1);
              if (zipPath) {
                fsSync.writeFileSync(zipPath, repackedZipContent);
              }
            } else {
              const extractDir = args.at(-1);
              if (extractDir) {
                fsSync.mkdirSync(path.join(extractDir, "CodePal.app", "Contents", "_CodeSignature"), {
                  recursive: true,
                });
              }
            }
          }
          if (command === "hdiutil" && args[0] === "attach") {
            const mountPoint = args[args.indexOf("-mountpoint") + 1];
            fsSync.mkdirSync(path.join(mountPoint, "CodePal.app", "Contents", "_CodeSignature"), {
              recursive: true,
            });
          }
          if (command.endsWith("app-builder_arm64") || command.endsWith("app-builder_x64")) {
            const outputArg = args.find((arg) => arg.startsWith("--output="));
            if (outputArg) {
              fsSync.writeFileSync(outputArg.slice("--output=".length), "");
            }
          }
          return { status: 0 };
        },
      };
    }

    return originalLoad(request, parent, isMain);
  };
});

afterEach(() => {
  moduleWithLoad._load = originalLoad;
  Object.defineProperty(process, "platform", {
    value: originalPlatform,
  });
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

test("electron-builder does not app-level notarize because stapling the app bundle breaks code signatures", async () => {
  const config = YAML.parse(await fs.readFile(path.resolve(process.cwd(), "electron-builder.yml"), "utf8"));

  expect(config.mac.notarize).toBe(false);
});

test("does not publish to GitHub from the build hook unless release publishing is explicitly enabled", async () => {
  await runHookWithFakeArtifacts();

  expect(spawnCalls.map((call) => call.command)).not.toContain("gh");
});

test("redacts notary credentials in release logs while passing them to notarytool", async () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  let releaseLog = "";

  try {
    await runHookWithFakeArtifacts();
    releaseLog = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
  } finally {
    logSpy.mockRestore();
  }

  expect(releaseLog).toContain("--password <redacted>");
  expect(releaseLog).not.toContain("app-specific-password");
  expect(spawnCalls).toEqual(
    expect.arrayContaining([
      {
        command: "xcrun",
        args: expect.arrayContaining(["--password", "app-specific-password"]),
      },
    ]),
  );
});

test("rebuilds updater zip before notarization, blockmap, and latest-mac metadata", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-after-artifact-repack-"));
  const appPath = path.join(tempDir, "mac-arm64", "CodePal.app");
  const releaseVersion = require(path.resolve(process.cwd(), "package.json")).version;
  const dmgPath = path.join(tempDir, `CodePal-${releaseVersion}-arm64.dmg`);
  const zipPath = path.join(tempDir, `CodePal-${releaseVersion}-arm64.zip`);
  const latestMacPath = path.join(tempDir, "latest-mac.yml");

  await fs.mkdir(appPath, { recursive: true });
  await fs.writeFile(dmgPath, "current-dmg");
  await fs.writeFile(zipPath, "builder-zip");
  await fs.writeFile(
    latestMacPath,
    YAML.stringify({
      version: releaseVersion,
      files: [
        { url: path.basename(zipPath), sha512: "old-zip", size: 1 },
        { url: path.basename(dmgPath), sha512: "old-dmg", size: 1 },
      ],
      path: path.basename(zipPath),
      sha512: "old-zip",
      releaseDate: "2026-05-19T00:00:00.000Z",
    }),
  );

  try {
    const afterAllArtifactBuild = loadAfterAllArtifactBuild();
    await afterAllArtifactBuild({
      artifactPaths: [zipPath, dmgPath],
      outDir: tempDir,
      configuration: { buildVersion: releaseVersion },
    });

    const repackIndex = spawnCalls.findIndex(
      (call) =>
        call.command === "ditto" &&
        call.args[0] === "-c" &&
        call.args.includes("--keepParent") &&
        call.args.includes(appPath),
    );
    const zipNotaryIndex = spawnCalls.findIndex(
      (call) =>
        call.command === "xcrun" &&
        call.args[0] === "notarytool" &&
        call.args[1] === "submit" &&
        call.args[2] === zipPath,
    );
    const zipBlockmapIndex = spawnCalls.findIndex(
      (call) =>
        (call.command.endsWith("app-builder_arm64") || call.command.endsWith("app-builder_x64")) &&
        call.args.includes(`--input=${zipPath}`),
    );

    expect(repackIndex).toBeGreaterThanOrEqual(0);
    expect(zipNotaryIndex).toBeGreaterThan(repackIndex);
    expect(zipBlockmapIndex).toBeGreaterThan(repackIndex);
    await expect(fs.readFile(zipPath, "utf8")).resolves.toBe(repackedZipContent);

    const latestMac = YAML.parse(await fs.readFile(latestMacPath, "utf8"));
    expect(latestMac.files).toContainEqual(
      expect.objectContaining({ url: path.basename(zipPath), size: repackedZipContent.length }),
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("regenerates stale latest-mac metadata for the current version artifacts", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-after-artifact-stale-"));
  const appPath = path.join(tempDir, "mac-arm64", "CodePal.app");
  const releaseVersion = require(path.resolve(process.cwd(), "package.json")).version;
  const dmgPath = path.join(tempDir, `CodePal-${releaseVersion}-arm64.dmg`);
  const zipPath = path.join(tempDir, `CodePal-${releaseVersion}-arm64.zip`);
  const latestMacPath = path.join(tempDir, "latest-mac.yml");

  await fs.mkdir(appPath, { recursive: true });
  await fs.writeFile(dmgPath, "current-dmg");
  await fs.writeFile(zipPath, "current-zip");
  await fs.writeFile(
    latestMacPath,
    YAML.stringify({
      version: "1.1.7",
      files: [
        { url: "CodePal-1.1.7-arm64.zip", sha512: "old-zip", size: 1 },
        { url: "CodePal-1.1.7-arm64.dmg", sha512: "old-dmg", size: 1 },
      ],
      path: "CodePal-1.1.7-arm64.zip",
      sha512: "old-zip",
      releaseDate: "2026-05-19T00:00:00.000Z",
    }),
  );

  try {
    const afterAllArtifactBuild = loadAfterAllArtifactBuild();
    await afterAllArtifactBuild({
      artifactPaths: [zipPath, dmgPath],
      outDir: tempDir,
      configuration: { buildVersion: releaseVersion },
    });

    const latestMac = YAML.parse(await fs.readFile(latestMacPath, "utf8"));
    expect(latestMac.version).toBe(releaseVersion);
    expect(latestMac.path).toBe(path.basename(zipPath));
    expect(latestMac.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: path.basename(zipPath), size: repackedZipContent.length }),
        expect.objectContaining({ url: path.basename(dmgPath), size: "current-dmg".length }),
      ]),
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("notarizes zip and dmg, staples only dmg, and publishes refreshed updater metadata", async () => {
  process.env.CODEPAL_PUBLISH_RELEASE = "1";

  await runHookWithFakeArtifacts();

  const releaseVersion = require(path.resolve(process.cwd(), "package.json")).version;
  const appPath = expect.stringContaining(path.join("mac-arm64", "CodePal.app"));
  const dmgPath = expect.stringContaining(`CodePal-${releaseVersion}-arm64.dmg`);
  const zipPath = expect.stringContaining(`CodePal-${releaseVersion}-arm64.zip`);
  const latestMacPath = path.resolve(
    process.cwd(),
    "docs",
    "release",
    "notes",
    `release-notes-v${releaseVersion}.md`,
  );
  const xcrunCalls = spawnCalls.filter((call) => call.command === "xcrun").map((call) => call.args);
  expect(xcrunCalls).toEqual(
    expect.arrayContaining([
      ["notarytool", "submit", zipPath, "--apple-id", "apple@example.com", "--password", "app-specific-password", "--team-id", "TEAMID1234", "--wait"],
      ["notarytool", "submit", dmgPath, "--apple-id", "apple@example.com", "--password", "app-specific-password", "--team-id", "TEAMID1234", "--wait"],
      ["stapler", "staple", dmgPath],
      ["stapler", "validate", "-v", dmgPath],
    ]),
  );
  expect(xcrunCalls).not.toContainEqual(["stapler", "staple", appPath]);

  const codeSignCalls = spawnCalls.filter((call) => call.command === "codesign").map((call) => call.args);
  expect(codeSignCalls).toEqual([
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    ["--verify", "--deep", "--strict", "--verbose=2", expect.stringContaining("CodePal.app")],
    ["--verify", "--deep", "--strict", "--verbose=2", expect.stringContaining("CodePal.app")],
  ]);
  expect(spawnCalls).toEqual(
    expect.arrayContaining([
      { command: "ditto", args: ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, expect.stringContaining(`CodePal-${releaseVersion}-arm64.zip.tmp-`)] },
      { command: "ditto", args: ["-x", "-k", zipPath, expect.stringContaining("codepal-zip-verify-")] },
      {
        command: "hdiutil",
        args: ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", expect.stringContaining("codepal-dmg-verify-")],
      },
      { command: "hdiutil", args: ["detach", expect.stringContaining("codepal-dmg-verify-")] },
      { command: "spctl", args: ["--assess", "--type", "execute", "--verbose=4", expect.stringContaining("CodePal.app")] },
    ]),
  );

  const blockmapCalls = spawnCalls
    .filter((call) => call.command.endsWith("app-builder_arm64") || call.command.endsWith("app-builder_x64"))
    .map((call) => call.args);
  expect(blockmapCalls).toEqual(
    expect.arrayContaining([
      [
        "blockmap",
        expect.stringContaining(`CodePal-${releaseVersion}-arm64.zip`),
        expect.stringContaining(`CodePal-${releaseVersion}-arm64.zip.blockmap`),
      ],
      [
        "blockmap",
        expect.stringContaining(`CodePal-${releaseVersion}-arm64.dmg`),
        expect.stringContaining(`CodePal-${releaseVersion}-arm64.dmg.blockmap`),
      ],
    ]),
  );

  const ghCalls = spawnCalls.filter((call) => call.command === "gh").map((call) => call.args);
  expect(ghCalls).toEqual(
    expect.arrayContaining([
      ["release", "upload", `v${releaseVersion}`, zipPath, "--clobber"],
      ["release", "upload", `v${releaseVersion}`, dmgPath, "--clobber"],
      [
        "release",
        "upload",
        `v${releaseVersion}`,
        expect.stringContaining(`CodePal-${releaseVersion}-arm64.zip.blockmap`),
        expect.stringContaining(`CodePal-${releaseVersion}-arm64.dmg.blockmap`),
        expect.stringContaining("latest-mac.yml"),
        "--clobber",
      ],
      [
        "release",
        "edit",
        `v${releaseVersion}`,
        "--draft=false",
        "--latest",
        "--notes-file",
        latestMacPath,
      ],
    ]),
  );
});

test("publishes without GitHub release notes when the version notes file is absent", async () => {
  process.env.CODEPAL_PUBLISH_RELEASE = "1";
  const releaseVersion = "9.9.9";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codepal-after-artifact-"));
  const appPath = path.join(tempDir, "mac-arm64", "CodePal.app");
  const dmgPath = path.join(tempDir, `CodePal-${releaseVersion}-arm64.dmg`);
  const zipPath = path.join(tempDir, `CodePal-${releaseVersion}-arm64.zip`);

  await fs.mkdir(appPath, { recursive: true });
  await fs.writeFile(dmgPath, "");
  await fs.writeFile(zipPath, "");

  try {
    const afterAllArtifactBuild = loadAfterAllArtifactBuild();
    await afterAllArtifactBuild({
      artifactPaths: [zipPath, dmgPath],
      outDir: tempDir,
      configuration: { buildVersion: releaseVersion },
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  const ghCalls = spawnCalls.filter((call) => call.command === "gh").map((call) => call.args);
  expect(ghCalls).toContainEqual(["release", "edit", `v${releaseVersion}`, "--draft=false", "--latest"]);
});
