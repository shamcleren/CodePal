import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { isPendingAction } from "../../shared/sessionTypes";
import { sendEventLine } from "./sendEventBridge";

function parseWaitMs(env: NodeJS.ProcessEnv): number {
  const raw = env.CODEPAL_HOOK_RESPONSE_WAIT_MS;
  if (raw === undefined || raw === "") {
    return 3_600_000;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 3_600_000;
}

function parseSocketTimeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = env.CODEPAL_ACTION_RESPONSE_SOCKET_TIMEOUT_MS;
  if (raw === undefined || raw === "") {
    return 10_000;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 10_000;
}

type Collector = {
  socketPath: string;
  linePromise: Promise<string>;
  dispose: (reason?: Error) => Promise<void>;
};

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(`${fallbackMessage}: ${String(error)}`);
}

export async function createBlockingHookCollector(waitMs: number): Promise<Collector> {
  const socketDir = await mkdtemp(path.join("/tmp", "codepal-hook-response-"));
  const socketPath = path.join(socketDir, "collector.sock");
  const server = net.createServer();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let activeSocket: net.Socket | null = null;
  let onConnectionHandler: ((socket: net.Socket) => void) | null = null;
  let settled = false;
  let cleanedUp = false;
  let resolveLine!: (line: string) => void;
  let rejectLine!: (error: Error) => void;

  const clearWaitTimer = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const destroyTrackedClient = () => {
    if (activeSocket && !activeSocket.destroyed) {
      activeSocket.destroy();
    }
    activeSocket = null;
  };

  const forceCloseServerSockets = () => {
    destroyTrackedClient();
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
  };

  const settle = (result: { line?: string; error?: Error }) => {
    if (settled) {
      return;
    }
    settled = true;
    clearWaitTimer();
    if (onConnectionHandler) {
      server.off("connection", onConnectionHandler);
      onConnectionHandler = null;
    }
    if (result.error) {
      rejectLine(result.error);
      return;
    }
    resolveLine(result.line ?? "");
  };

  const linePromise = new Promise<string>((resolve, reject) => {
    resolveLine = resolve;
    rejectLine = reject;

    onConnectionHandler = (socket: net.Socket) => {
      if (settled) {
        socket.destroy();
        return;
      }
      if (activeSocket && activeSocket !== socket) {
        socket.destroy();
        return;
      }
      activeSocket = socket;
      let buffer = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex >= 0) {
          socket.destroy();
          activeSocket = null;
          settle({ line: buffer.slice(0, newlineIndex) });
        }
      });
      socket.on("error", (error) => {
        if (activeSocket === socket) {
          activeSocket = null;
        }
        forceCloseServerSockets();
        settle({ error });
      });
      socket.on("close", () => {
        if (activeSocket === socket) {
          activeSocket = null;
        }
      });
    };

    timeoutId = setTimeout(() => {
      forceCloseServerSockets();
      settle({
        error: new Error(
          `runBlockingHookFromRaw: timed out after ${waitMs}ms waiting for action_response line`,
        ),
      });
    }, waitMs);

    server.on("connection", onConnectionHandler);
  });
  void linePromise.catch(() => undefined);

  try {
    await new Promise<void>((resolve, reject) => {
      server.listen(socketPath, () => resolve());
      server.once("error", reject);
    });
  } catch (error) {
    clearWaitTimer();
    forceCloseServerSockets();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await rm(socketDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  async function dispose(
    reason: Error = new Error(
      "runBlockingHookFromRaw: collector disposed before action_response line",
    ),
  ) {
    settle({ error: reason });
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    forceCloseServerSockets();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await rm(socketDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return { socketPath, linePromise, dispose };
}

export async function runBlockingHookFromRaw(
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("runBlockingHookFromRaw: missing payload");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`runBlockingHookFromRaw: invalid JSON: ${message}`);
  }

  if (!isPendingAction(parsed.pendingAction)) {
    await sendEventLine(trimmed, env);
    return undefined;
  }

  const waitMs = parseWaitMs(env);
  const socketTimeoutMs = parseSocketTimeoutMs(env);
  const collector = await createBlockingHookCollector(waitMs);
  let disposeReason: Error | undefined;

  try {
    const outbound = {
      ...parsed,
      responseTarget: {
        mode: "socket" as const,
        socketPath: collector.socketPath,
        timeoutMs: socketTimeoutMs,
      },
    };
    await sendEventLine(JSON.stringify(outbound), env);
    const line = await collector.linePromise;
    return line;
  } catch (error) {
    disposeReason = toError(error, "runBlockingHookFromRaw: blocking bridge failed");
    const collectorRejected = collector.linePromise.catch(() => undefined);
    await collector.dispose(disposeReason);
    await collectorRejected;
    throw error;
  } finally {
    await collector.dispose(disposeReason);
  }
}
