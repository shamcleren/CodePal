import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveProjectAttribution } from "./projectAttribution";

describe("resolveProjectAttribution", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("uses the git root for nested workspace paths", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-project-"));
    const repo = path.join(tmpDir, "CodePal");
    const nested = path.join(repo, "src", "renderer");
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
    fs.mkdirSync(nested, { recursive: true });

    expect(resolveProjectAttribution({ workspacePath: nested })).toEqual({
      projectPath: repo,
      projectName: "CodePal",
    });
  });

  it("falls back from workspace path to cwd and then unknown", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-project-"));
    const cwd = path.join(tmpDir, "standalone");
    fs.mkdirSync(cwd, { recursive: true });

    expect(resolveProjectAttribution({ cwd })).toEqual({
      projectPath: cwd,
      projectName: "standalone",
    });
    expect(resolveProjectAttribution({})).toBeNull();
  });
});
