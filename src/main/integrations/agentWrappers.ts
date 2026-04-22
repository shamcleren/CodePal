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
    'CODEPAL_PACKAGED="${CODEPAL_PACKAGED:-}"',
    'CODEPAL_EXEC_PATH="${CODEPAL_EXEC_PATH:-}"',
    'CODEPAL_APP_PATH="${CODEPAL_APP_PATH:-}"',
    'if [ -f "$RUNTIME_ENV" ]; then',
    '  . "$RUNTIME_ENV"',
    "fi",
    // Capture terminal metadata before exec. The wrapper's stdin is a pipe
    // from the agent, so `tty` on stdin won't resolve — use `ps` against the
    // parent (agent) process instead, which inherits the controlling TTY from
    // the originating terminal. All values are passed via CODEPAL_TERM_* env
    // vars; normalization / fallback handling lives in hook-cli side so this
    // script stays POSIX-portable.
    'CODEPAL_TERM_TTY=$(ps -o tty= -p "$PPID" 2>/dev/null | tr -d " ")',
    'CODEPAL_TERM_APP="${TERM_PROGRAM:-}"',
    'CODEPAL_TERM_ITERM_SESSION_ID="${ITERM_SESSION_ID:-}"',
    'CODEPAL_TERM_TMUX="${TMUX:-}"',
    'CODEPAL_TERM_TMUX_PANE="${TMUX_PANE:-}"',
    'CODEPAL_TERM_GHOSTTY_RESOURCES_DIR="${GHOSTTY_RESOURCES_DIR:-}"',
    'CODEPAL_TERM_KITTY_WINDOW_ID="${KITTY_WINDOW_ID:-}"',
    'CODEPAL_TERM_WEZTERM_PANE="${WEZTERM_PANE:-}"',
    'CODEPAL_TERM_ZELLIJ="${ZELLIJ:-}"',
    'CODEPAL_TERM_WARP="${WARP_IS_LOCAL_SHELL_SESSION:-}"',
    "export CODEPAL_TERM_TTY CODEPAL_TERM_APP CODEPAL_TERM_ITERM_SESSION_ID CODEPAL_TERM_TMUX CODEPAL_TERM_TMUX_PANE CODEPAL_TERM_GHOSTTY_RESOURCES_DIR CODEPAL_TERM_KITTY_WINDOW_ID CODEPAL_TERM_WEZTERM_PANE CODEPAL_TERM_ZELLIJ CODEPAL_TERM_WARP",
    // Packaged mode: execPath alone is enough
    'if [ "$CODEPAL_PACKAGED" = "1" ] && [ -n "$CODEPAL_EXEC_PATH" ] && [ -x "$CODEPAL_EXEC_PATH" ]; then',
    `  exec /usr/bin/env -u ELECTRON_RUN_AS_NODE NODE_NO_WARNINGS=1 "$CODEPAL_EXEC_PATH" --codepal-hook ${kind}`,
    "fi",
    // Dev mode: appPath must be a valid Electron app root (has package.json).
    // If out/main was written, normalize to project root.
    'if [ "$CODEPAL_PACKAGED" != "1" ] && [ -n "$CODEPAL_EXEC_PATH" ] && [ -x "$CODEPAL_EXEC_PATH" ] && [ -n "$CODEPAL_APP_PATH" ]; then',
    '  case "$CODEPAL_APP_PATH" in',
    "    */out/main) CODEPAL_APP_PATH=$(cd \"$CODEPAL_APP_PATH/../..\" 2>/dev/null && pwd) ;;",
    "  esac",
    '  if [ -f "$CODEPAL_APP_PATH/package.json" ]; then',
    `    exec /usr/bin/env -u ELECTRON_RUN_AS_NODE NODE_NO_WARNINGS=1 "$CODEPAL_EXEC_PATH" "$CODEPAL_APP_PATH" --codepal-hook ${kind}`,
    "  fi",
    "fi",
    // No valid path found — exit silently so the agent falls back to its native flow.
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
