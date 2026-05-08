import fs from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
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
  const dmgPath = path.join(tempDir, "CodePal-1.1.5-arm64.dmg");

  await fs.mkdir(appPath, { recursive: true });
  await fs.writeFile(dmgPath, "");

  try {
    const afterAllArtifactBuild = loadAfterAllArtifactBuild();

    await afterAllArtifactBuild({
      artifactPaths: [dmgPath],
      outDir: tempDir,
      configuration: { buildVersion: "1.1.5" },
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

test("does not publish to GitHub from the build hook unless release publishing is explicitly enabled", async () => {
  await runHookWithFakeArtifacts();

  expect(spawnCalls.map((call) => call.command)).not.toContain("gh");
});

test("publishes to GitHub when release publishing is explicitly enabled", async () => {
  process.env.CODEPAL_PUBLISH_RELEASE = "1";

  await runHookWithFakeArtifacts();

  const ghCalls = spawnCalls.filter((call) => call.command === "gh").map((call) => call.args);
  expect(ghCalls).toEqual([
    ["release", "upload", "v1.1.5", expect.stringContaining("CodePal-1.1.5-arm64.dmg"), "--clobber"],
    [
      "release",
      "edit",
      "v1.1.5",
      "--draft=false",
      "--latest",
      "--notes-file",
      path.resolve(process.cwd(), "docs/release-notes-v1.1.5.md"),
    ],
  ]);
});
