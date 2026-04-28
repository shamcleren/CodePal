import { describe, expect, it } from "vitest";
import { createTerminalTextSender, type ExecFileLike } from "./terminalTextSender";

function mockExec(
  responder: (file: string, args: readonly string[]) => "ok" | "fail",
): { exec: ExecFileLike; calls: Array<{ file: string; args: readonly string[] }> } {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const exec: ExecFileLike = async (file, args) => {
    calls.push({ file, args });
    if (responder(file, args) === "ok") return { stdout: "", stderr: "" };
    throw new Error(`mocked exec failure: ${file} ${args.join(" ")}`);
  };
  return { exec, calls };
}

describe("terminalTextSender", () => {
  it("returns no_reply_capability when no terminalContext", async () => {
    const { exec, calls } = mockExec(() => "ok");
    const sender = createTerminalTextSender({ execFileImpl: exec });
    const result = await sender.send({}, "hello");
    expect(result).toEqual({ ok: false, error: "no_reply_capability" });
    expect(calls).toHaveLength(0);
  });

  it("returns no_reply_capability when context has neither tmux pane nor ghostty session id", async () => {
    const { exec, calls } = mockExec(() => "ok");
    const sender = createTerminalTextSender({ execFileImpl: exec });
    const result = await sender.send({ terminalContext: { app: "Terminal" } }, "hello");
    expect(result).toEqual({ ok: false, error: "no_reply_capability" });
    expect(calls).toHaveLength(0);
  });

  it("sends via tmux send-keys -l + Enter when tmuxPane is present", async () => {
    const { exec, calls } = mockExec((file) => (file === "tmux" ? "ok" : "fail"));
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "tmux", tmuxPane: "%42" } },
      "continue please",
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { file: "tmux", args: ["send-keys", "-t", "%42", "-l", "continue please"] },
      { file: "tmux", args: ["send-keys", "-t", "%42", "Enter"] },
    ]);
  });

  it("passes tmuxSocket via -S", async () => {
    const { exec, calls } = mockExec((file) => (file === "tmux" ? "ok" : "fail"));
    const sender = createTerminalTextSender({ execFileImpl: exec });

    await sender.send(
      {
        terminalContext: {
          app: "tmux",
          tmuxPane: "%7",
          tmuxSocket: "/tmp/tmux-501/default",
        },
      },
      "hi",
    );

    expect(calls[0].args.slice(0, 4)).toEqual([
      "-S",
      "/tmp/tmux-501/default",
      "send-keys",
      "-t",
    ]);
  });

  it("returns an error when tmux literal send fails (Enter not attempted)", async () => {
    const { exec, calls } = mockExec(() => "fail");
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "tmux", tmuxPane: "%42" } },
      "hi",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tmux send-keys failed/);
    expect(calls).toHaveLength(1);
  });

  it("uses ghostty osascript when app is ghostty and terminalSessionId is set", async () => {
    const { exec, calls } = mockExec((file) => (file === "osascript" ? "ok" : "fail"));
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      {
        terminalContext: {
          app: "ghostty",
          terminalSessionId: "abc-123",
        },
      },
      "quote \"this\"",
    );

    expect(result).toEqual({ ok: true });
    expect(calls[0].file).toBe("osascript");
    expect(calls[0].args[1]).toContain(`tell application "Ghostty"`);
    expect(calls[0].args[1]).toContain(`quote \\"this\\"`);
  });

  it("returns an error when ghostty osascript fails", async () => {
    const { exec } = mockExec(() => "fail");
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "ghostty", terminalSessionId: "abc" } },
      "hi",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ghostty osascript failed/);
  });

  it("sends via wezterm cli send-text + carriage return when weztermPane is present", async () => {
    const { exec, calls } = mockExec((file) => (file === "wezterm" ? "ok" : "fail"));
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "wezterm", weztermPane: "12" } },
      "ship it",
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { file: "wezterm", args: ["cli", "send-text", "--no-paste", "--pane-id", "12", "--", "ship it"] },
      { file: "wezterm", args: ["cli", "send-text", "--no-paste", "--pane-id", "12", "--", "\r"] },
    ]);
  });

  it("returns an error when wezterm send-text fails (Enter not attempted)", async () => {
    const { exec, calls } = mockExec(() => "fail");
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "wezterm", weztermPane: "12" } },
      "hi",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/wezterm cli send-text failed/);
    expect(calls).toHaveLength(1);
  });

  it("prefers tmux over wezterm when both pane ids are present (tmux can run inside wezterm)", async () => {
    const { exec, calls } = mockExec((file) => (file === "tmux" ? "ok" : "fail"));
    const sender = createTerminalTextSender({ execFileImpl: exec });

    await sender.send(
      { terminalContext: { app: "wezterm", tmuxPane: "%1", weztermPane: "12" } },
      "hi",
    );

    expect(calls.every((c) => c.file === "tmux")).toBe(true);
  });

  it("sends via kitten @ send-text + carriage return when kittyWindow is present", async () => {
    const { exec, calls } = mockExec((file) => (file === "kitten" ? "ok" : "fail"));
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "kitty", kittyWindow: "9" } },
      "go",
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { file: "kitten", args: ["@", "send-text", "--match", "id:9", "--", "go"] },
      { file: "kitten", args: ["@", "send-text", "--match", "id:9", "--", "\r"] },
    ]);
  });

  it("returns an error when kitten send-text fails (Enter not attempted)", async () => {
    const { exec, calls } = mockExec(() => "fail");
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "kitty", kittyWindow: "9" } },
      "hi",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/kitten @ send-text failed/);
    expect(calls).toHaveLength(1);
  });

  it("uses iTerm2 per-session AppleScript when app is iTerm.app and terminalSessionId is set", async () => {
    const { exec, calls } = mockExec((file) => (file === "osascript" ? "ok" : "fail"));
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "iTerm.app", terminalSessionId: "w0t0p0:DEADBEEF" } },
      "ship \"this\"",
    );

    expect(result).toEqual({ ok: true });
    expect(calls[0].file).toBe("osascript");
    expect(calls[0].args[1]).toContain(`tell session id "w0t0p0:DEADBEEF"`);
    expect(calls[0].args[1]).toContain(`write text "ship \\"this\\""`);
  });

  it("returns an error when iTerm2 osascript fails", async () => {
    const { exec } = mockExec(() => "fail");
    const sender = createTerminalTextSender({ execFileImpl: exec });

    const result = await sender.send(
      { terminalContext: { app: "iTerm.app", terminalSessionId: "abc" } },
      "hi",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/iterm2 osascript failed/);
  });

  it("prefers tmux over ghostty when both fields are present (tmux lives inside ghostty)", async () => {
    const { exec, calls } = mockExec((file) => (file === "tmux" ? "ok" : "fail"));
    const sender = createTerminalTextSender({ execFileImpl: exec });

    await sender.send(
      {
        terminalContext: {
          app: "ghostty",
          terminalSessionId: "abc",
          tmuxPane: "%1",
        },
      },
      "hi",
    );

    expect(calls.every((c) => c.file === "tmux")).toBe(true);
  });
});
