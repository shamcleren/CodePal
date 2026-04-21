import { describe, expect, it, vi } from "vitest";
import { createSessionJumpService, type ExecFileLike } from "./sessionJumpService";

function mockExec(
  responder: (file: string, args: readonly string[]) => "ok" | "fail",
): { exec: ExecFileLike; calls: Array<{ file: string; args: readonly string[] }> } {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const exec: ExecFileLike = async (file, args) => {
    calls.push({ file, args });
    if (responder(file, args) === "ok") {
      return { stdout: "", stderr: "" };
    }
    throw new Error(`mocked exec failure: ${file} ${args.join(" ")}`);
  };
  return { exec, calls };
}

describe("sessionJumpService", () => {
  it("falls back to app activation when precise jump is unavailable", async () => {
    const activateApp = vi.fn(async () => true);
    const service = createSessionJumpService({
      activateApp,
      findWindow: vi.fn(async () => false),
    });

    const result = await service.jumpTo({
      agent: "claude",
      appName: "Terminal",
      workspacePath: "/tmp/demo",
      fallbackBehavior: "activate_app",
    });

    expect(result).toEqual({ ok: true, mode: "activate_app" });
    expect(activateApp).toHaveBeenCalledWith("Terminal", "/tmp/demo");
  });

  it("uses tmux switch-client when tmuxPane is present", async () => {
    const { exec, calls } = mockExec((file) => (file === "tmux" ? "ok" : "fail"));
    const service = createSessionJumpService({ execFileImpl: exec });

    const result = await service.jumpTo({
      agent: "claude",
      appName: "Terminal",
      tmuxPane: "%42",
      fallbackBehavior: "activate_app",
    });

    expect(result).toEqual({ ok: true, mode: "precise" });
    expect(calls[0]).toEqual({ file: "tmux", args: ["switch-client", "-t", "%42"] });
    expect(calls[1]).toEqual({ file: "tmux", args: ["select-window", "-t", "%42"] });
  });

  it("passes tmuxSocket via -S to tmux", async () => {
    const { exec, calls } = mockExec((file) => (file === "tmux" ? "ok" : "fail"));
    const service = createSessionJumpService({ execFileImpl: exec });

    const result = await service.jumpTo({
      agent: "claude",
      appName: "Terminal",
      tmuxPane: "%7",
      tmuxSocket: "/tmp/tmux-501/default",
      fallbackBehavior: "activate_app",
    });

    expect(result).toEqual({ ok: true, mode: "precise" });
    expect(calls[0].args.slice(0, 4)).toEqual([
      "-S",
      "/tmp/tmux-501/default",
      "switch-client",
      "-t",
    ]);
  });

  it("falls through when tmux switch-client fails and tty is present", async () => {
    const { exec, calls } = mockExec((file, args) => {
      if (file === "tmux") return "fail";
      if (file === "osascript") {
        // Accept the first osascript invocation (iTerm2 branch short-circuits on missing sid, so this is Terminal.app)
        const body = args[1] ?? "";
        if (body.includes(`tell application "Terminal"`)) return "ok";
      }
      return "fail";
    });
    const service = createSessionJumpService({ execFileImpl: exec });

    const result = await service.jumpTo({
      agent: "claude",
      appName: "Terminal",
      tmuxPane: "%99",
      tty: "/dev/ttys004",
      fallbackBehavior: "activate_app",
    });

    expect(result).toEqual({ ok: true, mode: "precise" });
    // First call: tmux switch-client (failed)
    expect(calls[0]).toEqual({ file: "tmux", args: ["switch-client", "-t", "%99"] });
    // Then: osascript Terminal.app by tty (succeeded)
    const osa = calls.find((c) => c.file === "osascript");
    expect(osa).toBeDefined();
    expect(osa!.args[1]).toContain(`tell application "Terminal"`);
    expect(osa!.args[1]).toContain("/dev/ttys004");
  });

  it("uses iTerm2 AppleScript when terminalSessionId is present", async () => {
    const { exec, calls } = mockExec((file, args) => {
      if (file === "osascript") {
        const body = args[1] ?? "";
        if (body.includes(`tell application "iTerm"`)) return "ok";
      }
      return "fail";
    });
    const service = createSessionJumpService({ execFileImpl: exec });

    const result = await service.jumpTo({
      agent: "claude",
      appName: "iTerm",
      terminalSessionId: "w0t0p0:ABCDEF",
      fallbackBehavior: "activate_app",
    });

    expect(result).toEqual({ ok: true, mode: "precise" });
    const osa = calls.find((c) => c.file === "osascript");
    expect(osa!.args[1]).toContain(`tell application "iTerm"`);
    expect(osa!.args[1]).toContain("w0t0p0:ABCDEF");
  });

  it("returns activate_app when every precise strategy misses", async () => {
    const { exec } = mockExec((file) => (file === "open" ? "ok" : "fail"));
    const service = createSessionJumpService({ execFileImpl: exec });

    const result = await service.jumpTo({
      agent: "claude",
      appName: "Terminal",
      workspacePath: "/tmp/demo",
      tmuxPane: "%1",
      tty: "/dev/ttys001",
      fallbackBehavior: "activate_app",
    });

    expect(result).toEqual({ ok: true, mode: "activate_app" });
  });
});
