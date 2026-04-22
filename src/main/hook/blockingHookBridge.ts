import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { isPendingAction, type ResponseTarget } from "../../shared/sessionTypes";
import { sendEventLine } from "./sendEventBridge";

/**
 * Max time the hook blocks waiting for CodePal to deliver an action_response.
 * Two minutes is the upper bound on "user is still deciding" — longer than
 * that and we'd rather fall back to Claude's native flow than keep the agent
 * hostage. Env override `CODEPAL_HOOK_RESPONSE_WAIT_MS` still wins (e.g.
 * someone who steps away from the desk can crank it to 1h for their setup).
 */
const DEFAULT_HOOK_WAIT_MS = 120_000;

/**
 * Max time the hook waits for CodePal's handshake after sending the event.
 * If CodePal is not running, `net.createConnection` fails in ms via
 * ECONNREFUSED (handled separately). This timeout catches the "CodePal hub is
 * listening but the process is hung / crashed mid-event" case — we want to
 * fall back to native flow in ~1.5s rather than waiting the full waitMs.
 */
const DEFAULT_HOOK_HANDSHAKE_TIMEOUT_MS = 1_500;

function parseWaitMs(env: NodeJS.ProcessEnv): number {
  const raw = env.CODEPAL_HOOK_RESPONSE_WAIT_MS;
  if (raw === undefined || raw === "") {
    return DEFAULT_HOOK_WAIT_MS;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_HOOK_WAIT_MS;
}

function parseHandshakeTimeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = env.CODEPAL_HOOK_HANDSHAKE_TIMEOUT_MS;
  if (raw === undefined || raw === "") {
    return DEFAULT_HOOK_HANDSHAKE_TIMEOUT_MS;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_HOOK_HANDSHAKE_TIMEOUT_MS;
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
  responseTarget: ResponseTarget;
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
  const server = net.createServer();
  let socketDir: string | null = null;
  let responseTarget: ResponseTarget | null = null;

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
    socketDir = await mkdtemp(path.join("/tmp", "codepal-hook-response-"));
    const socketPath = path.join(socketDir, "collector.sock");
    await new Promise<void>((resolve, reject) => {
      server.listen(socketPath, () => resolve());
      server.once("error", reject);
    });
    responseTarget = {
      mode: "socket",
      socketPath,
    };
  } catch (error) {
    const err = toError(error, "runBlockingHookFromRaw: failed to start unix collector");
    const code = (err as NodeJS.ErrnoException).code;
    const canFallback = code === "EPERM" || code === "EACCES";

    if (!canFallback) {
      clearWaitTimer();
      forceCloseServerSockets();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      if (socketDir) {
        await rm(socketDir, { recursive: true, force: true }).catch(() => undefined);
      }
      throw err;
    }

    if (socketDir) {
      await rm(socketDir, { recursive: true, force: true }).catch(() => undefined);
      socketDir = null;
    }

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("runBlockingHookFromRaw: expected TCP address for fallback collector");
    }
    responseTarget = {
      mode: "socket",
      host: "127.0.0.1",
      port: address.port,
    };
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
    if (socketDir) {
      await rm(socketDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  if (responseTarget === null) {
    throw new Error("runBlockingHookFromRaw: collector missing response target");
  }

  return { responseTarget, linePromise, dispose };
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
  const handshakeTimeoutMs = parseHandshakeTimeoutMs(env);
  const collector = await createBlockingHookCollector(waitMs);
  let disposeReason: Error | undefined;

  try {
    const outbound = {
      ...parsed,
      responseTarget: {
        ...collector.responseTarget,
        timeoutMs: socketTimeoutMs,
      },
      // Tell CodePal how long this pending action should live in the UI —
      // aligned with our own blocking wait so the card doesn't disappear
      // before the hook gives up. Separate from responseTarget.timeoutMs
      // which is the socket write timeout when CodePal delivers the decision.
      pendingLifetimeMs: waitMs,
    };
    await sendEventLine(JSON.stringify(outbound), env, {
      // 1.5s handshake confirms CodePal's hub actually parsed our event.
      // Without this, a half-alive CodePal (listening but not processing)
      // would force the agent to wait the full waitMs before falling back.
      waitForAck: true,
      ackTimeoutMs: handshakeTimeoutMs,
    });
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
