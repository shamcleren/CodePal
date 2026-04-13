import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startTcpListener } from "./startTcpListener";

const servers: net.Server[] = [];

function createServer() {
  const server = net.createServer();
  servers.push(server);
  return server;
}

async function listenEphemeral(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected tcp address");
  }
  return address.port;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close(() => resolve());
        }),
    ),
  );
});

describe("startTcpListener", () => {
  it("starts listening on a free port", async () => {
    const server = createServer();
    const freePort = await listenEphemeral(createServer());
    // Release the port so startTcpListener can bind it; this avoids
    // port+1 collisions with other processes on shared CI runners.
    const holder = servers.pop()!;
    await new Promise<void>((r) => holder.close(() => r()));

    const result = await startTcpListener(server, "127.0.0.1", freePort);

    expect(result).toEqual({
      status: "listening",
      diagnostics: {
        mode: "tcp",
        host: "127.0.0.1",
        port: freePort,
      },
    });
  });

  it("reports an existing CodePal instance when the port is occupied", async () => {
    const occupied = createServer();
    const port = await listenEphemeral(occupied);
    const server = createServer();

    const result = await startTcpListener(server, "127.0.0.1", port);

    expect(result).toEqual({
      status: "already_running",
      diagnostics: {
        mode: "unavailable",
        message: `已有 CodePal 在运行（127.0.0.1:${port}）`,
      },
    });
  });

  it("reports non-address conflicts as startup failures", async () => {
    const server = {
      once(_event: string, handler: (error: NodeJS.ErrnoException) => void) {
        this.handler = handler;
        return this;
      },
      off() {
        return this;
      },
      listen() {
        queueMicrotask(() => {
          this.handler?.(
            Object.assign(new Error("permission denied"), {
              code: "EACCES",
            }) as NodeJS.ErrnoException,
          );
        });
        return this;
      },
      address() {
        return null;
      },
      handler: undefined as ((error: NodeJS.ErrnoException) => void) | undefined,
    };

    const result = await startTcpListener(server, "127.0.0.1", 17371);

    expect(result.status).toBe("error");
    expect(result.diagnostics).toEqual({
      mode: "unavailable",
      message: "CodePal 接收入口启动失败：permission denied",
    });
  });
});
