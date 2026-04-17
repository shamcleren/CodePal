import net from "node:net";
import type { UserMessageLine } from "../../shared/messageTypes";

type IpcHubOptions = {
  onMessage: (line: string) => void;
  onConnectionRegistered?: (sessionId: string) => void;
  onConnectionLost?: (sessionId: string) => void;
};

function attachLineStream(socket: net.Socket, onLine: (line: string) => void) {
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length > 0) {
        onLine(line);
      }
    }
  });
}

function extractSessionId(line: string): string | null {
  try {
    const parsed = JSON.parse(line);
    if (typeof parsed === "object" && parsed !== null && typeof parsed.sessionId === "string") {
      return parsed.sessionId;
    }
  } catch {
    // not JSON — ignore
  }
  return null;
}

export function createIpcHub(optionsOrCallback: IpcHubOptions | ((line: string) => void)) {
  const options: IpcHubOptions =
    typeof optionsOrCallback === "function"
      ? { onMessage: optionsOrCallback }
      : optionsOrCallback;

  const connections = new Map<string, net.Socket>();

  const server = net.createServer((socket) => {
    let registeredSessionId: string | null = null;

    attachLineStream(socket, (line) => {
      // Try to register this socket for a sessionId
      if (!registeredSessionId) {
        const sessionId = extractSessionId(line);
        if (sessionId) {
          registeredSessionId = sessionId;
          connections.set(sessionId, socket);
          options.onConnectionRegistered?.(sessionId);
        }
      }
      options.onMessage(line);
    });

    socket.on("close", () => {
      if (registeredSessionId && connections.get(registeredSessionId) === socket) {
        connections.delete(registeredSessionId);
        options.onConnectionLost?.(registeredSessionId);
      }
    });

    socket.on("error", () => {
      // handled by close
    });
  });

  function sendMessageToSession(
    sessionId: string,
    text: string,
  ): { ok: true } | { ok: false; error: string } {
    const socket = connections.get(sessionId);
    if (!socket || socket.destroyed) {
      connections.delete(sessionId);
      return { ok: false, error: "no_connection" };
    }

    const payload: UserMessageLine = {
      type: "user_message",
      sessionId,
      text,
      timestamp: Date.now(),
    };
    socket.write(JSON.stringify(payload) + "\n");
    return { ok: true };
  }

  function getConnectedSessionIds(): string[] {
    return [...connections.keys()];
  }

  return { server, sendMessageToSession, getConnectedSessionIds };
}
