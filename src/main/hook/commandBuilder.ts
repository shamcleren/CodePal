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

function wrapElectronShellCommand(command: string): string {
  return `/usr/bin/env -u ELECTRON_RUN_AS_NODE ${command}`;
}

function buildCodePalHookArgs(subcommand: string, eventSuffix?: string): string {
  const parts = ["--codepal-hook", subcommand];
  if (eventSuffix !== undefined) {
    parts.push(eventSuffix);
  }
  return parts.join(" ");
}

function buildCodePalHookArgv(subcommand: string, context: HookCommandContext): string[] {
  const executableArgs = context.packaged ? [context.execPath] : [context.execPath, context.appPath];
  return [...executableArgs, "--codepal-hook", subcommand];
}

export function buildCursorHookCommand(context: HookCommandContext): string {
  const hookArgs = buildCodePalHookArgs("cursor");
  if (context.packaged) {
    return wrapElectronShellCommand(`${quoteArg(context.execPath)} ${hookArgs}`);
  }
  return wrapElectronShellCommand(
    `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`,
  );
}

export function buildCursorLifecycleHookCommand(
  eventName: string,
  context: HookCommandContext,
): string {
  const hookArgs = buildCodePalHookArgs("cursor-lifecycle", eventName);
  if (context.packaged) {
    return wrapElectronShellCommand(`${quoteArg(context.execPath)} ${hookArgs}`);
  }
  return wrapElectronShellCommand(
    `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`,
  );
}

export function buildCodeBuddyHookCommand(context: HookCommandContext): string {
  const hookArgs = buildCodePalHookArgs("codebuddy");
  if (context.packaged) {
    return wrapElectronShellCommand(`${quoteArg(context.execPath)} ${hookArgs}`);
  }
  return wrapElectronShellCommand(
    `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`,
  );
}

export function buildClaudeHookCommand(context: HookCommandContext): string {
  const hookArgs = buildCodePalHookArgs("claude");
  if (context.packaged) {
    return wrapElectronShellCommand(`${quoteArg(context.execPath)} ${hookArgs}`);
  }
  return wrapElectronShellCommand(
    `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`,
  );
}

export function buildClaudeStatusLineCommand(context: HookCommandContext): string {
  const hookArgs = buildCodePalHookArgs("claude-statusline");
  if (context.packaged) {
    return wrapElectronShellCommand(`${quoteArg(context.execPath)} ${hookArgs}`);
  }
  return wrapElectronShellCommand(
    `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`,
  );
}

export function buildCodexHookCommand(context: HookCommandContext): string {
  const hookArgs = buildCodePalHookArgs("codex");
  if (context.packaged) {
    return wrapElectronShellCommand(`${quoteArg(context.execPath)} ${hookArgs}`);
  }
  return wrapElectronShellCommand(
    `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`,
  );
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
