import { describe, expect, it } from "vitest";
import {
  buildActionResponsePayload,
  stringifyActionResponsePayload,
} from "./actionResponsePayload";

describe("actionResponsePayload", () => {
  it("builds the action_response object shape", () => {
    expect(buildActionResponsePayload("sid", "aid", "opt")).toEqual({
      type: "action_response",
      sessionId: "sid",
      actionId: "aid",
      response: { kind: "option", value: "opt" },
    });
  });

  it("builds approval responses as explicit allow/deny payloads", () => {
    expect(buildActionResponsePayload("sid", "aid", "Allow", "approval")).toEqual({
      type: "action_response",
      sessionId: "sid",
      actionId: "aid",
      response: { kind: "approval", decision: "allow" },
    });
    expect(buildActionResponsePayload("sid", "aid", "Deny", "approval")).toEqual({
      type: "action_response",
      sessionId: "sid",
      actionId: "aid",
      response: { kind: "approval", decision: "deny" },
    });
  });

  it("stringifies for socket / bridge lines", () => {
    expect(stringifyActionResponsePayload("s", "a", "x")).toBe(
      '{"type":"action_response","sessionId":"s","actionId":"a","response":{"kind":"option","value":"x"}}',
    );
  });
});
