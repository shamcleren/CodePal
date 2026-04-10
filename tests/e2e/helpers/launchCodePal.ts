import net from "node:net";
import path from "node:path";
import type { ElectronApplication } from "@playwright/test";
import { _electron as electron } from "@playwright/test";
import type { ResponseTarget } from "../../../src/shared/sessionTypes";
import { getFreePort } from "./getFreePort";

const repoRoot = process.cwd();

export type LaunchCodePalOptions = {
  actionResponseTarget: ResponseTarget;
  homeDir?: string;
  extraEnv?: Record<string, string>;
};

export type LaunchedCodePal = {
  app: ElectronApplication;
  ipcTarget: Extract<ResponseTarget, { host: string; port: number }>;
  close: () => Promise<void>;
};

async function waitForTcpListener(host: string, port: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port }, () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (connected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for CodePal IPC TCP listener: ${host}:${port}`);
}

/**
 * Do not set `executablePath`: Playwright must inject its `-r` loader so CDP attaches correctly;
 * otherwise the renderer preload may not run and `window.codepal` stays undefined.
 */
export async function launchCodePal(
  options: LaunchCodePalOptions,
): Promise<LaunchedCodePal> {
  const mainJs = path.join(repoRoot, "out/main/main.js");
  const env: NodeJS.ProcessEnv = { ...process.env };
  const ipcTarget = {
    mode: "socket" as const,
    host: "127.0.0.1",
    port: await getFreePort(),
  };
  delete env.ELECTRON_RENDERER_URL;
  delete env.CODEPAL_SOCKET_PATH;
  delete env.CODEPAL_IPC_PORT;
  delete env.CODEPAL_IPC_HOST;
  delete env.CODEPAL_ACTION_RESPONSE_SOCKET_PATH;
  delete env.CODEPAL_ACTION_RESPONSE_HOST;
  delete env.CODEPAL_ACTION_RESPONSE_PORT;

  const actionResponseEnv =
    "socketPath" in options.actionResponseTarget
      ? {
          CODEPAL_ACTION_RESPONSE_MODE: "socket",
          CODEPAL_ACTION_RESPONSE_SOCKET_PATH: options.actionResponseTarget.socketPath,
        }
      : {
          CODEPAL_ACTION_RESPONSE_MODE: "socket",
          CODEPAL_ACTION_RESPONSE_HOST: options.actionResponseTarget.host,
          CODEPAL_ACTION_RESPONSE_PORT: String(options.actionResponseTarget.port),
        };

  const app = await electron.launch({
    args: [mainJs],
    cwd: repoRoot,
    env: {
      ...env,
      ...(options.homeDir ? { HOME: options.homeDir, USERPROFILE: options.homeDir } : {}),
      ...(options.homeDir ? { CODEPAL_HOME_DIR: options.homeDir } : {}),
      ...options.extraEnv,
      CODEPAL_IPC_HOST: ipcTarget.host,
      CODEPAL_IPC_PORT: String(ipcTarget.port),
      ...actionResponseEnv,
    },
  });

  await waitForTcpListener(ipcTarget.host, ipcTarget.port);

  return {
    app,
    ipcTarget,
    close: async () => {
      await app.close().catch(() => undefined);
    },
  };
}
