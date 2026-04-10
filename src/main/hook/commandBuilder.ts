export type HookCommandContext = {
  packaged: boolean;
  execPath: string;
  appPath: string;
};

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
