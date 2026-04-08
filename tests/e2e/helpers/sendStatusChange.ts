import { spawn } from "node:child_process";
import { codePalMainJs, resolveElectronExecutable } from "./startHookCliProcess";

const repoRoot = process.cwd();

export async function sendStatusChange(
  payload: Record<string, unknown>,
  ipcSocketPath: string,
): Promise<void> {
  const body = JSON.stringify(payload);
  const mainJs = codePalMainJs(repoRoot);
  const exitCode: number = await new Promise((resolve, reject) => {
    const child = spawn(resolveElectronExecutable(), [mainJs, "--codepal-hook", "send-event"], {
      cwd: repoRoot,
      env: { ...process.env, CODEPAL_SOCKET_PATH: ipcSocketPath },
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
