import net from "node:net";
import type { ResponseTarget } from "../../../src/shared/sessionTypes";

/**
 * Send a status_change line to a running CodePal IPC hub.
 *
 * Earlier this helper spawned a full Electron child via `--codepal-hook
 * send-event`, which works on a developer's machine but reliably hung in CI
 * because the freshly-spawned Electron process never reached
 * `process.exit(0)` before the test timeout (CDP attach + bootstrap take
 * longer than the 60s test budget). The hook itself just does a TCP write
 * to the same hub the test already knows about, so we can do that write
 * inline without spawning anything.
 *
 * IMPORTANT: resolve as soon as the write callback fires. The hub keeps the
 * socket open after receiving a line (it registers the session for future
 * outbound writes), so awaiting `close` would block until the hub itself
 * shuts down. The original CLI didn't notice because the OS closed the
 * socket when the child process terminated.
 */
export async function sendStatusChange(
  payload: Record<string, unknown>,
  ipcTarget: Extract<ResponseTarget, { host: string; port: number }>,
): Promise<void> {
  const body = `${JSON.stringify(payload)}\n`;

  await new Promise<void>((resolve, reject) => {
    const client = net.createConnection({ host: ipcTarget.host, port: ipcTarget.port }, () => {
      client.write(body, (writeErr) => {
        if (writeErr) {
          client.destroy();
          reject(writeErr);
          return;
        }
        // Hand the FIN off to the OS; do NOT await `close` — see note above.
        client.end();
        resolve();
      });
    });

    client.once("error", reject);
  });
}
