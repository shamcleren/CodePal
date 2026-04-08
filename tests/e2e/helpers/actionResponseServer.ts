import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";

export type ActionResponseCollector = {
  socketPath: string;
  waitForLine: () => Promise<string>;
  /**
   * Assert that no client connects to the collector within `ms`.
   */
  expectNoFurtherConnections: (ms: number) => Promise<void>;
  close: () => Promise<void>;
};

/**
 * Unix socket server that accepts the first connection and resolves the first
 * newline-terminated line.
 */
export async function startActionResponseCollector(): Promise<ActionResponseCollector> {
  const socketDir = await fs.mkdtemp(path.join("/tmp", "codepal-action-response-"));
  const socketPath = path.join(socketDir, "collector.sock");
  const server = net.createServer();
  let firstLine: string | null = null;
  let firstError: Error | null = null;
  let firstSocket: net.Socket | null = null;
  let waitForLinePromise: Promise<string> | null = null;
  let waitForLineResolve: ((line: string) => void) | null = null;
  let waitForLineReject: ((err: Error) => void) | null = null;
  let waitForLineTimer: ReturnType<typeof setTimeout> | null = null;

  function clearWaitForLineTimer() {
    if (waitForLineTimer !== null) {
      clearTimeout(waitForLineTimer);
      waitForLineTimer = null;
    }
  }

  function resolveWaitForLine(line: string) {
    if (firstLine !== null || firstError !== null) {
      return;
    }
    firstLine = line;
    clearWaitForLineTimer();
    waitForLineResolve?.(line);
    waitForLineResolve = null;
    waitForLineReject = null;
  }

  function rejectWaitForLine(err: Error) {
    if (firstLine !== null || firstError !== null) {
      return;
    }
    firstError = err;
    clearWaitForLineTimer();
    waitForLineReject?.(err);
    waitForLineResolve = null;
    waitForLineReject = null;
  }

  const onFirstConnection = (socket: net.Socket) => {
    server.off("connection", onFirstConnection);
    firstSocket = socket;
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const nl = buffer.indexOf("\n");
      if (nl >= 0) {
        socket.destroy();
        resolveWaitForLine(buffer.slice(0, nl));
      }
    });
    socket.on("error", (err) => {
      rejectWaitForLine(err);
    });
  };

  await new Promise<void>((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.once("error", reject);
  });
  server.on("connection", onFirstConnection);

  function waitForLine(): Promise<string> {
    if (firstLine !== null) {
      return Promise.resolve(firstLine);
    }
    if (firstError !== null) {
      return Promise.reject(firstError);
    }
    if (waitForLinePromise !== null) {
      return waitForLinePromise;
    }
    waitForLinePromise = new Promise<string>((resolve, reject) => {
      waitForLineResolve = resolve;
      waitForLineReject = reject;
      waitForLineTimer = setTimeout(() => {
        rejectWaitForLine(new Error("action_response collector timed out waiting for a line"));
      }, 25_000);
    });
    return waitForLinePromise;
  }

  function expectNoFurtherConnections(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onExtraConn = (socket: net.Socket) => {
        clearTimeout(timer);
        server.removeListener("connection", onExtraConn);
        socket.destroy();
        reject(new Error("Unexpected extra connection to action_response collector"));
      };
      const timer = setTimeout(() => {
        server.removeListener("connection", onExtraConn);
        resolve();
      }, ms);
      server.on("connection", onExtraConn);
    });
  }

  return {
    socketPath,
    waitForLine,
    expectNoFurtherConnections,
    close: async () => {
      server.removeListener("connection", onFirstConnection);
      clearWaitForLineTimer();
      if (firstSocket !== null && !firstSocket.destroyed) {
        firstSocket.destroy();
      }
      if (waitForLineReject !== null && firstLine === null && firstError === null) {
        rejectWaitForLine(new Error("action_response collector closed while waiting for a line"));
      }
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await fs.rm(socketDir, { recursive: true, force: true });
    },
  };
}
