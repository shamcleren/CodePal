import net from "node:net";

export function probeListenSync(): boolean {
  try {
    const server = net.createServer();
    let ok = false;
    server.on("error", () => {});
    server.listen(0, "127.0.0.1", () => {
      ok = true;
      server.close();
    });
    // Give the async listen a tick to either succeed or error
    // On EPERM the error fires synchronously in the same tick on some platforms
    return ok;
  } catch {
    return false;
  }
}

export async function probeListen(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const server = net.createServer();
      server.on("error", () => resolve(false));
      server.listen(0, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    } catch {
      resolve(false);
    }
  });
}
