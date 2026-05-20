import { describe, expect, it } from "vitest";
import {
  buildClaudeHookCommand,
  buildClaudeStatusLineCommand,
  buildCodeBuddyHookCommand,
  buildCodexHookArgv,
  buildCodexHookCommand,
  buildCursorHookCommand,
  buildCursorLifecycleHookCommand,
  detectLegacyHookCommand,
  normalizeAppPath,
} from "./commandBuilder";

const DEV_EXEC = "/path/to/Electron";
const DEV_APP = "/path/to/repo";
const DEV_HOOK_CLI = `${DEV_APP}/out/main/hook-cli.js`;
const PACKAGED_EXEC = "/Applications/CodePal.app/Contents/MacOS/CodePal";
const PACKAGED_APP = "/Applications/CodePal.app/Contents/Resources/app.asar";
const PACKAGED_HOOK_CLI = `${PACKAGED_APP}/out/main/hook-cli.js`;

describe("commandBuilder", () => {
  describe("buildCursorLifecycleHookCommand", () => {
    it("builds dev-mode command with execPath, appPath, and event name", () => {
      const command = buildCursorLifecycleHookCommand("sessionStart", {
        packaged: false,
        execPath: DEV_EXEC,
        appPath: DEV_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${DEV_EXEC}" "${DEV_HOOK_CLI}" --codepal-hook cursor-lifecycle sessionStart`,
      );
    });

    it("builds packaged command with execPath only", () => {
      const command = buildCursorLifecycleHookCommand("stop", {
        packaged: true,
        execPath: PACKAGED_EXEC,
        appPath: PACKAGED_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${PACKAGED_EXEC}" "${PACKAGED_HOOK_CLI}" --codepal-hook cursor-lifecycle stop`,
      );
    });
  });

  describe("buildCodeBuddyHookCommand", () => {
    it("builds dev-mode codebuddy hook command", () => {
      const command = buildCodeBuddyHookCommand({
        packaged: false,
        execPath: DEV_EXEC,
        appPath: DEV_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${DEV_EXEC}" "${DEV_HOOK_CLI}" --codepal-hook codebuddy`,
      );
    });

    it("builds packaged codebuddy hook command", () => {
      const command = buildCodeBuddyHookCommand({
        packaged: true,
        execPath: PACKAGED_EXEC,
        appPath: PACKAGED_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${PACKAGED_EXEC}" "${PACKAGED_HOOK_CLI}" --codepal-hook codebuddy`,
      );
    });
  });

  describe("buildClaudeHookCommand", () => {
    it("builds dev-mode claude hook command", () => {
      const command = buildClaudeHookCommand({
        packaged: false,
        execPath: DEV_EXEC,
        appPath: DEV_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${DEV_EXEC}" "${DEV_HOOK_CLI}" --codepal-hook claude`,
      );
    });

    it("builds packaged claude hook command", () => {
      const command = buildClaudeHookCommand({
        packaged: true,
        execPath: PACKAGED_EXEC,
        appPath: PACKAGED_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${PACKAGED_EXEC}" "${PACKAGED_HOOK_CLI}" --codepal-hook claude`,
      );
    });
  });

  describe("buildClaudeStatusLineCommand", () => {
    it("builds dev-mode claude statusline command", () => {
      const command = buildClaudeStatusLineCommand({
        packaged: false,
        execPath: DEV_EXEC,
        appPath: DEV_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${DEV_EXEC}" "${DEV_HOOK_CLI}" --codepal-hook claude-statusline`,
      );
    });

    it("builds packaged claude statusline command", () => {
      const command = buildClaudeStatusLineCommand({
        packaged: true,
        execPath: PACKAGED_EXEC,
        appPath: PACKAGED_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${PACKAGED_EXEC}" "${PACKAGED_HOOK_CLI}" --codepal-hook claude-statusline`,
      );
    });
  });

  describe("buildCodexHookCommand", () => {
    it("builds dev-mode codex hook command", () => {
      const command = buildCodexHookCommand({
        packaged: false,
        execPath: DEV_EXEC,
        appPath: DEV_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${DEV_EXEC}" "${DEV_HOOK_CLI}" --codepal-hook codex`,
      );
    });

    it("builds packaged codex hook command", () => {
      const command = buildCodexHookCommand({
        packaged: true,
        execPath: PACKAGED_EXEC,
        appPath: PACKAGED_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${PACKAGED_EXEC}" "${PACKAGED_HOOK_CLI}" --codepal-hook codex`,
      );
    });
  });

  describe("buildCodexHookArgv", () => {
    it("builds dev-mode argv for config.toml notify", () => {
      expect(
        buildCodexHookArgv({
          packaged: false,
          execPath: DEV_EXEC,
          appPath: DEV_APP,
        }),
      ).toEqual([DEV_EXEC, DEV_HOOK_CLI, "--codepal-hook", "codex"]);
    });

    it("builds packaged argv for config.toml notify", () => {
      expect(
        buildCodexHookArgv({
          packaged: true,
          execPath: PACKAGED_EXEC,
          appPath: PACKAGED_APP,
        }),
      ).toEqual([PACKAGED_EXEC, PACKAGED_HOOK_CLI, "--codepal-hook", "codex"]);
    });
  });

  describe("buildCursorHookCommand", () => {
    it("builds dev-mode cursor hook command", () => {
      const command = buildCursorHookCommand({
        packaged: false,
        execPath: DEV_EXEC,
        appPath: DEV_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${DEV_EXEC}" "${DEV_HOOK_CLI}" --codepal-hook cursor`,
      );
    });

    it("builds packaged cursor hook command", () => {
      const command = buildCursorHookCommand({
        packaged: true,
        execPath: PACKAGED_EXEC,
        appPath: PACKAGED_APP,
      });
      expect(command).toBe(
        `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "${PACKAGED_EXEC}" "${PACKAGED_HOOK_CLI}" --codepal-hook cursor`,
      );
    });
  });

  describe("normalizeAppPath", () => {
    it("strips out/main and returns project root when package.json exists", () => {
      // The repo root has package.json, so this should resolve
      const repoRoot = process.cwd();
      const devAppPath = `${repoRoot}/out/main`;
      expect(normalizeAppPath(devAppPath)).toBe(repoRoot);
    });

    it("returns the path unchanged when it already has package.json", () => {
      const repoRoot = process.cwd();
      expect(normalizeAppPath(repoRoot)).toBe(repoRoot);
    });

    it("returns undefined when the resolved path has no package.json", () => {
      expect(normalizeAppPath("/nonexistent/path/out/main")).toBeUndefined();
    });

    it("returns undefined for a random directory without package.json", () => {
      expect(normalizeAppPath("/tmp")).toBeUndefined();
    });
  });

  describe("detectLegacyHookCommand", () => {
    it("detects scripts/hooks shell paths", () => {
      expect(detectLegacyHookCommand('"/my/app/scripts/hooks/cursor-agent-hook.sh" sessionStart')).toBe(
        true,
      );
      expect(detectLegacyHookCommand('"/x/scripts/hooks/codebuddy-hook.sh"')).toBe(true);
    });

    it("detects node scripts/bridge mjs invocations", () => {
      expect(detectLegacyHookCommand("node ./scripts/bridge/foo.mjs")).toBe(true);
      expect(detectLegacyHookCommand('node "/abs/path/scripts/bridge/hook.mjs" arg')).toBe(true);
    });

    it("returns false for self-contained codepal-hook commands", () => {
      expect(detectLegacyHookCommand('"/Electron" "/repo" --codepal-hook cursor-lifecycle sessionStart')).toBe(
        false,
      );
      expect(
        detectLegacyHookCommand(
          '/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "/Electron" "/repo/out/main/hook-cli.js" --codepal-hook cursor',
        ),
      ).toBe(false);
      expect(
        detectLegacyHookCommand(
          '/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 "/CodePal" "/app.asar/out/main/hook-cli.js" --codepal-hook codebuddy',
        ),
      ).toBe(false);
    });
  });
});
