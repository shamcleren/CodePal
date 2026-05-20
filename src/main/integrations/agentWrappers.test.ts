import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  codePalWrapperPaths,
  ensureAgentWrapperFiles,
  wrapperScriptPath,
} from "./agentWrappers";

describe("agentWrappers", () => {
  it("runs hook wrappers through the standalone Node-mode hook CLI", () => {
    const root = mkdtempSync(join(tmpdir(), "codepal-wrappers-"));
    const homeDir = join(root, "home");
    const execPath = "/Applications/CodePal.app/Contents/MacOS/CodePal";
    const appPath = "/Applications/CodePal.app/Contents/Resources/app.asar";

    ensureAgentWrapperFiles(homeDir, {
      packaged: true,
      execPath,
      appPath,
    });

    const runtimeEnv = readFileSync(codePalWrapperPaths(homeDir).runtimeEnvPath, "utf8");
    const claudeWrapper = readFileSync(wrapperScriptPath(homeDir, "claude"), "utf8");

    expect(runtimeEnv).toContain(
      "CODEPAL_HOOK_CLI_PATH='/Applications/CodePal.app/Contents/Resources/app.asar/out/main/hook-cli.js'",
    );
    expect(claudeWrapper).toContain("ELECTRON_RUN_AS_NODE=1");
    expect(claudeWrapper).toContain('"$CODEPAL_EXEC_PATH" "$CODEPAL_HOOK_CLI_PATH" --codepal-hook claude');
    expect(claudeWrapper).not.toContain("-u ELECTRON_RUN_AS_NODE");
  });
});
