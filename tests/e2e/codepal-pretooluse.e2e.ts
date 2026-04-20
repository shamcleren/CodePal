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

  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  let stdoutBuffer = "";
  let resolveStdout: ((line: string) => void) | null = null;
  const stdoutPromise = new Promise<string>((resolve) => {
    resolveStdout = resolve;
  });

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const nl = stdoutBuffer.indexOf("\n");
    if (nl >= 0 && resolveStdout) {
      const line = stdoutBuffer.slice(0, nl);
      resolveStdout(line);
      resolveStdout = null;
    }
  });

  child.stdin!.write(JSON.stringify(payload));
  child.stdin!.end();

  return {
    waitForFirstStdoutLine: () => stdoutPromise,
    waitForExitCode: () => exitPromise,
    stderrChunks,
    kill: (signal: NodeJS.Signals = "SIGTERM") => child.kill(signal),
  };
}

test("PreToolUse: round-trips allow decision through blocking bridge and returns Claude-formatted JSON", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const sessionId = "e2e-pretooluse-session";
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

    // Wait for the pending approval card to appear in the UI
    const pendingBadge = page.getByText(/1 pending|1 \u4e2a\u5f85\u5904\u7406/).first();
    await expect(pendingBadge).toBeVisible({ timeout: 15_000 });

    // Poll getSessions (async IPC) until the pendingAction is available
    // SessionRecord uses `id` not `sessionId`
    const actionId = await page.evaluate(
      (sid) => {
        return new Promise<string>((resolve, reject) => {
          let attempts = 0;
          const poll = async () => {
            attempts++;
            const sessions = await window.codepal.getSessions();
            const session = sessions.find((s: { id: string }) => s.id === sid);
            const action = session?.pendingActions?.[0];
            if (action) {
              resolve(action.id);
              return;
            }
            if (attempts > 50) {
              reject(new Error("pendingAction not found after 50 polls"));
              return;
            }
            setTimeout(poll, 100);
          };
          poll();
        });
      },
      sessionId,
    );

    await page.evaluate(
      ([sid, aid, option]) => {
        window.codepal.respondToPendingAction(sid, aid, option);
      },
      [sessionId, actionId, "Allow"] as const,
    );

    // The hook CLI should receive Claude-formatted stdout
    const stdoutLine = await hookHandle.waitForFirstStdoutLine();
    const parsed = JSON.parse(stdoutLine);
    expect(parsed).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "User approved in CodePal",
      },
    });

    const exitCode = await hookHandle.waitForExitCode();
    expect(exitCode).toBe(0);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

test("PreToolUse: gracefully degrades to exit 0 with no stdout when CodePal is unreachable", async () => {
  // Point the hook CLI at a port with no CodePal running — simulates CodePal being down
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
  // Must exit 0 — never block Claude with a non-zero exit
  expect(exitCode).toBe(0);
  // stderr should mention degradation
  const stderr = hookHandle.stderrChunks.join("");
  expect(stderr).toMatch(/degraded|native flow|ECONNREFUSED/i);
});
