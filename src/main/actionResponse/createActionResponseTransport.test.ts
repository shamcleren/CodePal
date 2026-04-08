import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createActionResponseTransport,
  createActionResponseTransportFromResponseTarget,
} from "./createActionResponseTransport";

describe("createActionResponseTransport", () => {
  it("default mode logs action_response line via console.log", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const transport = createActionResponseTransport({});
    await transport.send('{"x":1}');
    expect(logSpy).toHaveBeenCalledWith("[CodePal] action_response:", '{"x":1}');
    logSpy.mockRestore();
  });

  it("socket mode with TCP host/port sends line terminated with newline", async () => {
    const server = net.createServer();
    const listenReady = new Promise<number>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr !== "string") {
          resolve(addr.port);
        } else {
          reject(new Error("expected TCP address"));
        }
      });
      server.on("error", reject);
    });
    const port = await listenReady;

    const received = new Promise<string>((resolve, reject) => {
      server.once("connection", (socket) => {
        let buf = "";
        socket.on("data", (chunk) => {
          buf += chunk.toString();
          if (buf.endsWith("\n")) {
            resolve(buf.slice(0, -1));
          }
        });
        socket.on("error", reject);
      });
    });

    const transport = createActionResponseTransport({
      CODEPAL_ACTION_RESPONSE_MODE: "socket",
      CODEPAL_ACTION_RESPONSE_HOST: "127.0.0.1",
      CODEPAL_ACTION_RESPONSE_PORT: String(port),
    });
    const linePromise = received;
    await transport.send("hello-line");
    expect(await linePromise).toBe("hello-line");

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("socket mode with unix socket path sends line terminated with newline", async () => {
    const sockPath = path.join(os.tmpdir(), `codepal-ar-test-${Date.now()}.sock`);
    try {
      fs.unlinkSync(sockPath);
    } catch {
      // ignore if missing
    }

    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(sockPath, () => resolve());
      server.on("error", reject);
    });

    const received = new Promise<string>((resolve, reject) => {
      server.once("connection", (socket) => {
        let buf = "";
        socket.on("data", (chunk) => {
          buf += chunk.toString();
          if (buf.endsWith("\n")) {
            resolve(buf.slice(0, -1));
          }
        });
        socket.on("error", reject);
      });
    });

    const transport = createActionResponseTransport({
      CODEPAL_ACTION_RESPONSE_MODE: "socket",
      CODEPAL_ACTION_RESPONSE_SOCKET_PATH: sockPath,
      CODEPAL_ACTION_RESPONSE_HOST: "127.0.0.1",
      CODEPAL_ACTION_RESPONSE_PORT: "9",
    });
    const linePromise = received;
    await transport.send("unix-line");
    expect(await linePromise).toBe("unix-line");

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    try {
      fs.unlinkSync(sockPath);
    } catch {
      // ignore
    }
  });

  it("logs a visible error and falls back to log transport when socket mode config is invalid", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const transport = createActionResponseTransport({
      CODEPAL_ACTION_RESPONSE_MODE: "socket",
    });

    await transport.send("fallback-line");

    expect(errorSpy).toHaveBeenCalledWith(
      "[CodePal] action_response socket transport misconfigured; falling back to log transport",
    );
    expect(logSpy).toHaveBeenCalledWith("[CodePal] action_response:", "fallback-line");

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("rejects and closes the socket when the socket connection times out", async () => {
    vi.useFakeTimers();

    class HangingSocket extends EventEmitter {
      destroyed = false;

      write(): boolean {
        return true;
      }

      end(callback?: () => void): this {
        callback?.();
        return this;
      }

      destroy(): this {
        this.destroyed = true;
        return this;
      }
    }

    const socket = new HangingSocket();
    vi.resetModules();
    vi.doMock("node:net", () => ({
      default: {
        connect: () => socket,
      },
    }));

    const { createActionResponseTransport: createTransportWithMockedNet } = await import(
      "./createActionResponseTransport"
    );
    const transport = createTransportWithMockedNet({
      CODEPAL_ACTION_RESPONSE_MODE: "socket",
      CODEPAL_ACTION_RESPONSE_HOST: "127.0.0.1",
      CODEPAL_ACTION_RESPONSE_PORT: "1234",
    });

    const sendPromise = transport.send("timeout-line");
    const settledSpy = vi.fn();
    sendPromise.then(
      () => settledSpy("resolved"),
      (error: Error) => settledSpy(error.message),
    );

    await vi.advanceTimersByTimeAsync(1100);

    expect(settledSpy).toHaveBeenCalledWith(expect.stringContaining("timed out"));
    expect(socket.destroyed).toBe(true);

    await expect(sendPromise).rejects.toThrow("timed out");
    vi.doUnmock("node:net");
    vi.resetModules();
    vi.useRealTimers();
  });

  it("createActionResponseTransportFromResponseTarget sends via unix socket path", async () => {
    const sockPath = path.join(os.tmpdir(), `codepal-ar-rt-${Date.now()}.sock`);
    try {
      fs.unlinkSync(sockPath);
    } catch {
      // ignore if missing
    }

    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(sockPath, () => resolve());
      server.on("error", reject);
    });

    const received = new Promise<string>((resolve, reject) => {
      server.once("connection", (socket) => {
        let buf = "";
        socket.on("data", (chunk) => {
          buf += chunk.toString();
          if (buf.endsWith("\n")) {
            resolve(buf.slice(0, -1));
          }
        });
        socket.on("error", reject);
      });
    });

    const transport = createActionResponseTransportFromResponseTarget({
      mode: "socket",
      socketPath: sockPath,
    });
    await transport.send("from-target");
    expect(await received).toBe("from-target");

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    try {
      fs.unlinkSync(sockPath);
    } catch {
      // ignore
    }
  });

  it("createActionResponseTransportFromResponseTarget uses ResponseTarget.timeoutMs for socket timeout", async () => {
    vi.useFakeTimers();

    class HangingSocket extends EventEmitter {
      destroyed = false;

      write(): boolean {
        return true;
      }

      end(callback?: () => void): this {
        callback?.();
        return this;
      }

      destroy(): this {
        this.destroyed = true;
        return this;
      }
    }

    const socket = new HangingSocket();
    vi.resetModules();
    vi.doMock("node:net", () => ({
      default: {
        connect: () => socket,
      },
    }));

    const {
      createActionResponseTransportFromResponseTarget: createFromTargetWithMockedNet,
    } = await import("./createActionResponseTransport");
    const transport = createFromTargetWithMockedNet({
      mode: "socket",
      socketPath: "/tmp/x.sock",
      timeoutMs: 2_500,
    });

    const sendPromise = transport.send("x");
    const settledSpy = vi.fn();
    sendPromise.then(
      () => settledSpy("resolved"),
      (error: Error) => settledSpy(error.message),
    );

    await vi.advanceTimersByTimeAsync(2_500);

    expect(settledSpy).toHaveBeenCalledWith(expect.stringContaining("2500ms"));
    expect(socket.destroyed).toBe(true);
    await expect(sendPromise).rejects.toThrow("2500ms");

    vi.doUnmock("node:net");
    vi.resetModules();
    vi.useRealTimers();
  });
});
