import fs from "node:fs";
import path from "node:path";
import type {
  IntegrationAgentDiagnostics,
  IntegrationAgentId,
  IntegrationDiagnostics,
  IntegrationHealth,
  IntegrationInstallResult,
  IntegrationListenerDiagnostics,
} from "../../shared/integrationTypes";
import {
  buildClaudeHookCommand,
  buildClaudeInternalHookCommand,
  buildClaudeStatusLineCommand,
  buildClaudeInternalStatusLineCommand,
  buildCodeBuddyHookCommand,
  buildCodexHookArgv,
  buildCodexInternalHookArgv,
  buildCursorHookCommand,
  detectCodePalHookCommand,
  detectLegacyHookCommand,
  type HookCommandContext,
} from "../hook/commandBuilder";
import type { SessionStatus } from "../../shared/sessionTypes";

type IntegrationServiceOptions = {
  homeDir: string;
  hookScriptsRoot: string;
  packaged: boolean;
  execPath: string;
  appPath: string;
  now?: () => number;
};

type LastEvent = {
  at: number;
  status: SessionStatus;
};

const AGENT_LABELS: Record<IntegrationAgentId, string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  codebuddy: "CodeBuddy",
  "claude-internal": "Claude Internal",
  "codex-internal": "Codex Internal",
};

function defaultNow() {
  return Date.now();
}

function labelsForHealth(health: IntegrationHealth): {
  healthLabel: string;
  actionLabel: string;
  healthLabelKey: string;
  actionLabelKey: string;
} {
  switch (health) {
    case "active":
      return {
        healthLabel: "正常",
        actionLabel: "修复",
        healthLabelKey: "integration.health.active",
        actionLabelKey: "integration.action.repair",
      };
    case "legacy_path":
      return {
        healthLabel: "待迁移",
        actionLabel: "迁移",
        healthLabelKey: "integration.health.legacy_path",
        actionLabelKey: "integration.action.migrate",
      };
    case "repair_needed":
      return {
        healthLabel: "需修复",
        actionLabel: "修复",
        healthLabelKey: "integration.health.repair_needed",
        actionLabelKey: "integration.action.repair",
      };
    case "not_configured":
    default:
      return {
        healthLabel: "未配置",
        actionLabel: "启用",
        healthLabelKey: "integration.health.not_configured",
        actionLabelKey: "integration.action.enable",
      };
  }
}

function cursorHooksMatch(
  hooks: Record<string, unknown>,
  required: Record<string, string>,
): boolean {
  return Object.entries(required).every(([eventName, command]) => {
    const eventEntries = hooks[eventName];
    return (
      Array.isArray(eventEntries) &&
      eventEntries.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry as Record<string, unknown>).command === command,
      )
    );
  });
}

function cursorHooksRecognizeCodePal(
  hooks: Record<string, unknown>,
  eventNames: readonly string[],
): boolean {
  return eventNames.every((eventName) => {
    const eventEntries = hooks[eventName];
    return (
      Array.isArray(eventEntries) &&
      eventEntries.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          detectCodePalHookCommand(String((entry as Record<string, unknown>).command ?? ""), "cursor"),
      )
    );
  });
}

function cursorHooksEmpty(hooks: Record<string, unknown>, eventNames: string[]): boolean {
  return eventNames.every((eventName) => {
    const value = hooks[eventName];
    return !Array.isArray(value) || value.length === 0;
  });
}

function readOptionalJson(pathname: string): {
  exists: boolean;
  parsed?: Record<string, unknown>;
  error?: string;
} {
  if (!fs.existsSync(pathname)) {
    return { exists: false };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(pathname, "utf8")) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { exists: true, error: "配置文件结构不是 JSON 对象" };
    }
    return { exists: true, parsed };
  } catch (error) {
    return {
      exists: true,
      error: `配置文件不是合法 JSON：${(error as Error).message}`,
    };
  }
}

function readOptionalText(pathname: string): {
  exists: boolean;
  text?: string;
  error?: string;
} {
  if (!fs.existsSync(pathname)) {
    return { exists: false };
  }

  try {
    return { exists: true, text: fs.readFileSync(pathname, "utf8") };
  } catch (error) {
    return {
      exists: true,
      error: `配置文件无法读取：${(error as Error).message}`,
    };
  }
}

function ensureParentDir(pathname: string) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
}

function backupFile(pathname: string, now: () => number): string {
  const backupPath = `${pathname}.bak.${now()}`;
  fs.copyFileSync(pathname, backupPath);
  return backupPath;
}

