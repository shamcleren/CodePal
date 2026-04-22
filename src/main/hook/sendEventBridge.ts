import net from "node:net";
import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import type { PendingActionType } from "../../shared/sessionTypes";
import { readTerminalContextFromEnv, stampTerminalMetaOnEventLine } from "./terminalMeta";

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

/**
 * Write a line, then wait for the hub to write back any newline-terminated
 * response before letting the caller proceed. Used by blocking-hook senders
 * that want to confirm the hub actually parsed the event — a half-alive
 * CodePal (listening but hung) would otherwise let the agent block for the
 * full hook wait timeout. If no ack arrives before `ackTimeoutMs`, rejects
 * with an error (caller falls back to native flow).
 */
function sendLineWithAck(
  client: net.Socket,
  body: string,
  ackTimeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let acked = false;
    let settled = false;

    const settle = (result: { ok: true } | { ok: false; error: Error }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result.ok) {
        resolve();
      } else {
        reject(result.error);
      }
      if (!client.destroyed) {
        client.end();
      }
    };

    const timer = setTimeout(() => {
      settle({
        ok: false,
        error: new Error(`sendEventLine: handshake timed out after ${ackTimeoutMs}ms`),
      });
    }, ackTimeoutMs);

    client.setEncoding("utf8");
    client.on("data", (chunk: string) => {
      buffer += chunk;
      if (!acked && buffer.includes("\n")) {
        acked = true;
        settle({ ok: true });
      }
    });
    client.on("error", (err) => {
      settle({ ok: false, error: err });
    });
    client.on("close", () => {
      if (!acked) {
        settle({
          ok: false,
          error: new Error("sendEventLine: hub closed connection before ack"),
        });
      }
    });

    client.write(`${body}\n`, (err) => {
      if (err) {
        settle({ ok: false, error: err });
      }
    });
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

export type SendEventLineOptions = {
  /**
   * When true, `sendEventLine` waits for the hub to write back a newline-
   * terminated ack before resolving. If no ack arrives within `ackTimeoutMs`,
   * the promise rejects. Blocking-hook callers set this to detect a
   * half-alive CodePal and fall back to the native flow quickly.
   */
  waitForAck?: boolean;
  /** Ack wait budget when `waitForAck` is true. Default 1500ms. */
  ackTimeoutMs?: number;
};

export async function sendEventLine(
  body: string,
  env: NodeJS.ProcessEnv = process.env,
  options: SendEventLineOptions = {},
): Promise<void> {
  const trimmed = String(body).trim();
  if (!trimmed) {
    throw new Error("sendEventLine: empty body");
  }

  // Stamp wrapper-captured terminal metadata onto event lines before they hit
  // the IPC hub. Non-JSON / non-object bodies pass through unchanged, and the
  // stamp is a no-op when no CODEPAL_TERM_* env vars are set (e.g. unit
  // tests, or when the wrapper couldn't observe a terminal).
  const stamped = stampTerminalMetaOnEventLine(trimmed, readTerminalContextFromEnv(env));

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
      if (options.waitForAck) {
        const ackMs = options.ackTimeoutMs ?? 1_500;
        void sendLineWithAck(client, stamped, ackMs).then(resolve).catch(reject);
      } else {
        void sendLine(client, stamped).then(resolve).catch(reject);
      }
    }

    client.once("error", reject);
  });
}
