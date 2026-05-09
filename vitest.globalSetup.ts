import net from "node:net";

export function setup(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const server = net.createServer();
      server.on("error", () => {
        process.env.VITEST_CAN_LISTEN = "false";
        resolve();
      });
      server.listen(0, "127.0.0.1", () => {
        server.close(() => {
          process.env.VITEST_CAN_LISTEN = "true";
          resolve();
        });
      });
    } catch {
      process.env.VITEST_CAN_LISTEN = "false";
      resolve();
    }
  });
}
