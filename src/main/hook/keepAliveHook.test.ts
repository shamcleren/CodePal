import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import { runKeepAliveHook } from "./keepAliveHook";

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runKeepAliveHook", () => {
  let server: net.Server;
  let port: number;
  let receivedLines: string[];
  let clientSocket: net.Socket | null;

  afterEach(() => {
    clientSocket?.destroy();
    server?.close();
  });

  async function startServer(): Promise<void> {
    receivedLines = [];
    clientSocket = null;
    server = net.createServer((socket) => {
      clientSocket = socket;
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (line.length > 0) receivedLines.push(line);
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as net.AddressInfo).port;
  }

  it("connects and sends registration event", async () => {
    await startServer();

    const stdout: string[] = [];
    const writeStdout = (s: string) => { stdout.push(s); };
    const abort = new AbortController();

    const promise = runKeepAliveHook({
      sessionId: "ka-1",
      tool: "codebuddy",
      host: "127.0.0.1",
      port,
      writeStdout,
      signal: abort.signal,
    });

    await waitMs(100);
    expect(receivedLines.length).toBe(1);
    const parsed = JSON.parse(receivedLines[0]);
    expect(parsed.type).toBe("status_change");
    expect(parsed.sessionId).toBe("ka-1");
    expect(parsed.tool).toBe("codebuddy");
    expect(parsed.keepAlive).toBe(true);

    abort.abort();
    await promise;
  });

  it("forwards user_message lines to stdout", async () => {
    await startServer();

    const stdout: string[] = [];
    const writeStdout = (s: string) => { stdout.push(s); };
    const abort = new AbortController();

    const promise = runKeepAliveHook({
      sessionId: "ka-2",
      tool: "claude",
      host: "127.0.0.1",
      port,
      writeStdout,
      signal: abort.signal,
    });

    await waitMs(100);

    const msg = JSON.stringify({ type: "user_message", sessionId: "ka-2", text: "hello", timestamp: Date.now() });
    clientSocket!.write(msg + "\n");
    await waitMs(100);

    expect(stdout.length).toBe(1);
    const parsed = JSON.parse(stdout[0]);
    expect(parsed.type).toBe("user_message");
    expect(parsed.text).toBe("hello");

    abort.abort();
    await promise;
  });
});
