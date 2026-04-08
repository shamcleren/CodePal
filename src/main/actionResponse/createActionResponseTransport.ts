import net from "node:net";
import type { ResponseTarget } from "../../shared/sessionTypes";
import type { ActionResponseTransport } from "./actionResponseTransport";

const ACTION_RESPONSE_SOCKET_TIMEOUT_MS = 1_000;
const INVALID_SOCKET_CONFIG_MESSAGE =
  "[CodePal] action_response socket transport misconfigured; falling back to log transport";

function createLogTransport(): ActionResponseTransport {
  return {
    async send(line: string) {
      console.log("[CodePal] action_response:", line);
    },
  };
}

function resolveSocketTimeoutMs(overrideMs?: number): number {
  if (
    typeof overrideMs === "number" &&
    Number.isFinite(overrideMs) &&
    overrideMs > 0
  ) {
    return overrideMs;
  }
  return ACTION_RESPONSE_SOCKET_TIMEOUT_MS;
}

function createSocketTransport(
  options: net.NetConnectOpts,
  timeoutOverrideMs?: number,
): ActionResponseTransport {
  const effectiveTimeoutMs = resolveSocketTimeoutMs(timeoutOverrideMs);
  return {
    async send(line: string) {
      const payload = `${line}\n`;
      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const finish = (error?: Error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          socket.removeListener("error", onError);

          if (error) {
            reject(error);
            return;
          }

          resolve();
        };

        const onError = (error: Error) => {
          socket.destroy();
          finish(error);
        };

        const socket = net.connect(options, () => {
          socket.write(payload, (err) => {
            if (err) {
              socket.destroy();
              finish(err);
              return;
            }

            socket.end(() => finish());
          });
        });
        const timeoutId = setTimeout(() => {
          socket.destroy();
          finish(
            new Error(
              `[CodePal] action_response socket send timed out after ${effectiveTimeoutMs}ms`,
            ),
          );
        }, effectiveTimeoutMs);

        socket.on("error", onError);
      });
    },
  };
}

function createTcpSocketTransport(host: string, port: number): ActionResponseTransport {
  return createSocketTransport({ host, port });
}

function createUnixSocketTransport(socketPath: string): ActionResponseTransport {
  return createSocketTransport({ path: socketPath });
}

/** 基于 {@link ResponseTarget} 构建一次性 socket transport（与 env 模式共用发送与超时逻辑） */
export function createActionResponseTransportFromResponseTarget(
  target: ResponseTarget,
): ActionResponseTransport {
  return createSocketTransport({ path: target.socketPath }, target.timeoutMs);
}

export function createActionResponseTransport(
  env: NodeJS.ProcessEnv,
): ActionResponseTransport {
  if (env.CODEPAL_ACTION_RESPONSE_MODE === "socket") {
    const socketPath = env.CODEPAL_ACTION_RESPONSE_SOCKET_PATH?.trim();
    if (socketPath) {
      return createUnixSocketTransport(socketPath);
    }
    const host = env.CODEPAL_ACTION_RESPONSE_HOST?.trim();
    const portRaw = env.CODEPAL_ACTION_RESPONSE_PORT?.trim();
    if (host && portRaw) {
      const port = Number(portRaw);
      if (Number.isFinite(port) && port > 0) {
        return createTcpSocketTransport(host, port);
      }
    }

    console.error(INVALID_SOCKET_CONFIG_MESSAGE);
  }

  return createLogTransport();
}
