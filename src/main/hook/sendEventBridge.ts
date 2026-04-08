import net from "node:net";
import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import type { PendingActionType } from "../../shared/sessionTypes";

export function buildActionResponseLine(
  sessionId: string,
  actionId: string,
  option: string,
  actionType: PendingActionType = "single_choice",
): string {
  return stringifyActionResponsePayload(sessionId, actionId, option, actionType);
}

function sendLine(client: net.Socket, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.write(`${body}\n`, (err) => {
      if (err) {
        reject(err);
      } else {
        client.end();
      }
    });
    client.once("error", reject);
    client.once("close", resolve);
  });
}

function resolveSocketPath(env: NodeJS.ProcessEnv): string | undefined {
  return env.CODEPAL_SOCKET_PATH;
}

function resolveIpcHost(env: NodeJS.ProcessEnv): string {
  return env.CODEPAL_IPC_HOST ?? "127.0.0.1";
}

function resolveIpcPort(env: NodeJS.ProcessEnv): number {
  return Number(env.CODEPAL_IPC_PORT ?? "17371");
}

export async function sendEventLine(
  body: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const trimmed = String(body).trim();
  if (!trimmed) {
    throw new Error("sendEventLine: empty body");
  }

  const socketPath = resolveSocketPath(env);

  await new Promise<void>((resolve, reject) => {
    const client = socketPath
      ? net.createConnection(socketPath, onConnect)
      : net.createConnection(
          {
            host: resolveIpcHost(env),
            port: resolveIpcPort(env),
          },
          onConnect,
        );

    function onConnect() {
      void sendLine(client, trimmed).then(resolve).catch(reject);
    }

    client.once("error", reject);
  });
}
