import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createIpcHub } from "./ipcHub";

async function listen(server: net.Server): Promise<net.AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("expected TCP server address");
  }
  return address;
}

function connect(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ port, host: "127.0.0.1" }, () =>
      resolve(client),
    );
    client.once("error", reject);
  });
}

async function closeServer(server: net.Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("createIpcHub", () => {
  it("consumes a single line JSON string", async () => {
    const onMessage = vi.fn();
    const { server } = createIpcHub(onMessage);
    const address = await listen(server);
    const payload = JSON.stringify({ hello: "world" });

    const client = await connect(address.port);
    await new Promise<void>((resolve, reject) => {
      client.write(`${payload}\n`, (err) => {
        if (err) reject(err);
        else client.end();
      });
      client.once("close", () => resolve());
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);
    expect(JSON.parse(onMessage.mock.calls[0][0] as string)).toEqual({
      hello: "world",
    });

    await closeServer(server);
  });

  it("reassembles a line split across multiple TCP chunks", async () => {
    const onMessage = vi.fn();
    const { server } = createIpcHub(onMessage);
    const address = await listen(server);
    const payload = JSON.stringify({ sessionId: "a", part: 2 });

    const client = await connect(address.port);
    const mid = Math.floor(payload.length / 2);
    await new Promise<void>((resolve, reject) => {
      client.write(payload.slice(0, mid), (e1) => {
        if (e1) {
          reject(e1);
          return;
        }
        client.write(payload.slice(mid) + "\n", (e2) => {
          if (e2) reject(e2);
          else client.end();
        });
      });
      client.once("close", () => resolve());
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);
    await closeServer(server);
  });

  it("emits multiple lines from one TCP chunk (sticky packets)", async () => {
    const onMessage = vi.fn();
    const { server } = createIpcHub(onMessage);
    const address = await listen(server);
    const a = JSON.stringify({ n: 1 });
    const b = JSON.stringify({ n: 2 });

    const client = await connect(address.port);
    await new Promise<void>((resolve, reject) => {
      client.write(`${a}\n${b}\n`, (err) => {
        if (err) reject(err);
        else client.end();
      });
      client.once("close", () => resolve());
    });

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, a);
    expect(onMessage).toHaveBeenNthCalledWith(2, b);
    await closeServer(server);
  });

  it.skipIf(process.platform === "win32")(
    "consumes a single line over a unix domain socket",
    async () => {
      const sock = path.join(os.tmpdir(), `codepal-ipc-${Date.now()}.sock`);
      try {
        fs.unlinkSync(sock);
      } catch {
        /* ENOENT */
      }

      const onMessage = vi.fn();
      const { server } = createIpcHub(onMessage);
      await new Promise<void>((resolve, reject) => {
        server.listen(sock, () => resolve());
        server.once("error", reject);
      });

      const payload = JSON.stringify({ via: "unix" });
      const client = await new Promise<net.Socket>((resolve, reject) => {
        const c = net.createConnection(sock, () => resolve(c));
        c.once("error", reject);
      });

      await new Promise<void>((resolve, reject) => {
        client.write(`${payload}\n`, (err) => {
          if (err) reject(err);
          else client.end();
        });
        client.once("close", () => resolve());
      });

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(payload);

      await closeServer(server);
      try {
        fs.unlinkSync(sock);
      } catch {
        /* already gone */
      }
    },
  );
});
