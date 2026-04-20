import net from "node:net";

type KeepAliveHookOptions = {
  sessionId: string;
  tool: string;
  host: string;
  port: number;
  writeStdout: (line: string) => void;
  signal: AbortSignal;
  socketPath?: string;
};

export async function runKeepAliveHook(options: KeepAliveHookOptions): Promise<void> {
  const { sessionId, tool, host, port, writeStdout, signal, socketPath } = options;

  return new Promise<void>((resolve) => {
    const connectOptions = socketPath
      ? { path: socketPath }
      : { host, port };

    const socket = net.createConnection(connectOptions, () => {
      const registration = JSON.stringify({
        type: "status_change",
        sessionId,
        tool,
        status: "running",
        timestamp: Date.now(),
        keepAlive: true,
      });
      socket.write(registration + "\n");
    });

    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        if (line.length > 0) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "user_message") {
              writeStdout(line);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      }
    });

    function cleanup() {
      socket.destroy();
      resolve();
    }

    signal.addEventListener("abort", cleanup, { once: true });
    socket.on("close", () => {
      signal.removeEventListener("abort", cleanup);
      resolve();
    });
    socket.on("error", () => {
      signal.removeEventListener("abort", cleanup);
      resolve();
    });
  });
}
