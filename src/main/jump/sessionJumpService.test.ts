import { describe, expect, it, vi } from "vitest";
import { createSessionJumpService } from "./sessionJumpService";

describe("sessionJumpService", () => {
  it("falls back to app activation when precise jump is unavailable", async () => {
    const activateApp = vi.fn(async () => true);
    const service = createSessionJumpService({
      activateApp,
      findWindow: vi.fn(async () => false),
    });

    const result = await service.jumpTo({
      agent: "claude",
      appName: "Terminal",
      workspacePath: "/tmp/demo",
      fallbackBehavior: "activate_app",
    });

    expect(result).toEqual({ ok: true, mode: "activate_app" });
    expect(activateApp).toHaveBeenCalledWith("Terminal", "/tmp/demo");
  });
});
