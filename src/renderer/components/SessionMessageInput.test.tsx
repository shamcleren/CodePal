import { describe, it, expect } from "vitest";
import { renderSessionMessageInputProps, getPlaceholder } from "./SessionMessageInput";

describe("getPlaceholder", () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    const map: Record<string, string> = {
      "sendMessage.placeholder.running": `Send a message to ${params?.agent ?? ""}...`,
      "sendMessage.placeholder.waiting": "Agent is waiting for your input...",
      "sendMessage.placeholder.disconnected": `Not connected to ${params?.agent ?? ""}`,
    };
    return map[key] ?? key;
  };

  it("returns running placeholder when hasInputChannel and running", () => {
    expect(getPlaceholder("running", true, "Cursor", t)).toBe("Send a message to Cursor...");
  });

  it("returns waiting placeholder when hasInputChannel and waiting", () => {
    expect(getPlaceholder("waiting", true, "Claude", t)).toBe("Agent is waiting for your input...");
  });

  it("returns disconnected placeholder when no input channel", () => {
    expect(getPlaceholder("running", false, "Codex", t)).toBe("Not connected to Codex");
  });
});

describe("renderSessionMessageInputProps", () => {
  it("returns disabled when no input channel", () => {
    const props = renderSessionMessageInputProps({
      status: "running",
      hasInputChannel: false,
      tool: "cursor",
    });
    expect(props.disabled).toBe(true);
  });

  it("returns enabled when running with input channel", () => {
    const props = renderSessionMessageInputProps({
      status: "running",
      hasInputChannel: true,
      tool: "codebuddy",
    });
    expect(props.disabled).toBe(false);
    expect(props.isWaiting).toBe(false);
  });

  it("returns isWaiting when waiting with input channel", () => {
    const props = renderSessionMessageInputProps({
      status: "waiting",
      hasInputChannel: true,
      tool: "claude",
    });
    expect(props.disabled).toBe(false);
    expect(props.isWaiting).toBe(true);
  });
});
