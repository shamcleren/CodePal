import type { TerminalContext } from "../../shared/sessionTypes";

const ENV_KEYS = {
  tty: "CODEPAL_TERM_TTY",
  termProgram: "CODEPAL_TERM_APP",
  itermSessionId: "CODEPAL_TERM_ITERM_SESSION_ID",
  tmux: "CODEPAL_TERM_TMUX",
  tmuxPane: "CODEPAL_TERM_TMUX_PANE",
  ghosttyResourcesDir: "CODEPAL_TERM_GHOSTTY_RESOURCES_DIR",
  kittyWindowId: "CODEPAL_TERM_KITTY_WINDOW_ID",
  weztermPane: "CODEPAL_TERM_WEZTERM_PANE",
  zellij: "CODEPAL_TERM_ZELLIJ",
  warp: "CODEPAL_TERM_WARP",
  windowTitle: "CODEPAL_TERM_TITLE",
} as const;

function takeNonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * macOS `ps -o tty=` typically returns `s001` without the `/dev/tty` prefix.
 * Normalize to an absolute device path so downstream AppleScript / open(1)
 * integrations can match without guessing. Already-absolute paths pass through.
 */
export function normalizeTtyPath(raw: string | undefined): string | undefined {
  const value = takeNonEmpty(raw);
  if (!value) return undefined;
  if (value === "?" || value === "??") return undefined;
  if (value.startsWith("/dev/")) return value;
  if (value.startsWith("tty")) return `/dev/${value}`;
  return `/dev/tty${value}`;
}

function parseTmuxSocket(tmuxEnv: string | undefined): string | undefined {
  const value = takeNonEmpty(tmuxEnv);
  if (!value) return undefined;
  const commaIdx = value.indexOf(",");
  return commaIdx >= 0 ? value.slice(0, commaIdx) : value;
}

function deriveApp(raw: {
  termProgram?: string;
  ghostty?: string;
  kitty?: string;
  wezterm?: string;
  warp?: string;
  zellij?: string;
  tmux?: string;
}): string | undefined {
  const tp = takeNonEmpty(raw.termProgram);
  if (tp) {
    const lowered = tp.toLowerCase();
    if (lowered.includes("iterm")) return "iTerm.app";
    if (lowered === "apple_terminal") return "Terminal";
    if (lowered === "ghostty") return "ghostty";
    if (lowered === "vscode") return "vscode";
    if (lowered === "warpterminal" || lowered === "warp") return "warp";
    if (lowered === "wezterm") return "wezterm";
    if (lowered === "kitty") return "kitty";
    return tp;
  }
  if (takeNonEmpty(raw.ghostty)) return "ghostty";
  if (takeNonEmpty(raw.kitty)) return "kitty";
  if (takeNonEmpty(raw.wezterm)) return "wezterm";
  if (takeNonEmpty(raw.warp)) return "warp";
  if (takeNonEmpty(raw.zellij)) return "zellij";
  if (takeNonEmpty(raw.tmux)) return "tmux";
  return undefined;
}

export function readTerminalContextFromEnv(
  env: NodeJS.ProcessEnv,
): TerminalContext | undefined {
  const tty = normalizeTtyPath(env[ENV_KEYS.tty]);
  const termProgram = takeNonEmpty(env[ENV_KEYS.termProgram]);
  const itermSessionId = takeNonEmpty(env[ENV_KEYS.itermSessionId]);
  const tmuxRaw = takeNonEmpty(env[ENV_KEYS.tmux]);
  const tmuxPane = takeNonEmpty(env[ENV_KEYS.tmuxPane]);
  const ghosttyResources = takeNonEmpty(env[ENV_KEYS.ghosttyResourcesDir]);
  const kittyWindow = takeNonEmpty(env[ENV_KEYS.kittyWindowId]);
  const weztermPane = takeNonEmpty(env[ENV_KEYS.weztermPane]);
  const zellij = takeNonEmpty(env[ENV_KEYS.zellij]);
  const warp = takeNonEmpty(env[ENV_KEYS.warp]);
  const windowTitle = takeNonEmpty(env[ENV_KEYS.windowTitle]);

  const app = deriveApp({
    termProgram,
    ghostty: ghosttyResources,
    kitty: kittyWindow,
    wezterm: weztermPane,
    warp,
    zellij,
    tmux: tmuxRaw,
  });
  const tmuxSocket = parseTmuxSocket(tmuxRaw);
  // Ghostty does not expose a per-pane id via env today — leave terminalSessionId empty
  // unless iTerm2 (or future terminals) gave us one.
  const terminalSessionId = itermSessionId;

  const result: TerminalContext = {};
  if (app) result.app = app;
  if (tty) result.tty = tty;
  if (terminalSessionId) result.terminalSessionId = terminalSessionId;
  if (tmuxPane) result.tmuxPane = tmuxPane;
  if (tmuxSocket && tmuxPane) result.tmuxSocket = tmuxSocket;
  if (windowTitle) result.windowTitle = windowTitle;

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Stamp a TerminalContext onto a JSON event line's `meta.terminal`. If the
 * input is not a parseable object, returns the original line unchanged — hooks
 * must never fail just because terminal capture is missing.
 */
export function stampTerminalMetaOnEventLine(
  line: string,
  context: TerminalContext | undefined,
): string {
  if (!context) return line;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return line;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return line;
  }
  const record = parsed as Record<string, unknown>;
  const existingMeta =
    record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
      ? (record.meta as Record<string, unknown>)
      : {};
  const merged = {
    ...record,
    meta: {
      ...existingMeta,
      terminal: context,
    },
  };
  return JSON.stringify(merged);
}

export const TERMINAL_META_ENV_KEYS = ENV_KEYS;
