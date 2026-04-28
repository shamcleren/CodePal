import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SessionJumpTarget } from "../../shared/sessionTypes";

const execFileAsyncDefault = promisify(execFile);

export type ExecFileLike = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

export type SessionJumpResult =
  | { ok: true; mode: "precise" | "activate_app" }
  | { ok: false; error: string };

export type SessionJumpService = {
  jumpTo(target: SessionJumpTarget): Promise<SessionJumpResult>;
};

type SessionJumpServiceDeps = {
  findWindow?: (target: SessionJumpTarget) => Promise<boolean>;
  activateApp?: (appName: string, workspacePath?: string) => Promise<boolean>;
  execFileImpl?: ExecFileLike;
};

async function execQuiet(exec: ExecFileLike, file: string, args: readonly string[]): Promise<boolean> {
  try {
    await exec(file, args);
    return true;
  } catch {
    return false;
  }
}

async function focusTmuxPane(target: SessionJumpTarget, exec: ExecFileLike): Promise<boolean> {
  const pane = target.tmuxPane;
  if (!pane) return false;

  const env = target.tmuxSocket ? ["-S", target.tmuxSocket] : [];
  // `switch-client -t <pane>` moves the attached client to the pane's session/window/pane.
  // When no client is attached (e.g. tmux running in detached state), it fails — which is
  // fine, we drop to the next strategy.
  if (!(await execQuiet(exec, "tmux", [...env, "switch-client", "-t", pane]))) {
    return false;
  }
  // Best-effort: also select the target window so the pane is frontmost in its window.
  await execQuiet(exec, "tmux", [...env, "select-window", "-t", pane]);
  return true;
}

function shellEscapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function focusITerm2Session(target: SessionJumpTarget, exec: ExecFileLike): Promise<boolean> {
  const sid = target.terminalSessionId;
  if (!sid) return false;
  const script = `
tell application "iTerm"
  activate
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s as string is "${shellEscapeAppleScriptString(sid)}" then
          select s
          select t
          set index of w to 1
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;
  return execQuiet(exec, "osascript", ["-e", script]);
}

async function focusWezTermPane(target: SessionJumpTarget, exec: ExecFileLike): Promise<boolean> {
  const pane = target.weztermPane;
  if (!pane) return false;
  // `wezterm cli activate-pane --pane-id <id>` brings WezTerm forward and
  // focuses the matching pane. WezTerm itself doesn't get app-activated by
  // this call on macOS, so follow up with osascript to ensure it's frontmost.
  if (!(await execQuiet(exec, "wezterm", ["cli", "activate-pane", "--pane-id", pane]))) {
    return false;
  }
  await execQuiet(exec, "osascript", ["-e", `tell application "WezTerm" to activate`]);
  return true;
}

async function focusKittyWindow(target: SessionJumpTarget, exec: ExecFileLike): Promise<boolean> {
  const id = target.kittyWindow;
  if (!id) return false;
  // Requires `allow_remote_control yes` (or `socket-only`) in the user's
  // kitty.conf — without it the call returns non-zero and we fall through.
  if (!(await execQuiet(exec, "kitten", ["@", "focus-window", "--match", `id:${id}`]))) {
    return false;
  }
  await execQuiet(exec, "osascript", ["-e", `tell application "kitty" to activate`]);
  return true;
}

async function focusGhosttySession(target: SessionJumpTarget, exec: ExecFileLike): Promise<boolean> {
  // Ghostty's AppleScript surface is minimal — it exposes "activate" but no
  // per-tab / per-session selection as of v1.x. Best-effort: bring the app
  // forward. Tab-level selection would require AX APIs and is deferred.
  if (target.appName !== "Ghostty" && target.appName !== "ghostty") return false;
  return execQuiet(exec, "osascript", ["-e", `tell application "Ghostty" to activate`]);
}

async function focusTerminalAppByTty(target: SessionJumpTarget, exec: ExecFileLike): Promise<boolean> {
  const tty = target.tty;
  if (!tty) return false;
  // Find the Terminal.app window/tab whose tty matches, then select it.
  const script = `
tell application "Terminal"
  activate
  repeat with w in windows
    repeat with t in tabs of w
      if (tty of t as string) is "${shellEscapeAppleScriptString(tty)}" then
        set selected of t to true
        set index of w to 1
        return
      end if
    end repeat
  end repeat
end tell`;
  return execQuiet(exec, "osascript", ["-e", script]);
}

function buildDefaultFindWindow(exec: ExecFileLike) {
  return async function defaultFindWindow(target: SessionJumpTarget): Promise<boolean> {
    // Priority order: tmux first (hierarchical — the pane lives inside some
    // terminal emulator, so landing the client on the right pane implicitly
    // focuses the outer window), then the emulator-specific strategies.
    if (await focusTmuxPane(target, exec)) return true;
    if (await focusWezTermPane(target, exec)) return true;
    if (await focusKittyWindow(target, exec)) return true;
    if (await focusITerm2Session(target, exec)) return true;
    if (await focusTerminalAppByTty(target, exec)) return true;
    if (await focusGhosttySession(target, exec)) return true;
    return false;
  };
}

function buildDefaultActivateApp(exec: ExecFileLike) {
  return async function defaultActivateApp(
    appName: string,
    workspacePath?: string,
  ): Promise<boolean> {
    const args = workspacePath ? ["-a", appName, workspacePath] : ["-a", appName];
    return execQuiet(exec, "open", args);
  };
}

export function createSessionJumpService(
  deps: SessionJumpServiceDeps = {},
): SessionJumpService {
  const exec = deps.execFileImpl ?? execFileAsyncDefault;
  const findWindow = deps.findWindow ?? buildDefaultFindWindow(exec);
  const activateApp = deps.activateApp ?? buildDefaultActivateApp(exec);

  return {
    async jumpTo(target: SessionJumpTarget): Promise<SessionJumpResult> {
      if (await findWindow(target)) {
        return { ok: true, mode: "precise" };
      }

      if (target.appName && (await activateApp(target.appName, target.workspacePath))) {
        return { ok: true, mode: "activate_app" };
      }

      return {
        ok: false,
        error: "Unable to locate or activate the original tool",
      };
    },
  };
}
