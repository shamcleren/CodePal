import { describe, expect, it } from "vitest";
import { normalizeToolInvocationText } from "./toolInvocationText";

describe("normalizeToolInvocationText", () => {
  it("unwraps XML invoke text from generic call tool names", () => {
    expect(
      normalizeToolInvocationText(
        "call",
        [
          "call",
          "<invoke name=\"Read\">",
          "<parameter name=\"path\">/Users/example/project/src/autochunk.py</parameter>",
          "</invoke>",
        ].join("\n"),
      ),
    ).toEqual({
      toolName: "Read",
      body: "/Users/example/project/src/autochunk.py",
    });
  });

  it("uses parsed tool names while compacting XML parameter bodies", () => {
    expect(
      normalizeToolInvocationText(
        "Tool",
        [
          "<invoke name=\"Grep\">",
          "<parameter name=\"pattern\">function_call</parameter>",
          "<parameter name=\"path\">src/adapters</parameter>",
          "</invoke>",
        ].join("\n"),
      ),
    ).toEqual({
      toolName: "Grep",
      body: "pattern: function_call\npath: src/adapters",
    });
  });
});