function formatJson(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildCursorCommand(hookScriptPath: string, eventName: string): string {
  return `"${hookScriptPath}" ${eventName}`;
}

function buildCodeBuddyCommand(hookScriptPath: string): string {
  return `"${hookScriptPath}"`;
}

const CURSOR_HOOK_EVENT_NAMES = [
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
] as const;

function cursorConfigPath(homeDir: string): string {
  return path.join(homeDir, ".cursor", "hooks.json");
}

function codeBuddyConfigPath(homeDir: string): string {
  return path.join(homeDir, ".codebuddy", "settings.json");
}

function claudeConfigPath(homeDir: string): string {
  return path.join(homeDir, ".claude", "settings.json");
}

function claudeInternalConfigPath(homeDir: string): string {
  return path.join(homeDir, ".claude-internal", "settings.json");
}

function cursorHookScriptPath(hookScriptsRoot: string): string {
  return path.join(hookScriptsRoot, "cursor-agent-hook.sh");
}

function codeBuddyHookScriptPath(hookScriptsRoot: string): string {
  return path.join(hookScriptsRoot, "codebuddy-hook.sh");
}

function codexConfigPath(homeDir: string): string {
  return path.join(homeDir, ".codex", "config.toml");
}

function codexHooksPath(homeDir: string): string {
  return path.join(homeDir, ".codex", "hooks.json");
}

function codexSessionsPath(homeDir: string): string {
  return path.join(homeDir, ".codex", "sessions");
}

function codexInternalConfigPath(homeDir: string): string {
  return path.join(homeDir, ".codex-internal", "config.toml");
}

function codexInternalHooksPath(homeDir: string): string {
  return path.join(homeDir, ".codex-internal", "hooks.json");
}

function codexInternalSessionsPath(homeDir: string): string {
  return path.join(homeDir, ".codex-internal", "sessions");
}

type CodexNotifyConfig =
  | { kind: "missing" }
  | { kind: "parsed"; argv: string[]; start: number; end: number }
  | { kind: "invalid"; message: string };

function arrayBracketBalance(value: string): number {
  return [...value].reduce((balance, char) => {
    if (char === "[") return balance + 1;
    if (char === "]") return balance - 1;
    return balance;
  }, 0);
}

function readCodexNotifyConfig(text: string): CodexNotifyConfig {
  const pattern = /^notify\s*=\s*/gm;
  const match = pattern.exec(text);
  if (!match || match.index === undefined) {
    return { kind: "missing" };
  }

  const valueStart = match.index + match[0].length;
  let cursor = valueStart;
  let balance = 0;
  let sawBracket = false;

  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "[") {
      sawBracket = true;
    }
    if (sawBracket) {
      balance += arrayBracketBalance(char);
      if (balance === 0) {
        cursor += 1;
        break;
      }
    } else if (!/\s/.test(char)) {
      return { kind: "invalid", message: "Codex config.toml notify 必须是字符串数组" };
    }
    cursor += 1;
  }

  if (!sawBracket || balance !== 0) {
    return { kind: "invalid", message: "Codex config.toml notify 数组不完整" };
  }

  const raw = text.slice(valueStart, cursor).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      kind: "invalid",
      message: `Codex config.toml notify 不是可解析的字符串数组：${(error as Error).message}`,
    };
  }

  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    return { kind: "invalid", message: "Codex config.toml notify 必须是字符串数组" };
  }

  let end = cursor;
  while (end < text.length && text[end] !== "\n") {
    end += 1;
  }
  if (end < text.length && text[end] === "\n") {
    end += 1;
  }

  return { kind: "parsed", argv: parsed, start: match.index, end };
}

