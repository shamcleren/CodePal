import { promises as fs } from "node:fs";
import path from "node:path";
import type { ElectronApplication } from "@playwright/test";
import { _electron as electron } from "@playwright/test";

const repoRoot = process.cwd();

export type LaunchCodePalOptions = {
  actionResponseSocketPath: string;
  homeDir?: string;
};

export type LaunchedCodePal = {
  app: ElectronApplication;
  ipcSocketPath: string;
  close: () => Promise<void>;
};

async function waitForSocketPath(socketPath: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fs.access(socketPath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`Timed out waiting for CodePal IPC socket: ${socketPath}`);
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
  const socketDir = await fs.mkdtemp(path.join("/tmp", "codepal-ipc-"));
  const ipcSocketPath = path.join(socketDir, "hub.sock");
  delete env.ELECTRON_RENDERER_URL;
  delete env.CODEPAL_SOCKET_PATH;
  delete env.CODEPAL_IPC_PORT;
  delete env.CODEPAL_ACTION_RESPONSE_HOST;
  delete env.CODEPAL_ACTION_RESPONSE_PORT;

  const app = await electron.launch({
    args: [mainJs],
    cwd: repoRoot,
    env: {
      ...env,
      ...(options.homeDir ? { HOME: options.homeDir, USERPROFILE: options.homeDir } : {}),
      ...(options.homeDir ? { CODEPAL_HOME_DIR: options.homeDir } : {}),
      CODEPAL_SOCKET_PATH: ipcSocketPath,
      CODEPAL_ACTION_RESPONSE_MODE: "socket",
      CODEPAL_ACTION_RESPONSE_SOCKET_PATH: options.actionResponseSocketPath,
    },
  });

  await waitForSocketPath(ipcSocketPath);

  return {
    app,
    ipcSocketPath,
    close: async () => {
      await app.close().catch(() => undefined);
      await fs.rm(socketDir, { recursive: true, force: true });
    },
  };
}
