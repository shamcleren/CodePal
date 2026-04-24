import fs from "node:fs";
import path from "node:path";
import type {
  IntegrationAgentDiagnostics,
  IntegrationAgentCheck,
  IntegrationAgentId,
  IntegrationDiagnostics,
  IntegrationHealth,
  IntegrationInstallResult,
  IntegrationListenerDiagnostics,
} from "../../shared/integrationTypes";
import {
  detectCodePalHookCommand,
  detectLegacyHookCommand,
  type HookCommandContext,
} from "../hook/commandBuilder";
import type { SessionStatus } from "../../shared/sessionTypes";
import {
  buildWrapperCommand,
  ensureAgentWrapperFiles,
  wrapperFilesExist,
  wrapperScriptPath,
  type WrappedAgentKind,
} from "./agentWrappers";

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
  qoder: "Qoder",
  qwen: "Qwen",
  factory: "Factory",
};

// Claude Code and its forks (Qoder / Qwen / Factory) share the hook schema.
// A ClaudeCompatibleAgentDef captures the per-agent divergences: config
// directory, wrapper kind, i18n message key prefix and whether the agent
// exposes a statusLine mechanism we can configure. install/inspect flows
// are parameterized by this def so the claude codepath doesn't need to be
// copy-pasted per fork.
type ClaudeCompatibleAgentDef = {
  id: Extract<IntegrationAgentId, "claude" | "qoder" | "qwen" | "factory">;
  label: string;
  configDir: string;
  wrapperKind: WrappedAgentKind;
  statusLineWrapperKind?: WrappedAgentKind;
  messageKeyPrefix: string;
};

const CLAUDE_COMPATIBLE_AGENTS: ClaudeCompatibleAgentDef[] = [
  {
    id: "claude",
    label: "Claude",
    configDir: ".claude",
    wrapperKind: "claude",
    statusLineWrapperKind: "claude-statusline",
    messageKeyPrefix: "integration.message.claude",
  },
  {
    id: "qoder",
    label: "Qoder",
    configDir: ".qoder",
    wrapperKind: "qoder",
    messageKeyPrefix: "integration.message.qoder",
  },
  {
    id: "qwen",
    label: "Qwen",
    configDir: ".qwen",
    wrapperKind: "qwen",
    messageKeyPrefix: "integration.message.qwen",
  },
  {
    id: "factory",
    label: "Factory",
    configDir: ".factory",
    wrapperKind: "factory",
    messageKeyPrefix: "integration.message.factory",
  },
];

const CLAUDE_DEF = CLAUDE_COMPATIBLE_AGENTS[0];

function claudeCompatAgentDef(
  agentId: IntegrationAgentId,
): ClaudeCompatibleAgentDef | undefined {
  return CLAUDE_COMPATIBLE_AGENTS.find((def) => def.id === agentId);
}

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

function isWrapperCommand(command: string, expectedCommand: string): boolean {
  return command === expectedCommand || command.includes(expectedCommand);
}

function commandTargetsCurrentCodePal(
  command: string,
  hookName: string,
  hookCtx: HookCommandContext,
  expectedWrapperCommand?: string,
): boolean {
  if (expectedWrapperCommand && isWrapperCommand(command, expectedWrapperCommand)) {
    return true;
  }
  if (!detectCodePalHookCommand(command, hookName)) {
    return false;
  }
  if (!command.includes(hookCtx.execPath)) {
    return false;
  }
  if (!hookCtx.packaged && !command.includes(hookCtx.appPath)) {
    return false;
  }
  return true;
}

function cursorHooksEmpty(hooks: Record<string, unknown>, eventNames: string[]): boolean {
  return eventNames.every((eventName) => {
    const value = hooks[eventName];
    return !Array.isArray(value) || value.length === 0;
  });
}

