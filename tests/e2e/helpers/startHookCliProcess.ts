import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import type { ResponseTarget } from "../../../src/shared/sessionTypes";

const require = createRequire(import.meta.url);

export function resolveElectronExecutable(): string {
  return require("electron") as string;
}

export function codePalMainJs(repoRoot: string): string {
  return path.join(repoRoot, "out", "main", "main.js");
}

export type StartBlockingHookOptions = {
  repoRoot: string;
  ipcTarget: Extract<ResponseTarget, { host: string; port: number }>;
  payload: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
};

export type BlockingHookHandle = {
  waitForFirstStdoutLine: () => Promise<string>;
  waitForExitCode: () => Promise<number>;
  kill: (signal?: NodeJS.Signals) => void;
};

function collectFirstStdoutLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdout = child.stdout;
    if (!stdout) {
      reject(new Error("startHookCliProcess: child has no stdout"));
      return;
    }

    let buffer = "";
    const onData = (chunk: string | Buffer) => {
      buffer += String(chunk);
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex >= 0) {
        stdout.off("data", onData);
        stdout.off("error", onError);
        child.off("error", onError);
        resolve(buffer.slice(0, newlineIndex));
      }
    };
    const onError = (error: Error) => {
      stdout.off("data", onData);
      stdout.off("error", onError);
      child.off("error", onError);
      reject(error);
    };

    stdout.setEncoding("utf8");
    stdout.on("data", onData);
    stdout.on("error", onError);
    child.on("error", onError);
  });
}

export function startBlockingHookCliProcess(
  options: StartBlockingHookOptions,
): BlockingHookHandle {
  const mainJs = codePalMainJs(options.repoRoot);
  const child = spawn(resolveElectronExecutable(), [mainJs, "--codepal-hook", "blocking-hook"], {
    cwd: options.repoRoot,
    env: {
      ...process.env,
      ...options.env,
      CODEPAL_SOCKET_PATH: "",
      CODEPAL_IPC_HOST: options.ipcTarget.host,
      CODEPAL_IPC_PORT: String(options.ipcTarget.port),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const firstLinePromise = collectFirstStdoutLine(child);
  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  child.stdin.write(JSON.stringify(options.payload));
  child.stdin.end();

  return {
    waitForFirstStdoutLine: () => firstLinePromise,
    waitForExitCode: () => exitPromise,
    kill: (signal: NodeJS.Signals = "SIGTERM") => {
      child.kill(signal);
    },
  };
}
