import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import { buildActionResponseLine, sendEventLine } from "../hook/sendEventBridge";
import { createIpcHub } from "./ipcHub";

describe("buildActionResponseLine (sendEventBridge)", () => {
  it("matches main-process stringifyActionResponsePayload", () => {
    expect(buildActionResponseLine("s1", "a1", "OK")).toBe(
      stringifyActionResponsePayload("s1", "a1", "OK"),
    );
  });
});

describe("sendEventLine (TCP)", () => {
  it("writes one newline-terminated JSON line to the hub", async () => {
    const onMessage = vi.fn();
    const { server } = createIpcHub(onMessage);
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected TCP address");
    }

    const payload = JSON.stringify({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      task: "fix auth bug",
      timestamp: 1,
    });

    await sendEventLine(payload, {
      ...process.env,
      CODEPAL_IPC_PORT: String(address.port),
      CODEPAL_SOCKET_PATH: "",
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("sendEventLine (unix socket)", () => {
  it.skipIf(process.platform === "win32")(
    "writes one line when CODEPAL_SOCKET_PATH is set",
    async () => {
      const socketPath = join(os.tmpdir(), `codepal-bridge-${Date.now()}.sock`);
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // ENOENT
      }

      const onMessage = vi.fn();
      const { server } = createIpcHub(onMessage);
      await new Promise<void>((resolve, reject) => {
        server.listen(socketPath, () => resolve());
        server.once("error", reject);
      });

      const payload = JSON.stringify({
        type: "status_change",
        sessionId: "u1",
        tool: "cursor",
        status: "idle",
        timestamp: 2,
      });

      await sendEventLine(payload, { ...process.env, CODEPAL_SOCKET_PATH: socketPath });

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(payload);

      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // ignore
      }
    },
  );
});
