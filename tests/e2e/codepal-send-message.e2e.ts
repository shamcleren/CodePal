import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { launchCodePal } from "./helpers/launchCodePal";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { codePalMainJs, resolveElectronExecutable } from "./helpers/startHookCliProcess";

const repoRoot = process.cwd();

test.describe.configure({ timeout: 60_000 });

type KeepAliveHandle = {
  child: ChildProcess;
  collectStdoutLines: () => string[];
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

  const stdoutLines: string[] = [];
  let stdoutBuffer = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const parts = stdoutBuffer.split("\n");
    stdoutBuffer = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length > 0) stdoutLines.push(line);
    }
  });

  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  return {
    child,
    collectStdoutLines: () => [...stdoutLines],
    kill: (signal: NodeJS.Signals = "SIGTERM") => child.kill(signal),
    waitForExitCode: () => exitPromise,
  };
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("send-message: UI sends message via IPC, agent receives it on keep-alive stdout, renderer gets success result", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const sessionId = "e2e-sendmsg-session";
  const tool = "claude";

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    // Start keep-alive to establish a bidirectional channel
    const kaHandle = startKeepAliveHookCli(sessionId, tool, codepal.ipcTarget);

    // Wait for hasInputChannel to become true
    await expect(async () => {
      const sessions = await page.evaluate(() => window.codepal.getSessions());
      const session = sessions.find(
        (s: { id: string }) => s.id === sessionId,
      );
      expect(session).toBeDefined();
      expect(session!.hasInputChannel).toBe(true);
    }).toPass({ timeout: 10_000 });

    // Set up a result listener in the renderer before sending
    const resultPromise = page.evaluate(
      (sid) =>
        new Promise<{ sessionId: string; result: string; error?: string }>((resolve) => {
          const unsub = window.codepal.onSendMessageResult((result) => {
            if (result.sessionId === sid) {
              unsub();
              resolve(result);
            }
          });
        }),
      sessionId,
    );

    // Send a message from the renderer
    await page.evaluate(
      ([sid, text]) => {
        window.codepal.sendMessage(sid, text);
      },
      [sessionId, "please continue working"] as const,
    );

    // Verify the renderer gets a success result
    const result = await resultPromise;
    expect(result.result).toBe("success");
    expect(result.sessionId).toBe(sessionId);

    // Verify the keep-alive hook received the user_message on stdout
    // Give it a moment to flush
    await waitMs(300);
    const lines = kaHandle.collectStdoutLines();
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const lastLine = JSON.parse(lines[lines.length - 1]);
    expect(lastLine.type).toBe("user_message");
    expect(lastLine.sessionId).toBe(sessionId);
    expect(lastLine.text).toBe("please continue working");

    kaHandle.kill();
    await kaHandle.waitForExitCode();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

test("send-message: returns error when no keep-alive connection exists for the session", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
  });

  const sessionId = "e2e-sendmsg-noconn";

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    // Set up a result listener
    const resultPromise = page.evaluate(
      (sid) =>
        new Promise<{ sessionId: string; result: string; error?: string }>((resolve) => {
          const unsub = window.codepal.onSendMessageResult((result) => {
            if (result.sessionId === sid) {
              unsub();
              resolve(result);
            }
          });
        }),
      sessionId,
    );

    // Send without any keep-alive connection
    await page.evaluate(
      ([sid, text]) => {
        window.codepal.sendMessage(sid, text);
      },
      [sessionId, "this should fail"] as const,
    );

    const result = await resultPromise;
    expect(result.result).toBe("error");
    expect(result.error).toBe("no_connection");
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});