function codexNotifyArrayLiteral(argv: string[]): string {
  return `[${argv.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function upsertCodexNotifyConfig(text: string, argv: string[]): { changed: boolean; text: string } {
  const nextLine = `notify = ${codexNotifyArrayLiteral(argv)}\n`;
  const current = readCodexNotifyConfig(text);

  if (current.kind === "invalid") {
    throw new Error(current.message);
  }
  if (current.kind === "parsed") {
    if (arraysEqual(current.argv, argv)) {
      return { changed: false, text };
    }
    return {
      changed: true,
      text: `${text.slice(0, current.start)}${nextLine}${text.slice(current.end)}`,
    };
  }

  if (!text.trim()) {
    return { changed: true, text: nextLine };
  }

  const firstTableIndex = text.search(/^\[/m);
  if (firstTableIndex === -1) {
    const prefix = text.endsWith("\n") ? text : `${text}\n`;
    return { changed: true, text: `${prefix}${nextLine}` };
  }

  const prefix = text.slice(0, firstTableIndex);
  const suffix = text.slice(firstTableIndex);
  const joiner = prefix.trim().length === 0 ? "" : prefix.endsWith("\n\n") ? "" : "\n";
  return {
    changed: true,
    text: `${prefix}${joiner}${nextLine}${suffix}`,
  };
}

function inspectCodexConfig(
  homeDir: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = codexConfigPath(homeDir);
  const hooksPath = codexHooksPath(homeDir);
  const sessionsPath = codexSessionsPath(homeDir);
  const sessionsExist = fs.existsSync(sessionsPath);
  const hooksConfig = readOptionalJson(hooksPath);
  const config = readOptionalText(configPath);
  const desiredNotifyArgv = buildCodexHookArgv(hookCtx);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = sessionsExist
    ? "已接入 Codex 监控（基于 session 日志）"
    : "未检测到 Codex session 日志或 hooks";
  let statusMessageKey = sessionsExist
    ? "integration.message.codex.monitoring"
    : undefined;
  let displayPath = sessionsExist ? sessionsPath : hooksPath;

  if (hooksConfig.error) {
    health = "repair_needed";
    statusMessage = hooksConfig.error;
    displayPath = hooksPath;
  } else if (hooksConfig.parsed) {
    const hooksValue = hooksConfig.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      const eventNames = ["SessionStart", "Stop", "UserPromptSubmit"];
      const hasAnyHooks = eventNames.some((eventName) => {
        const eventEntries = hooks[eventName];
        return Array.isArray(eventEntries) && eventEntries.length > 0;
      });
      const hasCodePalHooks = eventNames.every((eventName) => {
        const eventEntries = hooks[eventName];
        return (
          Array.isArray(eventEntries) &&
          eventEntries.some((entry) => {
            if (!entry || typeof entry !== "object") {
              return false;
            }
            const nestedHooks = (entry as Record<string, unknown>).hooks;
            return (
              Array.isArray(nestedHooks) &&
              nestedHooks.some(
                (hook) =>
                  hook &&
                  typeof hook === "object" &&
                  detectCodePalHookCommand(
                    String((hook as Record<string, unknown>).command ?? ""),
                    "codex",
                  ),
              )
            );
          })
        );
      });

      if (hasAnyHooks) {
        health = "active";
        hookInstalled = true;
        statusMessage = hasCodePalHooks
          ? "已接入 Codex"
          : "已检测到 Codex 接入";
        statusMessageKey = hasCodePalHooks
          ? "integration.message.codex.active"
          : "integration.message.codex.detected";
        if (sessionsExist) {
          statusMessage += "，并持续同步会话记录";
          statusMessageKey = hasCodePalHooks
            ? "integration.message.codex.activeWithSessions"
            : "integration.message.codex.detected";
        }
        displayPath = hooksPath;
      }
    } else {
      health = "repair_needed";
      statusMessage = "Codex hooks.json 结构不兼容";
      statusMessageKey = "integration.message.codex.invalidHooks";
      displayPath = hooksPath;
    }
  }

  if (health !== "active" && config.error) {
    health = "repair_needed";
    statusMessage = config.error;
    displayPath = configPath;
  } else if (health !== "active" && config.text !== undefined) {
    const notify = readCodexNotifyConfig(config.text);
    if (notify.kind === "invalid") {
      health = "repair_needed";
      statusMessage = notify.message;
      displayPath = configPath;
    } else if (notify.kind === "parsed" && arraysEqual(notify.argv, desiredNotifyArgv)) {
      health = "active";
      hookInstalled = true;
      statusMessage = sessionsExist
        ? "已增强 Codex 接入，并持续同步会话记录"
        : "已增强 Codex 接入";
      statusMessageKey = sessionsExist
        ? "integration.message.codex.enhancedWithSessions"
        : "integration.message.codex.enhanced";
      displayPath = configPath;
    } else if (sessionsExist) {
      health = "active";
    }
  } else if (sessionsExist) {
    health = "active";
  }

  const { healthLabel, healthLabelKey } = labelsForHealth(health);

  return {
    id: "codex",
    label: AGENT_LABELS.codex,
    supported: false,
    configPath: displayPath,
    configExists: fs.existsSync(displayPath),
    hookScriptPath: displayPath,
    hookScriptExists: fs.existsSync(displayPath),
    hookInstalled,
    health,
    healthLabel,
    healthLabelKey,
    actionLabel: "",
    statusMessage,
    statusMessageKey,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function inspectCodexInternalConfig(
  homeDir: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = codexInternalConfigPath(homeDir);
  const hooksPath = codexInternalHooksPath(homeDir);
  const sessionsPath = codexInternalSessionsPath(homeDir);
  const sessionsExist = fs.existsSync(sessionsPath);
  const hooksConfig = readOptionalJson(hooksPath);
  const config = readOptionalText(configPath);
  const desiredNotifyArgv = buildCodexInternalHookArgv(hookCtx);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = sessionsExist
    ? "已接入 Codex Internal 监控（基于 session 日志）"
    : "未检测到 Codex Internal session 日志或 hooks";
  let statusMessageKey = sessionsExist
    ? "integration.message.codex-internal.monitoring"
    : undefined;
  let displayPath = sessionsExist ? sessionsPath : hooksPath;

  if (hooksConfig.error) {
    health = "repair_needed";
    statusMessage = hooksConfig.error;
    displayPath = hooksPath;
  } else if (hooksConfig.parsed) {
    const hooksValue = hooksConfig.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      const eventNames = ["SessionStart", "Stop", "UserPromptSubmit"];
      const hasAnyHooks = eventNames.some((eventName) => {
        const eventEntries = hooks[eventName];
        return Array.isArray(eventEntries) && eventEntries.length > 0;
      });
      const hasCodePalHooks = eventNames.every((eventName) => {
        const eventEntries = hooks[eventName];
        return (
          Array.isArray(eventEntries) &&
          eventEntries.some((entry) => {
            if (!entry || typeof entry !== "object") {
              return false;
            }
            const nestedHooks = (entry as Record<string, unknown>).hooks;
            return (
              Array.isArray(nestedHooks) &&
              nestedHooks.some(
                (hook) =>
                  hook &&
                  typeof hook === "object" &&
                  detectCodePalHookCommand(
                    String((hook as Record<string, unknown>).command ?? ""),
                    "codex-internal",
                  ),
              )
            );
          })
        );
      });

      if (hasAnyHooks) {
        health = "active";
        hookInstalled = true;
        statusMessage = hasCodePalHooks
          ? "已接入 Codex Internal"
          : "已检测到 Codex Internal 接入";
        statusMessageKey = hasCodePalHooks
          ? "integration.message.codex-internal.active"
          : "integration.message.codex-internal.detected";
        if (sessionsExist) {
          statusMessage += "，并持续同步会话记录";
          statusMessageKey = hasCodePalHooks
            ? "integration.message.codex-internal.activeWithSessions"
            : "integration.message.codex-internal.detected";
        }
        displayPath = hooksPath;
      }
    } else {
      health = "repair_needed";
      statusMessage = "Codex Internal hooks.json 结构不兼容";
      statusMessageKey = "integration.message.codex-internal.invalidHooks";
      displayPath = hooksPath;
    }
  }

  if (health !== "active" && config.error) {
    health = "repair_needed";
    statusMessage = config.error;
    displayPath = configPath;
  } else if (health !== "active" && config.text !== undefined) {
    const notify = readCodexNotifyConfig(config.text);
    if (notify.kind === "invalid") {
      health = "repair_needed";
      statusMessage = notify.message;
      displayPath = configPath;
    } else if (notify.kind === "parsed" && arraysEqual(notify.argv, desiredNotifyArgv)) {
      health = "active";
      hookInstalled = true;
      statusMessage = sessionsExist
        ? "已增强 Codex Internal 接入，并持续同步会话记录"
        : "已增强 Codex Internal 接入";
      statusMessageKey = sessionsExist
        ? "integration.message.codex-internal.enhancedWithSessions"
        : "integration.message.codex-internal.enhanced";
      displayPath = configPath;
    } else if (sessionsExist) {
      health = "active";
    }
  } else if (sessionsExist) {
    health = "active";
  }

  const { healthLabel, healthLabelKey } = labelsForHealth(health);

  return {
    id: "codex-internal",
    label: AGENT_LABELS["codex-internal"],
    supported: false,
    configPath: displayPath,
    configExists: fs.existsSync(displayPath),
    hookScriptPath: displayPath,
    hookScriptExists: fs.existsSync(displayPath),
    hookInstalled,
    health,
    healthLabel,
    healthLabelKey,
    actionLabel: "",
    statusMessage,
    statusMessageKey,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function inspectCursorConfig(
  homeDir: string,
  hookScriptsRoot: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = cursorConfigPath(homeDir);
  const hookScriptPath = cursorHookScriptPath(hookScriptsRoot);
  const hookScriptExists = fs.existsSync(hookScriptPath);
  const config = readOptionalJson(configPath);
  const requiredNew = Object.fromEntries(
    CURSOR_HOOK_EVENT_NAMES.map((eventName) => [eventName, buildCursorHookCommand(hookCtx)]),
  ) as Record<string, string>;
  const requiredLegacy = {
    sessionStart: buildCursorCommand(hookScriptPath, "sessionStart"),
    stop: buildCursorCommand(hookScriptPath, "stop"),
  };
  const eventNames = Object.keys(requiredNew);
  const legacyEventNames = Object.keys(requiredLegacy);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = "未配置 CodePal Cursor hooks";
  let statusMessageKey = "integration.message.cursor.notConfigured";

  if (config.error) {
    health = "repair_needed";
    statusMessage = config.error;
  } else if (!config.exists) {
    health = "not_configured";
  } else if (config.parsed) {
    const hooksValue = config.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      const hooksAreEmpty = cursorHooksEmpty(hooks, eventNames);
      const hasNew = cursorHooksMatch(hooks, requiredNew);
      const hasRecognizedCodePal = cursorHooksRecognizeCodePal(hooks, eventNames);
      const hasLegacyExact = cursorHooksMatch(hooks, requiredLegacy);
      const hasLegacyDetect =
        legacyEventNames.every((eventName) => {
          const eventEntries = hooks[eventName];
          if (!Array.isArray(eventEntries)) return false;
          return eventEntries.some(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              detectLegacyHookCommand(
                String((entry as Record<string, unknown>).command ?? ""),
              ),
          );
        }) && !hasNew;
      const hasLegacy = hasLegacyExact || hasLegacyDetect;

      if (hasNew || hasRecognizedCodePal) {
        health = "active";
        hookInstalled = true;
        statusMessage = "已配置用户级 Cursor hooks";
        statusMessageKey = "integration.message.cursor.active";
      } else if (hasLegacy) {
        health = "legacy_path";
        hookInstalled = true;
        statusMessage = "检测到旧版 CodePal Cursor hook 命令，建议迁移";
        statusMessageKey = "integration.message.cursor.legacy";
      } else if (!hooksAreEmpty) {
        health = "repair_needed";
        statusMessage = "Cursor hooks.json 与当前 CodePal 要求不一致";
        statusMessageKey = "integration.message.cursor.mismatch";
      } else {
        health = "not_configured";
      }
    } else {
      health = "repair_needed";
      statusMessage = "Cursor hooks.json 结构不兼容";
      statusMessageKey = "integration.message.cursor.invalid";
    }
  }

  const { healthLabel, actionLabel, healthLabelKey, actionLabelKey } = labelsForHealth(health);

  return {
    id: "cursor",
    label: AGENT_LABELS.cursor,
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath,
    hookScriptExists,
    hookInstalled,
    health,
    healthLabel,
    healthLabelKey,
    actionLabel,
    actionLabelKey,
    statusMessage,
    statusMessageKey,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

type CodeBuddyRequiredEntry = {
  eventName: string;
  matcher?: string;
  command: string;
};

type ClaudeRequiredEntry = {
  eventName: string;
  matcher?: string;
  command: string;
};

function codeBuddyRequiredEntries(hookScriptPath: string): CodeBuddyRequiredEntry[] {
  const command = buildCodeBuddyCommand(hookScriptPath);
  return [
    { eventName: "SessionStart", command },
    { eventName: "UserPromptSubmit", command },
    { eventName: "SessionEnd", command },
    { eventName: "Notification", matcher: "permission_prompt", command },
    { eventName: "Notification", matcher: "idle_prompt", command },
  ];
}

function codeBuddyRequiredNewEntries(hookCtx: HookCommandContext): CodeBuddyRequiredEntry[] {
  const command = buildCodeBuddyHookCommand(hookCtx);
  return [
    { eventName: "SessionStart", command },
    { eventName: "UserPromptSubmit", command },
    { eventName: "SessionEnd", command },
    { eventName: "Notification", matcher: "permission_prompt", command },
    { eventName: "Notification", matcher: "idle_prompt", command },
  ];
}

function claudeRequiredNewEntries(hookCtx: HookCommandContext): ClaudeRequiredEntry[] {
  const command = buildClaudeHookCommand(hookCtx);
  return [
    { eventName: "SessionStart", matcher: "*", command },
    { eventName: "UserPromptSubmit", command },
    { eventName: "Notification", command },
    { eventName: "Stop", command },
    { eventName: "SessionEnd", command },
  ];
}

function claudeInternalRequiredNewEntries(hookCtx: HookCommandContext): ClaudeRequiredEntry[] {
  const command = buildClaudeInternalHookCommand(hookCtx);
  return [
    { eventName: "SessionStart", matcher: "*", command },
    { eventName: "UserPromptSubmit", command },
    { eventName: "Notification", command },
    { eventName: "Stop", command },
    { eventName: "SessionEnd", command },
  ];
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function commandContainsCodePalSubcommand(command: string, subcommand: string): boolean {
  return command.includes(`--codepal-hook ${subcommand}`);
}

function buildChainedClaudeStatusLineCommand(
  existingCommand: string,
  codePalCommand: string,
): string {
  const script =
    `input=$(cat); ` +
    `printf "%s" "$input" | ${codePalCommand} >/dev/null 2>&1; ` +
    `printf "%s" "$input" | ${existingCommand}`;
  return `/bin/sh -lc ${shellSingleQuote(script)}`;
}

function readClaudeStatusLineCommand(config: Record<string, unknown>): string | undefined {
  const statusLine = config.statusLine;
  if (!statusLine) {
    return undefined;
  }
  if (typeof statusLine === "string" && statusLine.trim()) {
    return statusLine.trim();
  }
  if (statusLine && typeof statusLine === "object" && !Array.isArray(statusLine)) {
    return firstString(statusLine as Record<string, unknown>, ["command"]);
  }
  return undefined;
}

function firstString(payload: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function hasClaudeStatusLine(config: Record<string, unknown>, hookCtx: HookCommandContext): boolean {
  const command = readClaudeStatusLineCommand(config);
  if (!command) {
    return false;
  }
  const expected = buildClaudeStatusLineCommand(hookCtx);
  return command === expected || commandContainsCodePalSubcommand(command, "claude-statusline");
}

function hasClaudeInternalStatusLine(config: Record<string, unknown>, hookCtx: HookCommandContext): boolean {
  const command = readClaudeStatusLineCommand(config);
  if (!command) {
    return false;
  }
  const expected = buildClaudeInternalStatusLineCommand(hookCtx);
  return command === expected || commandContainsCodePalSubcommand(command, "claude-internal-statusline");
}

function codeBuddyEveryRequiredSatisfiedByDetectLegacy(
  hooks: Record<string, unknown>,
  templates: CodeBuddyRequiredEntry[],
): boolean {
  return templates.every((required) => {
    const entries = hooks[required.eventName];
    if (!Array.isArray(entries)) return false;
    return entries.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry as Record<string, unknown>;
      if (required.matcher !== undefined && record.matcher !== required.matcher) return false;
      if (required.matcher === undefined && "matcher" in record && record.matcher !== undefined) {
        return false;
      }
      if (!Array.isArray(record.hooks)) return false;
      return record.hooks.some(
        (hook) =>
          hook &&
          typeof hook === "object" &&
          (hook as Record<string, unknown>).type === "command" &&
          detectLegacyHookCommand(String((hook as Record<string, unknown>).command ?? "")),
      );
    });
  });
}

function codeBuddyHooksMatch(
  hooks: Record<string, unknown>,
  required: CodeBuddyRequiredEntry[],
): boolean {
  return required.every((requiredEntry) => hasCodeBuddyHookEntry(hooks[requiredEntry.eventName], requiredEntry));
}

function codeBuddyHooksEmpty(hooks: Record<string, unknown>): boolean {
  const keys = ["SessionStart", "UserPromptSubmit", "SessionEnd", "Notification"] as const;
  return keys.every((key) => {
    const value = hooks[key];
    return !Array.isArray(value) || value.length === 0;
  });
}

function hasCodeBuddyHookEntry(entries: unknown, required: CodeBuddyRequiredEntry): boolean {
  if (!Array.isArray(entries)) return false;
  return entries.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    if (required.matcher !== undefined && record.matcher !== required.matcher) return false;
    if (required.matcher === undefined && "matcher" in record && record.matcher !== undefined) {
      return false;
    }
    if (!Array.isArray(record.hooks)) return false;
    return record.hooks.some(
      (hook) =>
        hook &&
        typeof hook === "object" &&
        (hook as Record<string, unknown>).type === "command" &&
        (hook as Record<string, unknown>).command === required.command,
    );
  });
}

function hasClaudeHookEntry(entries: unknown, required: ClaudeRequiredEntry): boolean {
  if (!Array.isArray(entries)) return false;
  return entries.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    if (required.matcher !== undefined && record.matcher !== required.matcher) return false;
    if (required.matcher === undefined && "matcher" in record && record.matcher !== undefined) {
      return false;
    }
    if (!Array.isArray(record.hooks)) return false;
    return record.hooks.some(
      (hook) =>
        hook &&
        typeof hook === "object" &&
        (hook as Record<string, unknown>).type === "command" &&
        (hook as Record<string, unknown>).command === required.command,
    );
  });
}

function claudeHooksMatch(
  hooks: Record<string, unknown>,
  required: ClaudeRequiredEntry[],
): boolean {
  return required.every((requiredEntry) => hasClaudeHookEntry(hooks[requiredEntry.eventName], requiredEntry));
}

function claudeHooksEmpty(hooks: Record<string, unknown>): boolean {
  const keys = ["SessionStart", "UserPromptSubmit", "Notification", "Stop", "SessionEnd"] as const;
  return keys.every((key) => {
    const value = hooks[key];
    return !Array.isArray(value) || value.length === 0;
  });
}

function inspectClaudeConfig(
  homeDir: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = claudeConfigPath(homeDir);
  const config = readOptionalJson(configPath);
  const required = claudeRequiredNewEntries(hookCtx);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = "未配置 CodePal Claude hooks";
  let statusMessageKey = "integration.message.claude.notConfigured";

  if (config.error) {
    health = "repair_needed";
    statusMessage = config.error;
  } else if (!config.exists) {
    health = "not_configured";
  } else if (config.parsed) {
    const hasStatusLine = hasClaudeStatusLine(config.parsed, hookCtx);
    const hooksValue = config.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      if (claudeHooksMatch(hooks, required) && hasStatusLine) {
        health = "active";
        hookInstalled = true;
        statusMessage = "已配置用户级 Claude hooks 与 statusLine";
        statusMessageKey = "integration.message.claude.active";
      } else if (claudeHooksMatch(hooks, required)) {
        health = "repair_needed";
        statusMessage = "Claude hooks 已配置，但缺少 CodePal statusLine";
        statusMessageKey = "integration.message.claude.missingStatusLine";
      } else if (!claudeHooksEmpty(hooks)) {
        health = "repair_needed";
        statusMessage = "Claude settings.json hooks 与当前 CodePal 要求不一致";
        statusMessageKey = "integration.message.claude.mismatch";
      } else if (hasStatusLine) {
        health = "repair_needed";
        statusMessage = "Claude statusLine 已配置，但 hooks 未完成";
        statusMessageKey = "integration.message.claude.statusLineOnly";
      }
    } else if (!("hooks" in config.parsed)) {
      health = hasStatusLine ? "repair_needed" : "not_configured";
      statusMessage = hasStatusLine
        ? "Claude statusLine 已配置，但 hooks 未完成"
        : statusMessage;
      statusMessageKey = hasStatusLine
        ? "integration.message.claude.statusLineOnly"
        : "integration.message.claude.notConfigured";
    } else {
      health = "repair_needed";
      statusMessage = "Claude settings.json hooks 结构不兼容";
      statusMessageKey = "integration.message.claude.invalid";
    }
  }

  const { healthLabel, actionLabel, healthLabelKey, actionLabelKey } = labelsForHealth(health);
  return {
    id: "claude",
    label: AGENT_LABELS.claude,
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath: configPath,
    hookScriptExists: config.exists,
    hookInstalled,
    health,
    healthLabel,
    healthLabelKey,
    actionLabel,
    actionLabelKey,
    statusMessage,
    statusMessageKey,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function inspectClaudeInternalConfig(
  homeDir: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = claudeInternalConfigPath(homeDir);
  const config = readOptionalJson(configPath);
  const required = claudeInternalRequiredNewEntries(hookCtx);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = "未配置 CodePal Claude Internal hooks";
  let statusMessageKey = "integration.message.claude-internal.notConfigured";

  if (config.error) {
    health = "repair_needed";
    statusMessage = config.error;
  } else if (!config.exists) {
    health = "not_configured";
  } else if (config.parsed) {
    const hasStatusLine = hasClaudeInternalStatusLine(config.parsed, hookCtx);
    const hooksValue = config.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      if (claudeHooksMatch(hooks, required) && hasStatusLine) {
        health = "active";
        hookInstalled = true;
        statusMessage = "已配置用户级 Claude Internal hooks 与 statusLine";
        statusMessageKey = "integration.message.claude-internal.active";
      } else if (claudeHooksMatch(hooks, required)) {
        health = "repair_needed";
        statusMessage = "Claude Internal hooks 已配置，但缺少 CodePal statusLine";
        statusMessageKey = "integration.message.claude-internal.missingStatusLine";
      } else if (!claudeHooksEmpty(hooks)) {
        health = "repair_needed";
        statusMessage = "Claude Internal settings.json hooks 与当前 CodePal 要求不一致";
        statusMessageKey = "integration.message.claude-internal.mismatch";
      } else if (hasStatusLine) {
        health = "repair_needed";
        statusMessage = "Claude Internal statusLine 已配置，但 hooks 未完成";
        statusMessageKey = "integration.message.claude-internal.statusLineOnly";
      }
    } else if (!("hooks" in config.parsed)) {
      health = hasStatusLine ? "repair_needed" : "not_configured";
      statusMessage = hasStatusLine
        ? "Claude Internal statusLine 已配置，但 hooks 未完成"
        : statusMessage;
      statusMessageKey = hasStatusLine
        ? "integration.message.claude-internal.statusLineOnly"
        : "integration.message.claude-internal.notConfigured";
    } else {
      health = "repair_needed";
      statusMessage = "Claude Internal settings.json hooks 结构不兼容";
      statusMessageKey = "integration.message.claude-internal.invalid";
    }
  }

  const { healthLabel, actionLabel, healthLabelKey, actionLabelKey } = labelsForHealth(health);
  return {
    id: "claude-internal",
    label: AGENT_LABELS["claude-internal"],
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath: configPath,
    hookScriptExists: config.exists,
    hookInstalled,
    health,
    healthLabel,
    healthLabelKey,
    actionLabel,
    actionLabelKey,
    statusMessage,
    statusMessageKey,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function inspectCodeBuddyConfig(
  homeDir: string,
  hookScriptsRoot: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = codeBuddyConfigPath(homeDir);
  const hookScriptPath = codeBuddyHookScriptPath(hookScriptsRoot);
  const hookScriptExists = fs.existsSync(hookScriptPath);
  const config = readOptionalJson(configPath);
  const requiredNew = codeBuddyRequiredNewEntries(hookCtx);
  const requiredLegacy = codeBuddyRequiredEntries(hookScriptPath);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = "未配置 CodePal CodeBuddy hooks";
  let statusMessageKey = "integration.message.codebuddy.notConfigured";

  if (config.error) {
    health = "repair_needed";
    statusMessage = config.error;
  } else if (!config.exists) {
    health = "not_configured";
  } else if (config.parsed) {
    const hooksValue = config.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      const hooksAreEmpty = codeBuddyHooksEmpty(hooks);
      const hasNew = codeBuddyHooksMatch(hooks, requiredNew);
      const hasLegacyExact = codeBuddyHooksMatch(hooks, requiredLegacy);
      const hasLegacyDetect =
        !hasNew && codeBuddyEveryRequiredSatisfiedByDetectLegacy(hooks, requiredLegacy);
      const hasLegacy = hasLegacyExact || hasLegacyDetect;

      if (hasNew) {
        health = "active";
        hookInstalled = true;
        statusMessage = "已配置用户级 CodeBuddy hooks";
        statusMessageKey = "integration.message.codebuddy.active";
      } else if (hasLegacy) {
        health = "legacy_path";
        hookInstalled = true;
        statusMessage = "检测到旧版 CodePal CodeBuddy hook 命令，建议迁移";
        statusMessageKey = "integration.message.codebuddy.legacy";
      } else if (!hooksAreEmpty) {
        health = "repair_needed";
        statusMessage = "CodeBuddy settings.json hooks 与当前 CodePal 要求不一致";
        statusMessageKey = "integration.message.codebuddy.mismatch";
      } else {
        health = "not_configured";
      }
    } else if (!("hooks" in config.parsed)) {
      health = "not_configured";
      statusMessage = "未配置 CodePal CodeBuddy hooks";
      statusMessageKey = "integration.message.codebuddy.notConfigured";
    } else {
      health = "repair_needed";
      statusMessage = "CodeBuddy settings.json hooks 结构不兼容";
      statusMessageKey = "integration.message.codebuddy.invalid";
    }
  }

  const { healthLabel, actionLabel, healthLabelKey, actionLabelKey } = labelsForHealth(health);

  return {
    id: "codebuddy",
    label: AGENT_LABELS.codebuddy,
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath,
    hookScriptExists,
    hookInstalled,
    health,
    healthLabel,
    healthLabelKey,
    actionLabel,
    actionLabelKey,
    statusMessage,
    statusMessageKey,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function installCursorHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = cursorConfigPath(homeDir);
  const current = readOptionalJson(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const root = current.parsed ?? {};
  const next = { ...root } as Record<string, unknown>;
  next.version = typeof root.version === "number" ? root.version : 1;

  const hooksValue = next.hooks;
  if (
    hooksValue !== undefined &&
    (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue))
  ) {
    throw new Error("Cursor hooks.json 结构不兼容");
  }
  const hooks = hooksValue ? ({ ...hooksValue } as Record<string, unknown>) : {};

  const requiredCommands = Object.fromEntries(
    CURSOR_HOOK_EVENT_NAMES.map((eventName) => [eventName, buildCursorHookCommand(hookCtx)]),
  ) as Record<string, string>;

  let changed = current.exists === false;

  for (const [eventName, command] of Object.entries(requiredCommands)) {
    const existingEntries = hooks[eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`Cursor hooks.json 中 ${eventName} 不是数组`);
    }
    const entries = Array.isArray(existingEntries) ? [...existingEntries] : [];
    const alreadyPresent = entries.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).command === command,
    );
    if (!alreadyPresent) {
      entries.push({ command });
      changed = true;
    }
    hooks[eventName] = entries;
  }

  next.hooks = hooks;

  let backupPath: string | undefined;
  if (changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, formatJson(next));
  }

  return { changed, backupPath };
}

function installCodeBuddyHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = codeBuddyConfigPath(homeDir);
  const current = readOptionalJson(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const next = { ...(current.parsed ?? {}) } as Record<string, unknown>;
  const hooksValue = next.hooks;
  if (
    hooksValue !== undefined &&
    (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue))
  ) {
    throw new Error("CodeBuddy settings.json hooks 结构不兼容");
  }
  const hooks = hooksValue ? ({ ...hooksValue } as Record<string, unknown>) : {};

  let changed = current.exists === false;

  for (const required of codeBuddyRequiredNewEntries(hookCtx)) {
    const existingEntries = hooks[required.eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`CodeBuddy hooks.${required.eventName} 不是数组`);
    }
    const entries = Array.isArray(existingEntries) ? [...existingEntries] : [];
    if (!hasCodeBuddyHookEntry(entries, required)) {
      entries.push({
        ...(required.matcher !== undefined ? { matcher: required.matcher } : {}),
        hooks: [{ type: "command", command: required.command }],
      });
      changed = true;
    }
    hooks[required.eventName] = entries;
  }

  next.hooks = hooks;

  let backupPath: string | undefined;
  if (changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, formatJson(next));
  }

  return { changed, backupPath };
}

function installClaudeHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = claudeConfigPath(homeDir);
  const current = readOptionalJson(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const next = { ...(current.parsed ?? {}) } as Record<string, unknown>;
  const hooksValue = next.hooks;
  if (
    hooksValue !== undefined &&
    (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue))
  ) {
    throw new Error("Claude settings.json hooks 结构不兼容");
  }
  const hooks = hooksValue ? ({ ...hooksValue } as Record<string, unknown>) : {};

  let changed = current.exists === false;

  for (const required of claudeRequiredNewEntries(hookCtx)) {
    const existingEntries = hooks[required.eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`Claude hooks.${required.eventName} 不是数组`);
    }
    const entries = Array.isArray(existingEntries) ? [...existingEntries] : [];
    if (!hasClaudeHookEntry(entries, required)) {
      entries.push({
        ...(required.matcher !== undefined ? { matcher: required.matcher } : {}),
        hooks: [{ type: "command", command: required.command }],
      });
      changed = true;
    }
    hooks[required.eventName] = entries;
  }

  next.hooks = hooks;
  const desiredStatusLineCommand = buildClaudeStatusLineCommand(hookCtx);
  const existingStatusLineCommand = readClaudeStatusLineCommand(next);
  if (!existingStatusLineCommand) {
    next.statusLine = {
      type: "command",
      command: desiredStatusLineCommand,
    };
    changed = true;
  } else if (!commandContainsCodePalSubcommand(existingStatusLineCommand, "claude-statusline")) {
    next.statusLine = {
      type: "command",
      command: buildChainedClaudeStatusLineCommand(
        existingStatusLineCommand,
        desiredStatusLineCommand,
      ),
    };
    changed = true;
  }

  let backupPath: string | undefined;
  if (changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, formatJson(next));
  }

  return { changed, backupPath };
}

function installCodexHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = codexConfigPath(homeDir);
  const current = readOptionalText(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const next = upsertCodexNotifyConfig(current.text ?? "", buildCodexHookArgv(hookCtx));
  let backupPath: string | undefined;

  if (next.changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, next.text);
  }

  return { changed: next.changed, backupPath };
}

function installClaudeInternalHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = claudeInternalConfigPath(homeDir);
  const current = readOptionalJson(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const next = { ...(current.parsed ?? {}) } as Record<string, unknown>;
  const hooksValue = next.hooks;
  if (
    hooksValue !== undefined &&
    (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue))
  ) {
    throw new Error("Claude Internal settings.json hooks 结构不兼容");
  }
  const hooks = hooksValue ? ({ ...hooksValue } as Record<string, unknown>) : {};

  let changed = current.exists === false;

  for (const required of claudeInternalRequiredNewEntries(hookCtx)) {
    const existingEntries = hooks[required.eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`Claude Internal hooks.${required.eventName} 不是数组`);
    }
    const entries = Array.isArray(existingEntries) ? [...existingEntries] : [];
    if (!hasClaudeHookEntry(entries, required)) {
      entries.push({
        ...(required.matcher !== undefined ? { matcher: required.matcher } : {}),
        hooks: [{ type: "command", command: required.command }],
      });
      changed = true;
    }
    hooks[required.eventName] = entries;
  }

  next.hooks = hooks;
  const desiredStatusLineCommand = buildClaudeInternalStatusLineCommand(hookCtx);
  const existingStatusLineCommand = readClaudeStatusLineCommand(next);
  if (!existingStatusLineCommand) {
    next.statusLine = {
      type: "command",
      command: desiredStatusLineCommand,
    };
    changed = true;
  } else if (!commandContainsCodePalSubcommand(existingStatusLineCommand, "claude-internal-statusline")) {
    next.statusLine = {
      type: "command",
      command: buildChainedClaudeStatusLineCommand(
        existingStatusLineCommand,
        desiredStatusLineCommand,
      ),
    };
    changed = true;
  }

  let backupPath: string | undefined;
  if (changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, formatJson(next));
  }

  return { changed, backupPath };
}

function installCodexInternalHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = codexInternalConfigPath(homeDir);
  const current = readOptionalText(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const next = upsertCodexNotifyConfig(current.text ?? "", buildCodexInternalHookArgv(hookCtx));
  let backupPath: string | undefined;

  if (next.changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, next.text);
  }

  return { changed: next.changed, backupPath };
}

function formatExecutableLabel(packaged: boolean, execPath: string): string {
  const base = path.basename(execPath);
  return packaged ? `CodePal 已打包构建 · ${base}` : "CodePal 开发构建";
}

export function createIntegrationService(options: IntegrationServiceOptions) {
  const now = options.now ?? defaultNow;
  let listener: IntegrationListenerDiagnostics = {
    mode: "unavailable",
    message: "等待 CodePal 接收入口就绪",
  };
  const lastEvents = new Map<IntegrationAgentId, LastEvent>();

  function integrationHookContext(): HookCommandContext {
    return {
      packaged: options.packaged,
      execPath: options.execPath,
      appPath: options.appPath,
    };
  }

  function getAgentDiagnostics(agentId: IntegrationAgentId): IntegrationAgentDiagnostics {
    const hookCtx = integrationHookContext();
    if (agentId === "claude") {
      return inspectClaudeConfig(options.homeDir, hookCtx, lastEvents.get(agentId));
    }
    if (agentId === "claude-internal") {
      return inspectClaudeInternalConfig(options.homeDir, hookCtx, lastEvents.get(agentId));
    }
    if (agentId === "codex") {
      return inspectCodexConfig(options.homeDir, hookCtx, lastEvents.get(agentId));
    }
    if (agentId === "codex-internal") {
      return inspectCodexInternalConfig(options.homeDir, hookCtx, lastEvents.get(agentId));
    }
    if (agentId === "cursor") {
      return inspectCursorConfig(
        options.homeDir,
        options.hookScriptsRoot,
        hookCtx,
        lastEvents.get(agentId),
      );
    }
    return inspectCodeBuddyConfig(
      options.homeDir,
      options.hookScriptsRoot,
      hookCtx,
      lastEvents.get(agentId),
    );
  }

  return {
    setListenerDiagnostics(next: IntegrationListenerDiagnostics) {
      listener = next;
    },
    recordEvent(tool: string, status: SessionStatus, timestamp: number) {
      if (tool === "claude" || tool === "cursor" || tool === "codebuddy" || tool === "codex" || tool === "claude-internal" || tool === "codex-internal") {
        lastEvents.set(tool, { at: timestamp, status });
      }
    },
    getDiagnostics(): IntegrationDiagnostics {
      return {
        listener,
        runtime: {
          packaged: options.packaged,
          hookScriptsRoot: options.hookScriptsRoot,
          executablePath: options.execPath,
          executableLabel: formatExecutableLabel(options.packaged, options.execPath),
        },
        agents: [
          getAgentDiagnostics("claude"),
          getAgentDiagnostics("claude-internal"),
          getAgentDiagnostics("codex"),
          getAgentDiagnostics("codex-internal"),
          getAgentDiagnostics("cursor"),
          getAgentDiagnostics("codebuddy"),
        ],
      };
    },
    installHooks(agentId: IntegrationAgentId): IntegrationInstallResult {
      const hookCtx = integrationHookContext();
      let result: { changed: boolean; backupPath?: string };
      if (agentId === "claude") {
        result = installClaudeHooksFile(options.homeDir, hookCtx, now);
      } else if (agentId === "claude-internal") {
        result = installClaudeInternalHooksFile(options.homeDir, hookCtx, now);
      } else if (agentId === "cursor") {
        result = installCursorHooksFile(options.homeDir, hookCtx, now);
      } else if (agentId === "codebuddy") {
        result = installCodeBuddyHooksFile(options.homeDir, hookCtx, now);
      } else if (agentId === "codex-internal") {
        result = installCodexInternalHooksFile(options.homeDir, hookCtx, now);
      } else {
        result = installCodexHooksFile(options.homeDir, hookCtx, now);
      }

      const diagnostics = getAgentDiagnostics(agentId);
      return {
        agentId,
        configPath: diagnostics.configPath,
        changed: result.changed,
        hookInstalled: diagnostics.hookInstalled,
        health: diagnostics.health,
        backupPath: result.backupPath,
        message: diagnostics.hookInstalled
          ? result.changed
            ? `已写入 ${diagnostics.label} 配置`
            : `${diagnostics.label} 配置已是最新状态`
          : `${diagnostics.label} 配置未生效`,
        messageKey: diagnostics.hookInstalled
          ? result.changed
            ? "integration.install.written"
            : "integration.install.current"
          : "integration.install.notApplied",
        messageParams: { label: diagnostics.label },
        diagnostics,
      };
    },
  };
}
