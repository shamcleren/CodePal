import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { launchCodePal } from "./helpers/launchCodePal";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { codePalMainJs, resolveElectronExecutable } from "./helpers/startHookCliProcess";

const repoRoot = process.cwd();

test.describe.configure({ timeout: 60_000 });

type HookCliHandle = {
  waitForFirstStdoutLine: () => Promise<string>;
  waitForExitCode: () => Promise<number>;
  stderrChunks: string[];
  stdoutChunks: string[];
  kill: (signal?: NodeJS.Signals) => void;
};

function startClaudeHookCli(
  payload: Record<string, unknown>,
  ipcTarget: { host: string; port: number },
  extraEnv?: Record<string, string>,
): HookCliHandle {
  const mainJs = codePalMainJs(repoRoot);
  const child = spawn(resolveElectronExecutable(), [mainJs, "--codepal-hook", "claude"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEPAL_SOCKET_PATH: "",
      CODEPAL_IPC_HOST: ipcTarget.host,
      CODEPAL_IPC_PORT: String(ipcTarget.port),
      CODEPAL_HOOK_RESPONSE_WAIT_MS: "15000",
      ...extraEnv,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stderrChunks: string[] = [];
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => stderrChunks.push(chunk));

  const stdoutChunks: string[] = [];
  let stdoutBuffer = "";
  let resolveStdout: ((line: string) => void) | null = null;
  const stdoutPromise = new Promise<string>((resolve) => {
    resolveStdout = resolve;
  });

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutChunks.push(chunk);
    stdoutBuffer += chunk;
    const nl = stdoutBuffer.indexOf("\n");
    if (nl >= 0 && resolveStdout) {
      const line = stdoutBuffer.slice(0, nl);
      resolveStdout(line);
      resolveStdout = null;
    }
  });

  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  child.stdin!.write(JSON.stringify(payload));
  child.stdin!.end();

  return {
    waitForFirstStdoutLine: () => stdoutPromise,
    waitForExitCode: () => exitPromise,
    stderrChunks,
    stdoutChunks,
    kill: (signal: NodeJS.Signals = "SIGTERM") => child.kill(signal),
  };
}

// As of v1.1.3 CodePal no longer participates in Claude's PreToolUse approval
// flow — Claude's native allow/deny prompt is the sole decision surface and
// the CodePal hook short-circuits to a no-op the moment it recognises a
// PreToolUse payload. The two tests below pin that contract:
//   1. Reachable CodePal: hook reads the payload, exits 0, writes nothing to
//      stdout, never registers a pending approval card.
//   2. Unreachable CodePal: same — exit 0, no stdout. CodePal-down must never
//      block Claude with a non-zero exit.
// See docs/release-notes-v1.1.3.zh-CN.md for the design rationale.

test("PreToolUse: hook is a no-op against a reachable CodePal — exit 0, no stdout, no pending card", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const sessionId = "e2e-pretooluse-noop";
  const payload = {
    session_id: sessionId,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "rm -rf /tmp/test" },
  };

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const hookHandle = startClaudeHookCli(payload, codepal.ipcTarget);

    const exitCode = await hookHandle.waitForExitCode();
    expect(exitCode).toBe(0);

    // No stdout: Claude relies on absence of stdout to fall back to its
    // native flow.
    expect(hookHandle.stdoutChunks.join("")).toBe("");

    // No pending-approval badge should ever materialise — the hook
    // short-circuits before any IPC traffic reaches the dashboard.
    const pendingBadge = page.getByText(/1 pending|1 个待处理/).first();
    await expect(pendingBadge).toBeHidden({ timeout: 1_500 });

    // No pending action recorded for this session either.
    const sessions = await page.evaluate(() =>
      window.codepal.getSessions() as unknown as Array<{ id: string; pendingActions?: unknown[] }>,
    );
    const session = sessions.find((s) => s.id === sessionId);
    expect(session?.pendingActions ?? []).toEqual([]);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

test("PreToolUse: stays a no-op when CodePal is unreachable — exit 0, no stdout", async () => {
  // Point the hook CLI at a port with no CodePal listening — simulates
  // CodePal being down. Even with nowhere to send the payload the hook must
  // exit 0 with no stdout so Claude's native flow proceeds unblocked.
  const payload = {
    session_id: "e2e-pretooluse-degraded",
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "ls" },
  };

  const hookHandle = startClaudeHookCli(payload, { host: "127.0.0.1", port: 1 }, {
    CODEPAL_HOOK_RESPONSE_WAIT_MS: "2000",
  });

  const exitCode = await hookHandle.waitForExitCode();
  expect(exitCode).toBe(0);
  expect(hookHandle.stdoutChunks.join("")).toBe("");
});