function isCodePalOwnedAgentCommand(
  command: string,
  hookName: string,
  expectedWrapperCommand?: string,
): boolean {
  if (expectedWrapperCommand && isWrapperCommand(command, expectedWrapperCommand)) {
    return true;
  }
  return detectCodePalHookCommand(command, hookName) || detectLegacyHookCommand(command);
}

function normalizeFlatCommandEntries(
  entries: unknown,
  hookName: string,
  desiredCommand: string,
): {
  entries: Array<Record<string, unknown>>;
  changed: boolean;
} {
  const nextEntries = Array.isArray(entries)
    ? entries.filter((entry): entry is Record<string, unknown> => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const command = String((entry as Record<string, unknown>).command ?? "");
        return !isCodePalOwnedAgentCommand(command, hookName, desiredCommand);
      })
    : [];

  const hasDesired = nextEntries.some((entry) => entry.command === desiredCommand);
  if (!hasDesired) {
    nextEntries.push({ command: desiredCommand });
  }

  const currentEntries = Array.isArray(entries)
    ? entries.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : [];

  const changed =
    currentEntries.length !== nextEntries.length ||
    currentEntries.some((entry, index) => entry.command !== nextEntries[index]?.command);

  return { entries: nextEntries, changed };
}

function normalizeCursorHookEntries(entries: unknown, desiredCommand: string): {
  entries: Array<Record<string, unknown>>;
  changed: boolean;
} {
  return normalizeFlatCommandEntries(entries, "cursor", desiredCommand);
}

function cursorConfigNeedsCleanup(
  homeDir: string,
  desiredCommand: string,
): boolean {
  const config = readOptionalJson(cursorConfigPath(homeDir));
  if (!config.parsed) {
    return false;
  }
  const hooksValue = config.parsed.hooks;
  if (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue)) {
    return false;
  }

  return CURSOR_HOOK_EVENT_NAMES.some((eventName) => {
    const normalized = normalizeCursorHookEntries(
      (hooksValue as Record<string, unknown>)[eventName],
      desiredCommand,
    );
    return normalized.changed;
  });
}

function nestedHooksConfigNeedsCleanup(
  configPath: string,
  entriesByEvent: Record<string, CodeBuddyRequiredEntry[]>,
  hookName: WrappedAgentKind,
): boolean {
  const config = readOptionalJson(configPath);
  if (!config.parsed) {
    return false;
  }
  const hooksValue = config.parsed.hooks;
  if (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue)) {
    return false;
  }

  return Object.entries(entriesByEvent).some(([eventName, requiredEntries]) =>
    requiredEntries.some((required) => {
      const normalized = normalizeNestedCommandEntries(
        (hooksValue as Record<string, unknown>)[eventName],
        required,
        hookName,
      );
      return normalized.changed;
    }),
  );
}

