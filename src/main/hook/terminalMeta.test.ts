import { describe, expect, it } from "vitest";
import {
  normalizeTtyPath,
  readTerminalContextFromEnv,
  stampTerminalMetaOnEventLine,
} from "./terminalMeta";

describe("normalizeTtyPath", () => {
  it("passes through an absolute device path", () => {
    expect(normalizeTtyPath("/dev/ttys005")).toBe("/dev/ttys005");
  });

  it("prefixes bare ps-style values", () => {
    expect(normalizeTtyPath("s005")).toBe("/dev/ttys005");
  });

  it("prefixes tty-prefixed values", () => {
    expect(normalizeTtyPath("ttys005")).toBe("/dev/ttys005");
  });

  it("treats question-mark tty placeholders as missing", () => {
    expect(normalizeTtyPath("?")).toBeUndefined();
    expect(normalizeTtyPath("??")).toBeUndefined();
  });

  it("ignores empty / whitespace values", () => {
    expect(normalizeTtyPath("")).toBeUndefined();
    expect(normalizeTtyPath("   ")).toBeUndefined();
    expect(normalizeTtyPath(undefined)).toBeUndefined();
  });
});

describe("readTerminalContextFromEnv", () => {
  it("returns undefined when no terminal env vars are present", () => {
    expect(readTerminalContextFromEnv({})).toBeUndefined();
  });

  it("captures iTerm2 app + session id + tty", () => {
    const ctx = readTerminalContextFromEnv({
      CODEPAL_TERM_TTY: "s002",
      CODEPAL_TERM_APP: "iTerm.app",
      CODEPAL_TERM_ITERM_SESSION_ID: "w0t0p0:DEADBEEF",
    });
    expect(ctx).toEqual({
      app: "iTerm.app",
      tty: "/dev/ttys002",
      terminalSessionId: "w0t0p0:DEADBEEF",
    });
  });

  it("captures tmux pane and splits socket out of $TMUX", () => {
    const ctx = readTerminalContextFromEnv({
      CODEPAL_TERM_TMUX: "/private/tmp/tmux-501/default,12345,3",
      CODEPAL_TERM_TMUX_PANE: "%42",
      CODEPAL_TERM_APP: "iTerm.app",
    });
    expect(ctx?.tmuxPane).toBe("%42");
    expect(ctx?.tmuxSocket).toBe("/private/tmp/tmux-501/default");
    expect(ctx?.app).toBe("iTerm.app");
  });

  it("does not record tmuxSocket without a tmuxPane", () => {
    const ctx = readTerminalContextFromEnv({
      CODEPAL_TERM_TMUX: "/tmp/tmux-501/default,1,0",
    });
    expect(ctx?.tmuxSocket).toBeUndefined();
    expect(ctx?.app).toBe("tmux");
  });

  it("derives ghostty app from resources dir fallback", () => {
    const ctx = readTerminalContextFromEnv({
      CODEPAL_TERM_GHOSTTY_RESOURCES_DIR: "/Applications/Ghostty.app/Contents/Resources/ghostty",
      CODEPAL_TERM_TTY: "ttys003",
    });
    expect(ctx?.app).toBe("ghostty");
    expect(ctx?.tty).toBe("/dev/ttys003");
  });

  it("captures wezterm pane id when WEZTERM_PANE is exported", () => {
    const ctx = readTerminalContextFromEnv({
      CODEPAL_TERM_APP: "WezTerm",
      CODEPAL_TERM_WEZTERM_PANE: "12",
      CODEPAL_TERM_TTY: "s003",
    });
    expect(ctx?.app).toBe("wezterm");
    expect(ctx?.weztermPane).toBe("12");
    expect(ctx?.tty).toBe("/dev/ttys003");
  });

  it("maps common TERM_PROGRAM values to canonical app ids", () => {
    expect(
      readTerminalContextFromEnv({ CODEPAL_TERM_APP: "Apple_Terminal", CODEPAL_TERM_TTY: "s001" })?.app,
    ).toBe("Terminal");
    expect(
      readTerminalContextFromEnv({ CODEPAL_TERM_APP: "WarpTerminal", CODEPAL_TERM_TTY: "s001" })?.app,
    ).toBe("warp");
    expect(
      readTerminalContextFromEnv({ CODEPAL_TERM_APP: "vscode", CODEPAL_TERM_TTY: "s001" })?.app,
    ).toBe("vscode");
  });
});

describe("stampTerminalMetaOnEventLine", () => {
  it("merges terminal context into an existing meta", () => {
    const line = JSON.stringify({
      type: "status_change",
      sessionId: "abc",
      meta: { hook_event_name: "UserPromptSubmit" },
    });
    const stamped = stampTerminalMetaOnEventLine(line, {
      app: "iTerm.app",
      tty: "/dev/ttys002",
    });
    expect(JSON.parse(stamped)).toEqual({
      type: "status_change",
      sessionId: "abc",
      meta: {
        hook_event_name: "UserPromptSubmit",
        terminal: { app: "iTerm.app", tty: "/dev/ttys002" },
      },
    });
  });

  it("creates meta when the event had none", () => {
    const line = JSON.stringify({ type: "status_change", sessionId: "abc" });
    const stamped = stampTerminalMetaOnEventLine(line, { tmuxPane: "%1" });
    expect(JSON.parse(stamped)).toEqual({
      type: "status_change",
      sessionId: "abc",
      meta: { terminal: { tmuxPane: "%1" } },
    });
  });

  it("returns the original line when context is undefined", () => {
    const line = JSON.stringify({ type: "status_change", sessionId: "abc" });
    expect(stampTerminalMetaOnEventLine(line, undefined)).toBe(line);
  });

  it("returns the original line when input is not a JSON object", () => {
    expect(stampTerminalMetaOnEventLine("not json", { app: "iTerm.app" })).toBe("not json");
    expect(stampTerminalMetaOnEventLine("[1,2,3]", { app: "iTerm.app" })).toBe("[1,2,3]");
  });
});
