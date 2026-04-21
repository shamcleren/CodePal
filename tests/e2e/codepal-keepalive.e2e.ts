import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { launchCodePal } from "./helpers/launchCodePal";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { codePalMainJs, resolveElectronExecutable } from "./helpers/startHookCliProcess";

const repoRoot = process.cwd();

test.describe.configure({ timeout: 60_000 });

type KeepAliveHandle = {
  child: ChildProcess;
  waitForStdoutLine: () => Promise<string>;
  kill: (signal?: NodeJS.Signals) => void;
  waitForExitCode: () => Promise<number>;
};

function startKeepAliveHookCli(
  sessionId: string,
  tool: string,
  ipcTarget: { host: string; port: number },
): KeepAliveHandle {
  const mainJs = codePalMainJs(repoRoot);
  const child = spawn(
    resolveElectronExecutable(),
    [mainJs, "--codepal-hook", "keep-alive", "--session-id", sessionId, "--tool", tool],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CODEPAL_SOCKET_PATH: "",
        CODEPAL_IPC_HOST: ipcTarget.host,
        CODEPAL_IPC_PORT: String(ipcTarget.port),
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", () => {
    // Drain stderr silently to prevent pipe backpressure.
  });

  let stdoutBuffer = "";
  let resolveStdout: ((line: string) => void) | null = null;

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const nl = stdoutBuffer.indexOf("\n");
    if (nl >= 0 && resolveStdout) {
      resolveStdout(stdoutBuffer.slice(0, nl));
      resolveStdout = null;
    }
  });

  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  return {
    child,
    waitForStdoutLine: () =>
      new Promise<string>((resolve) => {
        if (stdoutBuffer.includes("\n")) {
          const nl = stdoutBuffer.indexOf("\n");
          resolve(stdoutBuffer.slice(0, nl));
        } else {
          resolveStdout = resolve;
        }
      }),
    kill: (signal: NodeJS.Signals = "SIGTERM") => child.kill(signal),
    waitForExitCode: () => exitPromise,
  };
}

test("keep-alive: registers connection and relays user_message from CodePal to hook stdout", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const sessionId = "e2e-keepalive-session";
  const tool = "claude";

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    // Start the keep-alive hook CLI — it connects to CodePal's IPC hub
    const kaHandle = startKeepAliveHookCli(sessionId, tool, codepal.ipcTarget);

    // Wait for the keep-alive registration to be reflected in CodePal
    // The session should appear and hasInputChannel should become true
    await expect(async () => {
      const sessions = await page.evaluate(() => window.codepal.getSessions());
      const session = sessions.find(
        (s: { id: string }) => s.id === sessionId,
      );
      expect(session).toBeDefined();
      expect(session!.hasInputChannel).toBe(true);
    }).toPass({ timeout: 10_000 });

    // Send a user_message from CodePal to the agent via the keep-alive connection
    await page.evaluate(
      ([sid, text]) => {
        window.codepal.sendMessage(sid, text);
      },
      [sessionId, "hello from CodePal"] as const,
    );

    // The keep-alive hook should forward the user_message to stdout
    const stdoutLine = await kaHandle.waitForStdoutLine();
    const parsed = JSON.parse(stdoutLine);
    expect(parsed.type).toBe("user_message");
    expect(parsed.sessionId).toBe(sessionId);
    expect(parsed.text).toBe("hello from CodePal");

    // Cleanup: kill the keep-alive process
    kaHandle.kill();
    const exitCode = await kaHandle.waitForExitCode();
    expect(exitCode).toBe(0);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

test("keep-alive: hasInputChannel becomes false when keep-alive disconnects", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const sessionId = "e2e-keepalive-disconnect";
  const tool = "claude";

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const kaHandle = startKeepAliveHookCli(sessionId, tool, codepal.ipcTarget);

    // Wait for connection registration
    await expect(async () => {
      const sessions = await page.evaluate(() => window.codepal.getSessions());
      const session = sessions.find(
        (s: { id: string }) => s.id === sessionId,
      );
      expect(session).toBeDefined();
      expect(session!.hasInputChannel).toBe(true);
    }).toPass({ timeout: 10_000 });

    // Kill the keep-alive process — should trigger disconnect
    kaHandle.kill();
    await kaHandle.waitForExitCode();

    // hasInputChannel should become false
    await expect(async () => {
      const sessions = await page.evaluate(() => window.codepal.getSessions());
      const session = sessions.find(
        (s: { id: string }) => s.id === sessionId,
      );
      expect(session?.hasInputChannel).toBe(false);
    }).toPass({ timeout: 10_000 });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});
