import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIntegrationService } from "./integrationService";

function writeExecutable(pathname: string, body = "#!/usr/bin/env bash\nexit 0\n") {
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, body, { mode: 0o755 });
}

function createFixtureLayout() {
  const root = mkdtempSync(join(tmpdir(), "codepal-integrations-"));
  const homeDir = join(root, "home");
  const appRoot = join(root, "app");
  const hookScriptsRoot = join(appRoot, "scripts", "hooks");
  writeExecutable(join(hookScriptsRoot, "cursor-agent-hook.sh"));
  writeExecutable(join(hookScriptsRoot, "codebuddy-hook.sh"));
  const execPath = join(root, "Electron.bin");
  const appPath = appRoot;
  return { root, homeDir, hookScriptsRoot, execPath, appPath };
}

describe("createIntegrationService", () => {
  afterEach(() => {
    // temp dirs are unique per test run
  });

  it("reports listener diagnostics and unconfigured agents by default", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    service.setListenerDiagnostics({
      mode: "tcp",
      host: "127.0.0.1",
      port: 17371,
    });

    const diagnostics = service.getDiagnostics();

    expect(diagnostics.listener).toEqual({
      mode: "tcp",
      host: "127.0.0.1",
      port: 17371,
    });
    expect(diagnostics.runtime.packaged).toBe(false);
    expect(diagnostics.runtime.executablePath).toBe(execPath);
    expect(diagnostics.runtime.executableLabel).toBe("CodePal 开发构建");
    expect(diagnostics.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claude",
          configExists: false,
          hookInstalled: false,
          health: "not_configured",
          healthLabel: "未配置",
        }),
        expect.objectContaining({
          id: "cursor",
          configExists: false,
          hookInstalled: false,
          health: "not_configured",
          healthLabel: "未配置",
        }),
        expect.objectContaining({
          id: "codex",
          configExists: false,
          hookInstalled: false,
          health: "not_configured",
          healthLabel: "未配置",
          supported: false,
        }),
        expect.objectContaining({
          id: "codebuddy",
          configExists: false,
          hookInstalled: false,
          health: "not_configured",
          healthLabel: "未配置",
        }),
      ]),
    );
  });

  it("installs cursor user hooks idempotently", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
      now: () => 42,
    });

    const first = service.installHooks("cursor");
    const second = service.installHooks("cursor");

    const configPath = join(homeDir, ".cursor", "hooks.json");
    const text = readFileSync(configPath, "utf8");

    expect(first.changed).toBe(true);
    expect(first.hookInstalled).toBe(true);
    expect(second.changed).toBe(false);
    const parsed = JSON.parse(text) as {
      version: number;
      hooks: Record<string, Array<{ command: string }>>;
    };

    expect(parsed).toMatchObject({
      version: 1,
    });
    for (const eventName of [
      "sessionStart",
      "stop",
      "beforeSubmitPrompt",
      "afterAgentResponse",
      "afterAgentThought",
      "beforeReadFile",
      "afterFileEdit",
      "beforeMCPExecution",
      "afterMCPExecution",
      "beforeShellExecution",
      "afterShellExecution",
    ]) {
      expect(parsed.hooks[eventName]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook cursor`,
          }),
        ]),
      );
    }
  });

  it("installs codebuddy hooks without clobbering existing settings", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".codebuddy", "settings.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          theme: "dark",
          hooks: {
            SessionStart: [
              {
                hooks: [{ type: "command", command: "echo existing" }],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
      now: () => 99,
    });

    const result = service.installHooks("codebuddy");
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));

    expect(result.changed).toBe(true);
    expect(parsed.theme).toBe("dark");
    expect(parsed.hooks.SessionStart).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hooks: expect.arrayContaining([expect.objectContaining({ command: "echo existing" })]),
        }),
        expect.objectContaining({
          hooks: expect.arrayContaining([
            expect.objectContaining({
              command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook codebuddy`,
            }),
          ]),
        }),
      ]),
    );
    expect(parsed.hooks.Notification).toHaveLength(2);
  });

  it("installs claude hooks without clobbering existing settings", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".claude", "settings.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          theme: "dark",
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [{ type: "command", command: "echo existing" }],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
      now: () => 66,
    });

    const result = service.installHooks("claude");
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));

    expect(result.changed).toBe(true);
    expect(parsed.theme).toBe("dark");
    expect(parsed.hooks.UserPromptSubmit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hooks: expect.arrayContaining([expect.objectContaining({ command: "echo existing" })]),
        }),
        expect.objectContaining({
          hooks: expect.arrayContaining([
            expect.objectContaining({
              command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook claude`,
            }),
          ]),
        }),
      ]),
    );
    expect(parsed.hooks.SessionStart).toHaveLength(1);
    expect(parsed.hooks.Stop).toHaveLength(1);
    expect(parsed.statusLine).toEqual({
      type: "command",
      command:
        `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook claude-statusline`,
    });
  });

  it("records the latest event status per agent", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: true,
      execPath,
      appPath,
    });

    service.recordEvent("codebuddy", "waiting", 1234);
    service.recordEvent("claude", "running", 1000);
    service.recordEvent("codex", "running", 5678);

    const diagnostics = service.getDiagnostics();
    expect(diagnostics.runtime.packaged).toBe(true);
    expect(diagnostics.runtime.executableLabel).toContain("CodePal 已打包构建");
    const codebuddy = diagnostics.agents.find((agent) => agent.id === "codebuddy");
    expect(codebuddy).toMatchObject({
      lastEventAt: 1234,
      lastEventStatus: "waiting",
    });
    const claude = diagnostics.agents.find((agent) => agent.id === "claude");
    expect(claude).toMatchObject({
      lastEventAt: 1000,
      lastEventStatus: "running",
    });
    const codex = diagnostics.agents.find((agent) => agent.id === "codex");
    expect(codex).toMatchObject({
      lastEventAt: 5678,
      lastEventStatus: "running",
    });
  });

  it("reports active Claude diagnostics when hooks are configured", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".claude", "settings.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                matcher: "*",
                hooks: [
                  {
                    type: "command",
                    command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook claude`,
                  },
                ],
              },
            ],
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook claude`,
                  },
                ],
              },
            ],
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook claude`,
                  },
                ],
              },
            ],
            Notification: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook claude`,
                  },
                ],
              },
            ],
            SessionEnd: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook claude`,
                  },
                ],
              },
            ],
          },
          statusLine: {
            type: "command",
            command: `/usr/bin/env -u ELECTRON_RUN_AS_NODE "${execPath}" "${appPath}" --codepal-hook claude-statusline`,
          },
        },
        null,
        2,
      ),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const claude = service.getDiagnostics().agents.find((agent) => agent.id === "claude");
    expect(claude).toMatchObject({
      id: "claude",
      supported: true,
      health: "active",
      healthLabel: "正常",
      actionLabel: "修复",
      hookInstalled: true,
      statusMessage: "已配置用户级 Claude hooks 与 statusLine",
      configPath,
    });
  });

  it("chains an existing Claude statusLine command instead of clobbering it", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".claude", "settings.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: "/Users/demo/.vibe-island/bin/vibe-island-statusline",
          },
        },
        null,
        2,
      ),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
      now: () => 77,
    });

    const result = service.installHooks("claude");
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));

    expect(result.changed).toBe(true);
    expect(parsed.statusLine.type).toBe("command");
    expect(parsed.statusLine.command).toContain("--codepal-hook claude-statusline");
    expect(parsed.statusLine.command).toContain("/Users/demo/.vibe-island/bin/vibe-island-statusline");
  });

  it("reports Codex as active when session logs exist", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const codexSessionsRoot = join(homeDir, ".codex", "sessions");
    mkdirSync(codexSessionsRoot, { recursive: true });

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const codex = service.getDiagnostics().agents.find((agent) => agent.id === "codex");
    expect(codex).toMatchObject({
      id: "codex",
      supported: false,
      health: "active",
      healthLabel: "正常",
      actionLabel: "",
      hookInstalled: false,
      statusMessage: "已接入 Codex 监控（基于 session 日志）",
      configPath: codexSessionsRoot,
    });
  });

  it("reports active Codex diagnostics when hooks.json is configured", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const hooksPath = join(homeDir, ".codex", "hooks.json");
    mkdirSync(dirname(hooksPath), { recursive: true });
    writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: "vibe-island --source codex" }] }],
          Stop: [{ hooks: [{ type: "command", command: "vibe-island --source codex" }] }],
          UserPromptSubmit: [{ hooks: [{ type: "command", command: "vibe-island --source codex" }] }],
        },
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const codex = service.getDiagnostics().agents.find((agent) => agent.id === "codex");
    expect(codex).toMatchObject({
      id: "codex",
      supported: false,
      health: "active",
      healthLabel: "正常",
      actionLabel: "",
      hookInstalled: true,
      statusMessage: "已检测到 Codex 接入",
      configPath: hooksPath,
    });
  });

  it("installs codex notify hook idempotently without clobbering existing config", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".codex", "config.toml");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      [
        'model = "gpt-5.4"',
        "",
        '[projects."/Users/demo"]',
        'trust_level = "trusted"',
        "",
      ].join("\n"),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
      now: () => 77,
    });

    const first = service.installHooks("codex");
    const second = service.installHooks("codex");
    const text = readFileSync(configPath, "utf8");

    expect(first.changed).toBe(true);
    expect(first.hookInstalled).toBe(true);
    expect(first.backupPath).toBe(`${configPath}.bak.77`);
    expect(second.changed).toBe(false);
    expect(text).toContain('model = "gpt-5.4"');
    expect(text).toContain(
      `notify = ["${execPath}", "${appPath}", "--codepal-hook", "codex"]`,
    );
    expect(text).toContain('[projects."/Users/demo"]');
    expect(text).toContain('trust_level = "trusted"');
  });

  it("reports active Codex diagnostics when notify hook is configured", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const codexSessionsRoot = join(homeDir, ".codex", "sessions");
    const configPath = join(homeDir, ".codex", "config.toml");
    mkdirSync(codexSessionsRoot, { recursive: true });
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      `notify = ["${execPath}", "${appPath}", "--codepal-hook", "codex"]\n`,
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const codex = service.getDiagnostics().agents.find((agent) => agent.id === "codex");
    expect(codex).toMatchObject({
      id: "codex",
      supported: false,
      health: "active",
      healthLabel: "正常",
      actionLabel: "",
      hookInstalled: true,
      statusMessage: "已增强 Codex 接入，并持续同步会话记录",
      configPath,
    });
  });

  it("refuses to overwrite incompatible existing hook config structures", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".cursor", "hooks.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: [],
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    expect(() => service.installHooks("cursor")).toThrow("Cursor hooks.json 结构不兼容");
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      version: 1,
      hooks: [],
    });
  });

  it("reports legacy_path for Cursor when hooks use shell script commands", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".cursor", "hooks.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ command: `"${join(hookScriptsRoot, "cursor-agent-hook.sh")}" sessionStart` }],
          stop: [{ command: `"${join(hookScriptsRoot, "cursor-agent-hook.sh")}" stop` }],
        },
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const cursor = service.getDiagnostics().agents.find((agent) => agent.id === "cursor");
    expect(cursor).toMatchObject({
      health: "legacy_path",
      healthLabel: "待迁移",
      actionLabel: "迁移",
      hookInstalled: true,
    });
  });

  it("reports legacy_path for Cursor when hooks use node bridge mjs commands", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".cursor", "hooks.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ command: "node ./scripts/bridge/cursor-lifecycle.mjs sessionStart" }],
          stop: [{ command: "node ./scripts/bridge/cursor-lifecycle.mjs stop" }],
        },
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const cursor = service.getDiagnostics().agents.find((agent) => agent.id === "cursor");
    expect(cursor).toMatchObject({
      health: "legacy_path",
      hookInstalled: true,
    });
  });

  it("treats recognizable modern CodePal Cursor hook commands as active even when the wrapper differs", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".cursor", "hooks.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: Object.fromEntries(
          [
            "sessionStart",
            "stop",
            "beforeSubmitPrompt",
            "afterAgentResponse",
            "afterAgentThought",
            "beforeReadFile",
            "afterFileEdit",
            "beforeMCPExecution",
            "afterMCPExecution",
            "beforeShellExecution",
            "afterShellExecution",
          ].map((eventName) => [
            eventName,
            [{ command: `"${execPath}" "${appPath}" --codepal-hook cursor` }],
          ]),
        ),
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const cursor = service.getDiagnostics().agents.find((agent) => agent.id === "cursor");
    expect(cursor).toMatchObject({
      health: "active",
      hookInstalled: true,
      healthLabel: "正常",
    });
  });

  it("reports legacy_path for CodeBuddy when hooks use shell script commands", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".codebuddy", "settings.json");
    mkdirSync(dirname(configPath), { recursive: true });
    const legacyCommand = `"${join(hookScriptsRoot, "codebuddy-hook.sh")}"`;
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: legacyCommand }] }],
          UserPromptSubmit: [{ hooks: [{ type: "command", command: legacyCommand }] }],
          SessionEnd: [{ hooks: [{ type: "command", command: legacyCommand }] }],
          Notification: [
            {
              matcher: "permission_prompt",
              hooks: [{ type: "command", command: legacyCommand }],
            },
            { matcher: "idle_prompt", hooks: [{ type: "command", command: legacyCommand }] },
          ],
        },
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const codebuddy = service.getDiagnostics().agents.find((agent) => agent.id === "codebuddy");
    expect(codebuddy).toMatchObject({
      health: "legacy_path",
      healthLabel: "待迁移",
      actionLabel: "迁移",
      hookInstalled: true,
    });
  });
});
