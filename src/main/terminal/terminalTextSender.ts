import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SessionRecord, TerminalContext } from "../../shared/sessionTypes";
import { canReply } from "../../shared/sessionTypes";

const execFileAsyncDefault = promisify(execFile);

export type ExecFileLike = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

export type SendResult = { ok: true } | { ok: false; error: string };

export type TerminalTextSender = {
  send(
    session: Pick<SessionRecord, "terminalContext">,
    text: string,
  ): Promise<SendResult>;
};

type SenderDeps = {
  execFileImpl?: ExecFileLike;
};

export async function sendViaWezTerm(
  text: string,
  pane: string,
  exec: ExecFileLike,
): Promise<SendResult> {
  // `wezterm cli send-text --no-paste` writes the bytes verbatim into the
  // pane's input. Like tmux we do it in two calls: text first, then a
  // carriage return to actually submit the prompt. `--no-paste` keeps
  // bracketed-paste sequences out of the way (some agents otherwise treat
  // the input as a paste rather than typed input).
  try {
    await exec("wezterm", ["cli", "send-text", "--no-paste", "--pane-id", pane, "--", text]);
    await exec("wezterm", ["cli", "send-text", "--no-paste", "--pane-id", pane, "--", "\r"]);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `wezterm cli send-text failed: ${message}` };
  }
}

export async function sendViaTmux(
  text: string,
  pane: string,
  exec: ExecFileLike,
  socketPath?: string,
): Promise<SendResult> {
  const socketArgs = socketPath ? ["-S", socketPath] : [];
  try {
    // `-l` sends a literal string (no key-name interpretation) so the agent
    // receives the raw text unchanged. Then a second send-keys triggers Enter
    // to submit the prompt.
    await exec("tmux", [...socketArgs, "send-keys", "-t", pane, "-l", text]);
    await exec("tmux", [...socketArgs, "send-keys", "-t", pane, "Enter"]);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `tmux send-keys failed: ${message}` };
  }
}

export async function sendViaKitty(
  text: string,
  windowId: string,
  exec: ExecFileLike,
): Promise<SendResult> {
  // `kitten @ send-text` writes bytes into the matched window's input. Like
  // tmux/wezterm we issue text first, then a carriage return as a separate
  // call so a partial failure leaves no half-submitted prompt. Requires
  // `allow_remote_control yes` in kitty.conf — without it, the call fails
  // and the caller's error message points at the real cause.
  try {
    await exec("kitten", ["@", "send-text", "--match", `id:${windowId}`, "--", text]);
    await exec("kitten", ["@", "send-text", "--match", `id:${windowId}`, "--", "\r"]);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `kitten @ send-text failed: ${message}` };
  }
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * iTerm2 exposes a per-session AppleScript surface — `tell session id "X" to
 * write text "..."`. Unlike the Ghostty path this targets the exact session
 * that originated the agent, no System Events keystroke needed, no risk of
 * landing in the wrong window. The `newline` parameter on `write text` is
 * true by default, so the prompt submits in one call.
 */
export async function sendViaITerm2(
  text: string,
  terminalSessionId: string,
  exec: ExecFileLike,
): Promise<SendResult> {
  if (!terminalSessionId) {
    return { ok: false, error: "iterm2: missing terminal session id" };
  }
  const script = [
    `tell application "iTerm"`,
    `  tell session id "${escapeAppleScriptString(terminalSessionId)}"`,
    `    write text "${escapeAppleScriptString(text)}"`,
    `  end tell`,
    `end tell`,
  ].join("\n");
  try {
    await exec("osascript", ["-e", script]);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `iterm2 osascript failed: ${message}` };
  }
}

/**
 * Ghostty best-effort send via AppleScript System Events. Ghostty doesn't
 * expose per-tab scripting, so we rely on the fact that the CodePal wrapper
 * captured the terminal session id at launch — we activate Ghostty, and paste
 * the text into the frontmost window. If multiple windows are open this may
 * land in the wrong one; capability still returns true because text delivery
 * is at least attempted. The workspace path isn't verified here — that is
 * enforced upstream by SessionJumpService before the user chooses to send.
 */
export async function sendViaGhostty(
  text: string,
  terminalSessionId: string,
  exec: ExecFileLike,
): Promise<SendResult> {
  if (!terminalSessionId) {
    return { ok: false, error: "ghostty: missing terminal session id" };
  }
  const script = [
    `tell application "Ghostty" to activate`,
    `delay 0.05`,
    `tell application "System Events"`,
    `  keystroke "${escapeAppleScriptString(text)}"`,
    `  key code 36`,
    `end tell`,
  ].join("\n");
  try {
    await exec("osascript", ["-e", script]);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `ghostty osascript failed: ${message}` };
  }
}

export function createTerminalTextSender(deps: SenderDeps = {}): TerminalTextSender {
  const exec = deps.execFileImpl ?? execFileAsyncDefault;

  return {
    async send(session, text) {
      if (!canReply(session)) {
        return { ok: false, error: "no_reply_capability" };
      }
      const ctx = session.terminalContext as TerminalContext;

      if (ctx.tmuxPane) {
        return sendViaTmux(text, ctx.tmuxPane, exec, ctx.tmuxSocket);
      }
      if (ctx.weztermPane) {
        return sendViaWezTerm(text, ctx.weztermPane, exec);
      }
      if (ctx.kittyWindow) {
        return sendViaKitty(text, ctx.kittyWindow, exec);
      }
      if (ctx.app === "iTerm.app" && ctx.terminalSessionId) {
        return sendViaITerm2(text, ctx.terminalSessionId, exec);
      }
      if (ctx.app === "ghostty" && ctx.terminalSessionId) {
        return sendViaGhostty(text, ctx.terminalSessionId, exec);
      }
      return { ok: false, error: "no_reply_capability" };
    },
  };
}
