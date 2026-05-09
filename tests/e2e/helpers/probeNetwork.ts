import net from "node:net";

let cached: boolean | undefined;

export async function canListen(): Promise<boolean> {
  if (cached !== undefined) return cached;
  return new Promise<boolean>((resolve) => {
    try {
      const server = net.createServer();
      server.on("error", () => {
        cached = false;
        resolve(false);
      });
      server.listen(0, "127.0.0.1", () => {
        server.close(() => {
          cached = true;
          resolve(true);
        });
      });
    } catch {
      cached = false;
      resolve(false);
    }
  });
}
