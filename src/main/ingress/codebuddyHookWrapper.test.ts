import { describe, expect, it } from "vitest";
import { CODEBUDDY_FIXTURES } from "../../../tests/fixtures/codebuddy";
import { augmentCodeBuddyPayloadJson } from "../hook/codeBuddyHook";

describe("augmentCodeBuddyPayloadJson (codebuddy hook parity)", () => {
  it("injects tool=codebuddy without overriding official source", () => {
    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-session-start-source-startup",
    );
    expect(fixture).toBeDefined();

    const outbound = augmentCodeBuddyPayloadJson(JSON.stringify(fixture!.payload));
    expect(JSON.parse(outbound)).toMatchObject({
      tool: "codebuddy",
      source: "startup",
      session_id: "cb-session-101",
      hook_event_name: "SessionStart",
    });
  });

  it("backfills source=codebuddy when official payload omits source", () => {
    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-notification-permission-prompt",
    );
    expect(fixture).toBeDefined();

    const outbound = augmentCodeBuddyPayloadJson(JSON.stringify(fixture!.payload));
    expect(JSON.parse(outbound)).toMatchObject({
      tool: "codebuddy",
      source: "codebuddy",
      session_id: "cb-session-102",
      hook_event_name: "Notification",
    });
  });
});
