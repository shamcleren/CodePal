import path from "node:path";
import fs from "node:fs";

export type HookCommandContext = {
  packaged: boolean;
  execPath: string;
  appPath: string;
};

/**
 * In dev mode `app.getAppPath()` returns `.../out/main` which is NOT a valid
 * Electron app root (no `package.json`).  Normalize to the project root.
 * If the result still has no `package.json`, return `undefined` so callers
 * can decide to skip rather than launching Electron into an error modal.
 */
export function normalizeAppPath(raw: string): string | undefined {
  let resolved = raw;
  // Strip trailing out/main (dev build artifact directory)
  if (/[/\\]out[/\\]main\/?$/.test(resolved)) {
    resolved = path.resolve(resolved, "..", "..");
  }
  // Validate: a usable Electron app root must contain package.json
  try {
    fs.accessSync(path.join(resolved, "package.json"), fs.constants.R_OK);
  } catch {
    return undefined;
  }
  return resolved;
}

function quoteArg(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function resolveHookCliPath(context: HookCommandContext): string {
  return path.join(context.appPath, "out", "main", "hook-cli.js");
}

function wrapElectronShellCommand(command: string): string {
  // Run hook commands through Electron's Node mode so high-frequency agent
  // hooks do not launch a GUI app process or flash the macOS Dock.
  return `/usr/bin/env ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 ${command}`;
}

function buildCodePalHookArgs(subcommand: string, eventSuffix?: string): string {
  const parts = ["--codepal-hook", subcommand];
  if (eventSuffix !== undefined) {
    parts.push(eventSuffix);
  }
  return parts.join(" ");
}

function buildCodePalHookArgv(subcommand: string, context: HookCommandContext): string[] {
  const executableArgs = [context.execPath, resolveHookCliPath(context)];
  return [...executableArgs, "--codepal-hook", subcommand];
}

function buildCodePalHookCommand(
  subcommand: string,
  context: HookCommandContext,
  eventSuffix?: string,
): string {
  return wrapElectronShellCommand(
    `${quoteArg(context.execPath)} ${quoteArg(resolveHookCliPath(context))} ${buildCodePalHookArgs(
      subcommand,
      eventSuffix,
    )}`,
  );
}

export function buildCursorHookCommand(context: HookCommandContext): string {
  return buildCodePalHookCommand("cursor", context);
}

export function buildCursorLifecycleHookCommand(
  eventName: string,
  context: HookCommandContext,
): string {
  return buildCodePalHookCommand("cursor-lifecycle", context, eventName);
}

export function buildCodeBuddyHookCommand(context: HookCommandContext): string {
  return buildCodePalHookCommand("codebuddy", context);
}

export function buildClaudeHookCommand(context: HookCommandContext): string {
  return buildCodePalHookCommand("claude", context);
}

export function buildClaudeStatusLineCommand(context: HookCommandContext): string {
  return buildCodePalHookCommand("claude-statusline", context);
}

export function buildCodexHookCommand(context: HookCommandContext): string {
  return buildCodePalHookCommand("codex", context);
}

export function buildCodexHookArgv(context: HookCommandContext): string[] {
  return buildCodePalHookArgv("codex", context);
}

export function detectLegacyHookCommand(command: string): boolean {
  if (/scripts\/hooks\/[^"'\s]+\.sh/.test(command)) {
    return true;
  }
  if (/\bnode\b/.test(command) && /scripts\/bridge\//.test(command) && /\.mjs\b/.test(command)) {
    return true;
  }
  return false;
}

export function detectCodePalHookCommand(command: string, hookName: string): boolean {
  return command.includes(`--codepal-hook ${hookName}`);
}
