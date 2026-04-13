import fs from "node:fs";
import path from "node:path";
import type { HookCommandContext } from "../hook/commandBuilder";

export type WrappedAgentKind =
  | "cursor"
  | "codebuddy"
  | "codex"
  | "claude"
  | "claude-statusline";

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function codePalWrapperPaths(homeDir: string) {
  const binDir = path.join(homeDir, ".codepal", "bin");
  const runtimeDir = path.join(homeDir, ".codepal", "runtime");
  return {
    binDir,
    runtimeDir,
    runtimeEnvPath: path.join(runtimeDir, "active-codepal.env"),
  };
}

export function wrapperScriptPath(homeDir: string, kind: WrappedAgentKind): string {
  const { binDir } = codePalWrapperPaths(homeDir);
  switch (kind) {
    case "cursor":
      return path.join(binDir, "cursor-hook");
    case "codebuddy":
      return path.join(binDir, "codebuddy-hook");
    case "codex":
      return path.join(binDir, "codex-hook");
    case "claude":
      return path.join(binDir, "claude-hook");
    case "claude-statusline":
      return path.join(binDir, "claude-statusline");
  }
}

export function buildWrapperCommand(homeDir: string, kind: WrappedAgentKind): string {
  return `"${wrapperScriptPath(homeDir, kind)}"`;
}

function wrapperScriptBody(kind: WrappedAgentKind, runtimeEnvPath: string): string {
  return [
    "#!/bin/sh",
    `RUNTIME_ENV=${shellSingleQuote(runtimeEnvPath)}`,
    'FALLBACK_EXEC="/Applications/CodePal.app/Contents/MacOS/CodePal"',
    'CODEPAL_PACKAGED="${CODEPAL_PACKAGED:-}"',
    'CODEPAL_EXEC_PATH="${CODEPAL_EXEC_PATH:-}"',
    'CODEPAL_APP_PATH="${CODEPAL_APP_PATH:-}"',
    'if [ -f "$RUNTIME_ENV" ]; then',
    '  . "$RUNTIME_ENV"',
    "fi",
    'if [ "$CODEPAL_PACKAGED" = "1" ] && [ -n "$CODEPAL_EXEC_PATH" ] && [ -x "$CODEPAL_EXEC_PATH" ]; then',
    `  exec /usr/bin/env -u ELECTRON_RUN_AS_NODE "$CODEPAL_EXEC_PATH" --codepal-hook ${kind}`,
    "fi",
    'if [ "$CODEPAL_PACKAGED" != "1" ] && [ -n "$CODEPAL_EXEC_PATH" ] && [ -x "$CODEPAL_EXEC_PATH" ] && [ -n "$CODEPAL_APP_PATH" ] && [ -d "$CODEPAL_APP_PATH" ]; then',
    `  exec /usr/bin/env -u ELECTRON_RUN_AS_NODE "$CODEPAL_EXEC_PATH" "$CODEPAL_APP_PATH" --codepal-hook ${kind}`,
    "fi",
    'if [ -x "$FALLBACK_EXEC" ]; then',
    `  exec /usr/bin/env -u ELECTRON_RUN_AS_NODE "$FALLBACK_EXEC" --codepal-hook ${kind}`,
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

function runtimeEnvBody(context: HookCommandContext): string {
  return [
    `CODEPAL_PACKAGED=${context.packaged ? "1" : "0"}`,
    `CODEPAL_EXEC_PATH=${shellSingleQuote(context.execPath)}`,
    `CODEPAL_APP_PATH=${shellSingleQuote(context.appPath)}`,
    "",
  ].join("\n");
}

function writeFileIfChanged(filePath: string, contents: string, mode?: number): boolean {
  try {
    const current = fs.readFileSync(filePath, "utf8");
    if (current === contents) {
      if (mode !== undefined) {
        fs.chmodSync(filePath, mode);
      }
      return false;
    }
  } catch {
    // Missing or unreadable files are treated as needing a rewrite.
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
  if (mode !== undefined) {
    fs.chmodSync(filePath, mode);
  }
  return true;
}

const ALL_WRAPPED_AGENTS: WrappedAgentKind[] = [
  "cursor",
  "codebuddy",
  "codex",
  "claude",
  "claude-statusline",
];

export function ensureAgentWrapperFiles(
  homeDir: string,
  context: HookCommandContext,
): { changed: boolean } {
  const paths = codePalWrapperPaths(homeDir);
  let changed = false;
  changed = writeFileIfChanged(paths.runtimeEnvPath, runtimeEnvBody(context), 0o644) || changed;
  for (const kind of ALL_WRAPPED_AGENTS) {
    changed =
      writeFileIfChanged(
        wrapperScriptPath(homeDir, kind),
        wrapperScriptBody(kind, paths.runtimeEnvPath),
        0o755,
      ) || changed;
  }
  return { changed };
}

export function wrapperFilesExist(
  homeDir: string,
  kinds: WrappedAgentKind[],
): boolean {
  const { runtimeEnvPath } = codePalWrapperPaths(homeDir);
  return fs.existsSync(runtimeEnvPath) && kinds.every((kind) => fs.existsSync(wrapperScriptPath(homeDir, kind)));
}
