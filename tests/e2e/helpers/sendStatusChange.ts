import { spawn } from "node:child_process";
import type { ResponseTarget } from "../../../src/shared/sessionTypes";
import { codePalMainJs, resolveElectronExecutable } from "./startHookCliProcess";

const repoRoot = process.cwd();

export async function sendStatusChange(
  payload: Record<string, unknown>,
  ipcTarget: Extract<ResponseTarget, { host: string; port: number }>,
): Promise<void> {
  const body = JSON.stringify(payload);
  const mainJs = codePalMainJs(repoRoot);
  const exitCode: number = await new Promise((resolve, reject) => {
    const child = spawn(resolveElectronExecutable(), [mainJs, "--codepal-hook", "send-event"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        CODEPAL_SOCKET_PATH: "",
        CODEPAL_IPC_HOST: ipcTarget.host,
        CODEPAL_IPC_PORT: String(ipcTarget.port),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.on("error", reject);
    child.stdin.write(body);
    child.stdin.end();
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`codepal-hook send-event exited with code ${exitCode}`);
  }
}