function codexConfigNeedsCleanup(homeDir: string): boolean {
  const config = readOptionalText(codexConfigPath(homeDir));
  if (config.error || config.text === undefined) {
    return false;
  }
  const notify = readCodexNotifyConfig(config.text);
  if (notify.kind !== "parsed") {
    return false;
  }
  const desiredArgv = [wrapperScriptPath(homeDir, "codex")];
  return !arraysEqual(notify.argv, desiredArgv) &&
    notify.argv.some((arg) => isCodePalOwnedAgentCommand(arg, "codex", desiredArgv[0]));
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

function claudeConfigPath(homeDir: string, def: ClaudeCompatibleAgentDef = CLAUDE_DEF): string {
  return path.join(homeDir, def.configDir, "settings.json");
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
  const desiredNotifyArgv = [wrapperScriptPath(homeDir, "codex")];
  const wrapperFilesReady = wrapperFilesExist(homeDir, ["codex"]);

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
                  commandTargetsCurrentCodePal(
                    String((hook as Record<string, unknown>).command ?? ""),
                    "codex",
                    hookCtx,
                    buildWrapperCommand(homeDir, "codex"),
                  ),
              )
            );
          })
        );
      });

      if (hasAnyHooks) {
        if (hasCodePalHooks) {
          health = "active";
          hookInstalled = true;
          statusMessage = "已接入 Codex";
          statusMessageKey = "integration.message.codex.active";
          if (sessionsExist) {
            statusMessage += "，并持续同步会话记录";
            statusMessageKey = "integration.message.codex.activeWithSessions";
          }
          displayPath = hooksPath;
        } else {
          health = "repair_needed";
          hookInstalled = false;
          statusMessage = "Codex hooks.json 与当前 CodePal 要求不一致";
          statusMessageKey = "integration.message.codex.mismatch";
          displayPath = hooksPath;
        }
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
    } else if (
      notify.kind === "parsed" &&
      arraysEqual(notify.argv, desiredNotifyArgv) &&
      wrapperFilesReady
    ) {
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

  const labels = labelsForHealth(health);
  const actionLabel = health === "active" && !hookInstalled ? "增强" : labels.actionLabel;
  const actionLabelKey =
    health === "active" && !hookInstalled
      ? "integration.action.enhance"
      : labels.actionLabelKey;

  return {
    id: "codex",
    label: AGENT_LABELS.codex,
    supported: true,
    configPath: displayPath,
    configExists: fs.existsSync(displayPath),
    hookScriptPath: displayPath,
    hookScriptExists: fs.existsSync(displayPath),
    hookInstalled,
    health,
    healthLabel: labels.healthLabel,
    healthLabelKey: labels.healthLabelKey,
    actionLabel,
    actionLabelKey,
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
  const wrapperFilesReady = wrapperFilesExist(homeDir, ["cursor"]);
  const wrapperCommand = buildWrapperCommand(homeDir, "cursor");
  const requiredNew = Object.fromEntries(
    CURSOR_HOOK_EVENT_NAMES.map((eventName) => [eventName, wrapperCommand]),
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
      const targetsCurrentCodePal = eventNames.every((eventName) => {
        const eventEntries = hooks[eventName];
        return (
          Array.isArray(eventEntries) &&
          eventEntries.some(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              commandTargetsCurrentCodePal(
                String((entry as Record<string, unknown>).command ?? ""),
                "cursor",
                hookCtx,
                wrapperCommand,
              ),
          )
        );
      });
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

      if ((hasNew && wrapperFilesReady) || targetsCurrentCodePal) {
        health = "active";
        hookInstalled = true;
        statusMessage = "已配置用户级 Cursor hooks";
        statusMessageKey = "integration.message.cursor.active";
      } else if (hasLegacy) {
        health = "legacy_path";
        hookInstalled = true;
        statusMessage = "检测到旧版 CodePal Cursor hook 命令，建议迁移";
        statusMessageKey = "integration.message.cursor.legacy";
      } else if (hasRecognizedCodePal || !hooksAreEmpty) {
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

function codeBuddyRequiredWrapperEntries(homeDir: string): CodeBuddyRequiredEntry[] {
  const command = buildWrapperCommand(homeDir, "codebuddy");
  return [
    { eventName: "SessionStart", command },
    { eventName: "UserPromptSubmit", command },
    { eventName: "SessionEnd", command },
    { eventName: "Notification", matcher: "permission_prompt", command },
    { eventName: "Notification", matcher: "idle_prompt", command },
  ];
}

function claudeRequiredEntriesForHome(
  homeDir: string,
  def: ClaudeCompatibleAgentDef = CLAUDE_DEF,
): ClaudeRequiredEntry[] {
  const command = buildWrapperCommand(homeDir, def.wrapperKind);
  return [
    { eventName: "SessionStart", matcher: "*", command },
    { eventName: "UserPromptSubmit", command },
    { eventName: "Notification", command },
    { eventName: "Stop", command },
    { eventName: "SessionEnd", command },
  ];
}

// Events that CodePal previously registered but no longer owns. On each
// install pass we strip any CodePal-owned entries under these keys so users
// who upgraded from <= v1.1.2 stop blocking Claude on PreToolUse.
const CLAUDE_DEPRECATED_EVENT_NAMES: readonly string[] = ["PreToolUse"];

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

function hasClaudeStatusLineForHome(config: Record<string, unknown>, homeDir: string): boolean {
  const command = readClaudeStatusLineCommand(config);
  if (!command) {
    return false;
  }
  const expected = buildWrapperCommand(homeDir, "claude-statusline");
  return isWrapperCommand(command, expected);
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

function normalizeNestedCommandEntries(
  entries: unknown,
  required: CodeBuddyRequiredEntry,
  hookName: WrappedAgentKind,
): {
  entries: Array<Record<string, unknown>>;
  changed: boolean;
} {
  const nextEntries = Array.isArray(entries)
    ? entries.filter((entry): entry is Record<string, unknown> => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const record = entry as Record<string, unknown>;
        if (required.matcher !== undefined && record.matcher !== required.matcher) {
          return true;
        }
        if (required.matcher === undefined && "matcher" in record && record.matcher !== undefined) {
          return true;
        }
        if (!Array.isArray(record.hooks)) {
          return true;
        }
        const remainingHooks = record.hooks.filter((hook): hook is Record<string, unknown> => {
          if (!hook || typeof hook !== "object") {
            return false;
          }
          const hookRecord = hook as Record<string, unknown>;
          if (hookRecord.type !== "command") {
            return true;
          }
          const command = String(hookRecord.command ?? "");
          return !isCodePalOwnedAgentCommand(command, hookName, required.command);
        });
        if (remainingHooks.length === 0) {
          return false;
        }
        record.hooks = remainingHooks;
        return true;
      })
    : [];

  if (!hasCodeBuddyHookEntry(nextEntries, required)) {
    nextEntries.push({
      ...(required.matcher !== undefined ? { matcher: required.matcher } : {}),
      hooks: [{ type: "command", command: required.command }],
    });
  }

  const currentJson = JSON.stringify(Array.isArray(entries) ? entries : []);
  const nextJson = JSON.stringify(nextEntries);
  return { entries: nextEntries, changed: currentJson !== nextJson };
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

function normalizeClaudeHookEntries(entries: unknown, required: ClaudeRequiredEntry): {
  entries: Array<Record<string, unknown>>;
  changed: boolean;
} {
  return normalizeNestedCommandEntries(entries, required, "claude");
}

function inspectClaudeConfig(
  homeDir: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
  def: ClaudeCompatibleAgentDef = CLAUDE_DEF,
): IntegrationAgentDiagnostics {
  const configPath = claudeConfigPath(homeDir, def);
  const config = readOptionalJson(configPath);
  const required = claudeRequiredEntriesForHome(homeDir, def);
  const wrapperKinds: WrappedAgentKind[] = def.statusLineWrapperKind
    ? [def.wrapperKind, def.statusLineWrapperKind]
    : [def.wrapperKind];
  const wrapperFilesReady = wrapperFilesExist(homeDir, wrapperKinds);
  const checksStatusLine = def.statusLineWrapperKind !== undefined;

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = `未配置 CodePal ${def.label} hooks`;
  let statusMessageKey = `${def.messageKeyPrefix}.notConfigured`;
  let checks: IntegrationAgentCheck[] | undefined;

  if (config.error) {
    health = "repair_needed";
    statusMessage = config.error;
  } else if (!config.exists) {
    health = "not_configured";
  } else if (config.parsed) {
    const hasStatusLine = checksStatusLine
      ? hasClaudeStatusLineForHome(config.parsed, homeDir) && wrapperFilesReady
      : true;
    const hooksValue = config.parsed.hooks;
    const hasMatchingHooks =
      hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)
        ? claudeHooksMatch(hooksValue as Record<string, unknown>, required) && wrapperFilesReady
        : false;
    checks = [
      {
        id: "hooks",
        label: "Hooks",
        labelKey: `integration.check.${def.id}.hooks`,
        ok: hasMatchingHooks,
        statusLabel: hasMatchingHooks ? "正常" : "异常",
        statusLabelKey: hasMatchingHooks ? "integration.check.ok" : "integration.check.error",
      },
      ...(checksStatusLine
        ? [
            {
              id: "statusLine",
              label: "StatusLine(quota)",
              labelKey: `integration.check.${def.id}.statusLine`,
              ok: hasStatusLine,
              statusLabel: hasStatusLine ? "正常" : "异常",
              statusLabelKey: hasStatusLine ? "integration.check.ok" : "integration.check.error",
            },
          ]
        : []),
    ];
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      if (claudeHooksMatch(hooks, required) && hasStatusLine) {
        health = "active";
        hookInstalled = true;
        statusMessage = checksStatusLine
          ? `已配置用户级 ${def.label} hooks 与 statusLine`
          : `已配置用户级 ${def.label} hooks`;
        statusMessageKey = `${def.messageKeyPrefix}.active`;
      } else if (claudeHooksMatch(hooks, required)) {
        health = "repair_needed";
        statusMessage = `${def.label} hooks 已配置，但缺少 CodePal statusLine`;
        statusMessageKey = `${def.messageKeyPrefix}.missingStatusLine`;
      } else if (!claudeHooksEmpty(hooks)) {
        health = "repair_needed";
        statusMessage = `${def.label} settings.json hooks 与当前 CodePal 要求不一致`;
        statusMessageKey = `${def.messageKeyPrefix}.mismatch`;
      } else if (hasStatusLine && checksStatusLine) {
        health = "repair_needed";
        statusMessage = `${def.label} statusLine 已配置，但 hooks 未完成`;
        statusMessageKey = `${def.messageKeyPrefix}.statusLineOnly`;
      }
    } else if (!("hooks" in config.parsed)) {
      health = hasStatusLine && checksStatusLine ? "repair_needed" : "not_configured";
      statusMessage =
        hasStatusLine && checksStatusLine
          ? `${def.label} statusLine 已配置，但 hooks 未完成`
          : statusMessage;
      statusMessageKey =
        hasStatusLine && checksStatusLine
          ? `${def.messageKeyPrefix}.statusLineOnly`
          : `${def.messageKeyPrefix}.notConfigured`;
    } else {
      health = "repair_needed";
      statusMessage = `${def.label} settings.json hooks 结构不兼容`;
      statusMessageKey = `${def.messageKeyPrefix}.invalid`;
    }
  }

  const { healthLabel, actionLabel, healthLabelKey, actionLabelKey } = labelsForHealth(health);
  return {
    id: def.id,
    label: AGENT_LABELS[def.id],
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
    ...(checks ? { checks } : {}),
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function isClaudeAutoMigrateCandidate(homeDir: string): boolean {
  const config = readOptionalJson(claudeConfigPath(homeDir));
  if (!config.parsed) {
    return false;
  }

  const wrapperFilesReady = wrapperFilesExist(homeDir, ["claude", "claude-statusline"]);
  const hasWrapperStatusLine =
    hasClaudeStatusLineForHome(config.parsed, homeDir) && wrapperFilesReady;
  const hooksValue = config.parsed.hooks;
  const hasWrapperHooks =
    hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)
      ? claudeHooksMatch(
          hooksValue as Record<string, unknown>,
          claudeRequiredEntriesForHome(homeDir),
        ) && wrapperFilesReady
      : false;
  if (hasWrapperHooks && hasWrapperStatusLine) {
    return false;
  }

  const hasOldCodePalStatusLine = Boolean(
    readClaudeStatusLineCommand(config.parsed) &&
      commandContainsCodePalSubcommand(
        readClaudeStatusLineCommand(config.parsed) ?? "",
        "claude-statusline",
      ),
  );

  const hasOldCodePalHooks =
    hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)
      ? claudeRequiredEntriesForHome(homeDir).every((requiredEntry) => {
          const entries = (hooksValue as Record<string, unknown>)[requiredEntry.eventName];
          if (!Array.isArray(entries)) {
            return false;
          }
          return entries.some((entry) => {
            if (!entry || typeof entry !== "object") return false;
            const record = entry as Record<string, unknown>;
            if (requiredEntry.matcher !== undefined && record.matcher !== requiredEntry.matcher) {
              return false;
            }
            if (requiredEntry.matcher === undefined && "matcher" in record && record.matcher !== undefined) {
              return false;
            }
            if (!Array.isArray(record.hooks)) return false;
            return record.hooks.some(
              (hook) =>
                hook &&
                typeof hook === "object" &&
                (hook as Record<string, unknown>).type === "command" &&
                detectCodePalHookCommand(
                  String((hook as Record<string, unknown>).command ?? ""),
                  "claude",
                ),
            );
          });
        })
      : false;

  return hasOldCodePalHooks || hasOldCodePalStatusLine;
}

function codeBuddyConfigNeedsCleanup(homeDir: string): boolean {
  const required = codeBuddyRequiredWrapperEntries(homeDir);
  const entriesByEvent = Object.fromEntries(
    required.map((entry) => [entry.eventName, required.filter((item) => item.eventName === entry.eventName)]),
  ) as Record<string, CodeBuddyRequiredEntry[]>;
  return nestedHooksConfigNeedsCleanup(codeBuddyConfigPath(homeDir), entriesByEvent, "codebuddy");
}

function claudeConfigNeedsCleanup(
  homeDir: string,
  def: ClaudeCompatibleAgentDef = CLAUDE_DEF,
): boolean {
  const required = claudeRequiredEntriesForHome(homeDir, def);
  const entriesByEvent = Object.fromEntries(
    required.map((entry) => [entry.eventName, required.filter((item) => item.eventName === entry.eventName)]),
  ) as Record<string, CodeBuddyRequiredEntry[]>;
  if (nestedHooksConfigNeedsCleanup(claudeConfigPath(homeDir, def), entriesByEvent, def.wrapperKind)) {
    return true;
  }
  if (def.id === "claude") {
    return claudeDeprecatedEntriesPresent(homeDir);
  }
  return false;
}

function claudeDeprecatedEntriesPresent(homeDir: string): boolean {
  const config = readOptionalJson(claudeConfigPath(homeDir));
  if (!config.parsed) {
    return false;
  }
  const hooksValue = config.parsed.hooks;
  if (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue)) {
    return false;
  }
  const hooks = hooksValue as Record<string, unknown>;
  return CLAUDE_DEPRECATED_EVENT_NAMES.some((eventName) => {
    const stripped = stripCodePalOwnedNestedEntries(hooks[eventName], "claude");
    return stripped.changed;
  });
}

function stripCodePalOwnedNestedEntries(
  entries: unknown,
  hookName: WrappedAgentKind,
): { entries: Array<Record<string, unknown>>; changed: boolean } {
  if (!Array.isArray(entries)) {
    return { entries: [], changed: false };
  }
  const nextEntries = entries
    .map((entry): Record<string, unknown> | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (!Array.isArray(record.hooks)) {
        return record;
      }
      const remainingHooks = record.hooks.filter((hook) => {
        if (!hook || typeof hook !== "object") return true;
        const hookRecord = hook as Record<string, unknown>;
        if (hookRecord.type !== "command") return true;
        const command = String(hookRecord.command ?? "");
        return !isCodePalOwnedAgentCommand(command, hookName);
      });
      if (remainingHooks.length === 0) {
        return null;
      }
      return { ...record, hooks: remainingHooks };
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  const currentJson = JSON.stringify(entries);
  const nextJson = JSON.stringify(nextEntries);
  return { entries: nextEntries, changed: currentJson !== nextJson };
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
  const requiredNew = codeBuddyRequiredWrapperEntries(homeDir);
  const requiredLegacy = codeBuddyRequiredEntries(hookScriptPath);
  const wrapperFilesReady = wrapperFilesExist(homeDir, ["codebuddy"]);

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

      if (hasNew && wrapperFilesReady) {
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
  ensureAgentWrapperFiles(homeDir, hookCtx);
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
    CURSOR_HOOK_EVENT_NAMES.map((eventName) => [eventName, buildWrapperCommand(homeDir, "cursor")]),
  ) as Record<string, string>;

  let changed = current.exists === false;

  for (const [eventName, command] of Object.entries(requiredCommands)) {
    const existingEntries = hooks[eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`Cursor hooks.json 中 ${eventName} 不是数组`);
    }
    const normalized = normalizeCursorHookEntries(existingEntries, command);
    if (normalized.changed) {
      changed = true;
    }
    hooks[eventName] = normalized.entries;
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
  const wrapperResult = ensureAgentWrapperFiles(homeDir, hookCtx);
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

  let changed = current.exists === false || wrapperResult.changed;

  for (const required of codeBuddyRequiredWrapperEntries(homeDir)) {
    const existingEntries = hooks[required.eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`CodeBuddy hooks.${required.eventName} 不是数组`);
    }
    const normalized = normalizeNestedCommandEntries(existingEntries, required, "codebuddy");
    if (normalized.changed) {
      changed = true;
    }
    hooks[required.eventName] = normalized.entries;
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
  def: ClaudeCompatibleAgentDef = CLAUDE_DEF,
): { changed: boolean; backupPath?: string } {
  const wrapperResult = ensureAgentWrapperFiles(homeDir, hookCtx);
  const configPath = claudeConfigPath(homeDir, def);
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
    throw new Error(`${def.label} settings.json hooks 结构不兼容`);
  }
  const hooks = hooksValue ? ({ ...hooksValue } as Record<string, unknown>) : {};

  let changed = current.exists === false || wrapperResult.changed;

  for (const required of claudeRequiredEntriesForHome(homeDir, def)) {
    const existingEntries = hooks[required.eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`${def.label} hooks.${required.eventName} 不是数组`);
    }
    const normalized = normalizeClaudeHookEntries(existingEntries, required);
    if (normalized.changed) {
      changed = true;
    }
    hooks[required.eventName] = normalized.entries;
  }

  for (const eventName of CLAUDE_DEPRECATED_EVENT_NAMES) {
    if (!(eventName in hooks)) continue;
    const existingEntries = hooks[eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) continue;
    const stripped = stripCodePalOwnedNestedEntries(existingEntries, def.wrapperKind);
    if (!stripped.changed) continue;
    changed = true;
    if (stripped.entries.length === 0) {
      delete hooks[eventName];
    } else {
      hooks[eventName] = stripped.entries;
    }
  }

  next.hooks = hooks;

  if (def.statusLineWrapperKind) {
    const desiredStatusLineCommand = buildWrapperCommand(homeDir, def.statusLineWrapperKind);
    const existingStatusLineCommand = readClaudeStatusLineCommand(next);
    if (!existingStatusLineCommand) {
      next.statusLine = {
        type: "command",
        command: desiredStatusLineCommand,
      };
      changed = true;
    } else if (existingStatusLineCommand === desiredStatusLineCommand) {
      // already current
    } else if (commandContainsCodePalSubcommand(existingStatusLineCommand, def.statusLineWrapperKind)) {
      next.statusLine = {
        type: "command",
        command: desiredStatusLineCommand,
      };
      changed = true;
    } else {
      next.statusLine = {
        type: "command",
        command: buildChainedClaudeStatusLineCommand(
          existingStatusLineCommand,
          desiredStatusLineCommand,
        ),
      };
      changed = true;
    }
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
  const wrapperResult = ensureAgentWrapperFiles(homeDir, hookCtx);
  const configPath = codexConfigPath(homeDir);
  const current = readOptionalText(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const next = upsertCodexNotifyConfig(current.text ?? "", [wrapperScriptPath(homeDir, "codex")]);
  let backupPath: string | undefined;

  if (next.changed || wrapperResult.changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, next.text);
  }

  return { changed: next.changed || wrapperResult.changed, backupPath };
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
    const compatDef = claudeCompatAgentDef(agentId);
    if (compatDef) {
      return inspectClaudeConfig(options.homeDir, hookCtx, lastEvents.get(agentId), compatDef);
    }
    if (agentId === "codex") {
      return inspectCodexConfig(options.homeDir, hookCtx, lastEvents.get(agentId));
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
      if (
        tool === "claude" ||
        tool === "cursor" ||
        tool === "codebuddy" ||
        tool === "codex" ||
        tool === "qoder" ||
        tool === "qwen" ||
        tool === "factory"
      ) {
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
          getAgentDiagnostics("codex"),
          getAgentDiagnostics("cursor"),
          getAgentDiagnostics("codebuddy"),
          getAgentDiagnostics("qoder"),
          getAgentDiagnostics("qwen"),
          getAgentDiagnostics("factory"),
        ],
      };
    },
    installHooks(agentId: IntegrationAgentId): IntegrationInstallResult {
      const hookCtx = integrationHookContext();
      const compatDef = claudeCompatAgentDef(agentId);
      const result = compatDef
        ? installClaudeHooksFile(options.homeDir, hookCtx, now, compatDef)
        : agentId === "cursor"
          ? installCursorHooksFile(options.homeDir, hookCtx, now)
          : agentId === "codebuddy"
            ? installCodeBuddyHooksFile(options.homeDir, hookCtx, now)
            : installCodexHooksFile(options.homeDir, hookCtx, now);

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
    autoInstallMissingSupportedHooks(): IntegrationInstallResult[] {
      const results: IntegrationInstallResult[] = [];
      for (const agentId of [
        "claude",
        "cursor",
        "codebuddy",
        "codex",
        "qoder",
        "qwen",
        "factory",
      ] as const) {
        const diagnostics = getAgentDiagnostics(agentId);
        const desiredWrapperCommand = agentId === "cursor" ? buildWrapperCommand(options.homeDir, "cursor") : "";
        const forkDef = claudeCompatAgentDef(agentId);
        const isFork = forkDef !== undefined && forkDef.id !== "claude";
        // Forks: only auto-install when the user has installed the tool
        // (config dir exists). Otherwise skip to avoid creating empty
        // settings for tools the user doesn't have.
        const forkDirExists =
          !isFork || (forkDef ? fs.existsSync(path.join(options.homeDir, forkDef.configDir)) : false);
        const shouldInstall =
          diagnostics.supported &&
          forkDirExists &&
          (diagnostics.health === "not_configured" ||
            diagnostics.health === "legacy_path" ||
            (agentId === "claude" &&
              diagnostics.health === "repair_needed" &&
              (isClaudeAutoMigrateCandidate(options.homeDir) ||
                claudeConfigNeedsCleanup(options.homeDir))) ||
            (agentId === "claude" &&
              diagnostics.health === "active" &&
              claudeDeprecatedEntriesPresent(options.homeDir)) ||
            (isFork &&
              diagnostics.health === "repair_needed" &&
              forkDef &&
              claudeConfigNeedsCleanup(options.homeDir, forkDef)) ||
            (agentId === "cursor" &&
              cursorConfigNeedsCleanup(options.homeDir, desiredWrapperCommand)) ||
            (agentId === "codebuddy" &&
              diagnostics.health === "repair_needed" &&
              codeBuddyConfigNeedsCleanup(options.homeDir)) ||
            (agentId === "codex" &&
              diagnostics.health === "repair_needed" &&
              codexConfigNeedsCleanup(options.homeDir)));
        if (!shouldInstall) {
          continue;
        }
        results.push(this.installHooks(agentId));
      }
      return results;
    },
  };
}
