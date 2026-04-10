import net from "node:net";

function attachLineStream(socket: net.Socket, onLine: (line: string) => void) {
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length > 0) {
        onLine(line);
      }
    }
  });
}

export function createIpcHub(onMessage: (line: string) => void) {
  const server = net.createServer((socket) => {
    attachLineStream(socket, onMessage);
  });

  return { server };
}
