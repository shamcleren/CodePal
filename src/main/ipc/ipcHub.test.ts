import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import net from "node:net";
import { createIpcHub } from "./ipcHub";

function connectAndWrite(port: number, lines: string[]): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
      for (const line of lines) {
        socket.write(line + "\n");
      }
      resolve(socket);
    });
    socket.on("error", reject);
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createIpcHub", () => {
  let hub: ReturnType<typeof createIpcHub>;
  let port: number;

  afterEach(async () => {
    hub?.server.close();
    await waitMs(50);
  });

  it("registers a connection when a line with sessionId arrives", async () => {
    const onMessage = vi.fn();
    const onConnectionRegistered = vi.fn();
    hub = createIpcHub({ onMessage, onConnectionRegistered });
    await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
    port = (hub.server.address() as net.AddressInfo).port;

    const line = JSON.stringify({ type: "status_change", sessionId: "sess-1", status: "running", tool: "codebuddy" });
    const socket = await connectAndWrite(port, [line]);
    await waitMs(50);

    expect(onMessage).toHaveBeenCalledWith(line);
    expect(onConnectionRegistered).toHaveBeenCalledWith("sess-1");
    expect(hub.getConnectedSessionIds()).toContain("sess-1");

    socket.destroy();
    await waitMs(50);
    expect(hub.getConnectedSessionIds()).not.toContain("sess-1");
  });

  it("sendMessageToSession writes a JSON line to the registered socket", async () => {
    const onMessage = vi.fn();
    hub = createIpcHub({ onMessage });
    await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
    port = (hub.server.address() as net.AddressInfo).port;

    const line = JSON.stringify({ type: "status_change", sessionId: "sess-2", status: "running", tool: "claude" });
    const socket = await connectAndWrite(port, [line]);
    await waitMs(50);

    const received: string[] = [];
    socket.on("data", (chunk) => received.push(chunk.toString("utf8")));

    const result = hub.sendMessageToSession("sess-2", "please continue");
    expect(result).toEqual({ ok: true });

    await waitMs(50);
    expect(received.length).toBe(1);
    const parsed = JSON.parse(received[0].trim());
    expect(parsed.type).toBe("user_message");
    expect(parsed.sessionId).toBe("sess-2");
    expect(parsed.text).toBe("please continue");
    expect(typeof parsed.timestamp).toBe("number");

    socket.destroy();
  });

  it("sendMessageToSession returns error when no connection exists", () => {
    hub = createIpcHub({ onMessage: vi.fn() });
    const result = hub.sendMessageToSession("nonexistent", "hello");
    expect(result).toEqual({ ok: false, error: "no_connection" });
  });

  it("removes connection on disconnect and fires onConnectionLost", async () => {
    const onConnectionLost = vi.fn();
    hub = createIpcHub({ onMessage: vi.fn(), onConnectionLost });
    await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
    port = (hub.server.address() as net.AddressInfo).port;

    const line = JSON.stringify({ type: "status_change", sessionId: "sess-3", status: "running", tool: "codex" });
    const socket = await connectAndWrite(port, [line]);
    await waitMs(50);
    expect(hub.getConnectedSessionIds()).toContain("sess-3");

    socket.destroy();
    await waitMs(50);
    expect(hub.getConnectedSessionIds()).not.toContain("sess-3");
    expect(onConnectionLost).toHaveBeenCalledWith("sess-3");
  });

  it("new connection for same sessionId replaces old one", async () => {
    hub = createIpcHub({ onMessage: vi.fn() });
    await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
    port = (hub.server.address() as net.AddressInfo).port;

    const line = JSON.stringify({ type: "status_change", sessionId: "sess-4", status: "running", tool: "cursor" });
    const socket1 = await connectAndWrite(port, [line]);
    await waitMs(50);

    const socket2 = await connectAndWrite(port, [line]);
    await waitMs(50);

    // Only one entry for sess-4
    expect(hub.getConnectedSessionIds().filter((id: string) => id === "sess-4").length).toBe(1);

    // Message goes to socket2, not socket1
    const received: string[] = [];
    socket2.on("data", (chunk) => received.push(chunk.toString("utf8")));

    hub.sendMessageToSession("sess-4", "test");
    await waitMs(50);
    expect(received.length).toBe(1);

    socket1.destroy();
    socket2.destroy();
  });
});
