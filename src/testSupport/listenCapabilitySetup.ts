import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

async function closeServer(server: net.Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function canListen(target: number | string, host?: string): Promise<boolean> {
  const server = net.createServer();
  let settled = false;

  return new Promise<boolean>((resolve) => {
    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      void closeServer(server).finally(() => resolve(result));
    };

    server.once("error", () => finish(false));
    try {
      if (host) {
        server.listen(target as number, host, () => finish(true));
      } else {
        server.listen(target, () => finish(true));
      }
    } catch {
      finish(false);
    }
  });
}

if (!process.env.CODEPAL_TEST_CAN_LISTEN_TCP) {
  process.env.CODEPAL_TEST_CAN_LISTEN_TCP = (await canListen(0, "127.0.0.1")) ? "1" : "0";
}

if (!process.env.CODEPAL_TEST_CAN_LISTEN_UNIX) {
  if (process.platform === "win32") {
    process.env.CODEPAL_TEST_CAN_LISTEN_UNIX = "0";
  } else {
    const socketPath = path.join(os.tmpdir(), `codepal-vitest-listen-${process.pid}.sock`);
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // Socket did not exist.
    }
    process.env.CODEPAL_TEST_CAN_LISTEN_UNIX = (await canListen(socketPath)) ? "1" : "0";
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // The listen probe may have failed before creating the socket.
    }
  }
}
