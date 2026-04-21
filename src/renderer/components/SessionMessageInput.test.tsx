import { describe, it, expect } from "vitest";
import { getPlaceholder } from "./SessionMessageInput";

describe("getPlaceholder", () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    const map: Record<string, string> = {
      "sendMessage.placeholder.running": `Send a message to ${params?.agent ?? ""}...`,
      "sendMessage.placeholder.waiting": "Agent is waiting for your input...",
    };
    return map[key] ?? key;
  };

  it("returns running placeholder when status is running", () => {
    expect(getPlaceholder("running", "Cursor", t)).toBe("Send a message to Cursor...");
  });

  it("returns waiting placeholder when status is waiting", () => {
    expect(getPlaceholder("waiting", "Claude", t)).toBe("Agent is waiting for your input...");
  });
});
