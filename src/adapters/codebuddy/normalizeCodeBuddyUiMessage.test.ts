import { describe, expect, it } from "vitest";
import { normalizeCodeBuddyUiMessage } from "./normalizeCodeBuddyUiMessage";

describe("normalizeCodeBuddyUiMessage", () => {
  const context = {
    sourcePath: "/tmp/codebuddy/tasks/1759217450870/ui_messages.json",
    taskId: "1759217450870",
    sessionId: "codebuddy-ui:1759217450870",
  };

  it("maps tool ui messages with structured file_path into a readable body", () => {
    const normalized = normalizeCodeBuddyUiMessage(
      {
        ts: 1759217456000,
        type: "say",
        say: "tool",
        text: JSON.stringify({
          tool: "Write",
          response: {
            result: {
              file_path: "/workspace/demo/src/index.ts",
              status: "updated",
            },
          },
        }),
      },
      context,
    );

    expect(normalized).toMatchObject({
      sessionId: "codebuddy-ui:1759217450870",
      tool: "codebuddy",
      status: "running",
      task: "Write",
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          title: "Write",
          toolName: "Write",
          toolPhase: "result",
          body: "/workspace/demo/src/index.ts",
        }),
      ],
    });
  });
});
