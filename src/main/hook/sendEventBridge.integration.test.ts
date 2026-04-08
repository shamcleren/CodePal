import fs from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createActionResponseTransportFromResponseTarget } from "../actionResponse/createActionResponseTransport";
import { createIpcHub } from "../ipc/ipcHub";
import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import { createBlockingHookCollector, runBlockingHookFromRaw } from "./blockingHookBridge";
import { buildActionResponseLine, sendEventLine } from "./sendEventBridge";

describe("buildActionResponseLine", () => {
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

  it("rejects empty body", async () => {
    await expect(sendEventLine("  ", process.env)).rejects.toThrow("empty body");
  });
});

describe("sendEventLine (unix socket)", () => {
  it.skipIf(process.platform === "win32")(
    "writes one line when CODEPAL_SOCKET_PATH is set",
    async () => {
      const socketPath = join(os.tmpdir(), `codepal-bridge-ts-${Date.now()}.sock`);
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

describe("runBlockingHookFromRaw", () => {
  it.skipIf(process.platform === "win32")(
    "dispose rejects a pending collector linePromise",
    async () => {
      const collector = await createBlockingHookCollector(5_000);
      const settled = vi.fn();

      collector.linePromise.then(
        (line) => settled(line),
        (error: Error) => settled(error.message),
      );

      await collector.dispose(new Error("synthetic dispose failure"));
      await Promise.resolve();

      expect(settled).toHaveBeenCalledWith(expect.stringContaining("synthetic dispose failure"));
    },
  );

  it("throws on invalid JSON", async () => {
    await expect(runBlockingHookFromRaw("{not json")).rejects.toThrow("invalid JSON");
  });

  it("throws on empty payload", async () => {
    await expect(runBlockingHookFromRaw("   ")).rejects.toThrow("missing payload");
  });

  it("without valid pendingAction sends like sendEventLine and returns undefined", async () => {
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
      sessionId: "s2",
      tool: "cursor",
      status: "running",
      timestamp: 3,
    });

    const env = {
      ...process.env,
      CODEPAL_IPC_PORT: String(address.port),
      CODEPAL_SOCKET_PATH: "",
    };
    const output = await runBlockingHookFromRaw(payload, env);

    expect(output).toBeUndefined();
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.skipIf(process.platform === "win32")(
    "with valid pendingAction injects responseTarget and resolves first action_response line",
    async () => {
      const onMessage = vi.fn((line: string) => {
        void (async () => {
          const payload = JSON.parse(line) as {
            responseTarget?: { mode: "socket"; socketPath: string; timeoutMs?: number };
            sessionId: string;
            pendingAction: { id: string };
          };
          if (payload.responseTarget) {
            const transport = createActionResponseTransportFromResponseTarget(payload.responseTarget);
            await transport.send(
              buildActionResponseLine(
                payload.sessionId,
                payload.pendingAction.id,
                "Allow",
                "approval",
              ),
            );
          }
        })();
      });

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
        sessionId: "sess-block",
        tool: "cursor",
        status: "waiting",
        timestamp: 4,
        pendingAction: {
          id: "pa-1",
          type: "approval",
          title: "Confirm?",
          options: ["Allow", "Deny"],
        },
      });

      const env = {
        ...process.env,
        CODEPAL_IPC_PORT: String(address.port),
        CODEPAL_SOCKET_PATH: "",
        CODEPAL_HOOK_RESPONSE_WAIT_MS: "5000",
      };

      const line = await runBlockingHookFromRaw(payload, env);
      expect(line).toBe(buildActionResponseLine("sess-block", "pa-1", "Allow", "approval"));
      expect(onMessage).toHaveBeenCalledTimes(1);
      const sent = onMessage.mock.calls[0][0] as string;
      const parsed = JSON.parse(sent) as { responseTarget: { socketPath: string } };
      expect(parsed.responseTarget.socketPath).toBeTruthy();

      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  );

  it.skipIf(process.platform === "win32")(
    "cleans up the collector when sendEventLine fails in blocking mode",
    async () => {
      let responseSocketPath = "";
      vi.resetModules();
      vi.doMock("./sendEventBridge", async () => {
        const actual = await vi.importActual<typeof import("./sendEventBridge")>("./sendEventBridge");
        return {
          ...actual,
          sendEventLine: vi.fn(async (body: string) => {
            const payload = JSON.parse(body) as { responseTarget?: { socketPath: string } };
            responseSocketPath = payload.responseTarget?.socketPath ?? "";
            throw new Error("send failed");
          }),
        };
      });

      const { runBlockingHookFromRaw: runWithMockedSend } = await import("./blockingHookBridge");
      const payload = JSON.stringify({
        type: "status_change",
        sessionId: "sess-send-fail",
        tool: "cursor",
        status: "waiting",
        timestamp: 5,
        pendingAction: {
          id: "pa-send-fail",
          type: "approval",
          title: "Confirm?",
          options: ["Allow", "Deny"],
        },
      });

      await expect(runWithMockedSend(payload, process.env)).rejects.toThrow("send failed");
      expect(responseSocketPath).toBeTruthy();
      expect(fs.existsSync(responseSocketPath)).toBe(false);
      expect(fs.existsSync(dirname(responseSocketPath))).toBe(false);

      vi.doUnmock("./sendEventBridge");
      vi.resetModules();
    },
  );
});
