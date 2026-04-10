import net from "node:net";

/** Binds to an ephemeral TCP port on 127.0.0.1 and returns the port number. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close(() => reject(new Error("expected TCP address with port")));
        return;
      }
      const { port } = addr;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}
