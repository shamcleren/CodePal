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

  it("keeps JSON-only followup completion messages out of the visible timeline", () => {
    const normalized = normalizeCodeBuddyUiMessage(
      {
        ts: 1759217457000,
        type: "ask",
        ask: "followup",
        text: JSON.stringify({
          question: "",
          conversationId: "c-8619-1759217450870",
        }),
      },
      context,
    );

    expect(normalized).toMatchObject({
      sessionId: "codebuddy-ui:1759217450870",
      tool: "codebuddy",
      status: "completed",
      task: "CodeBuddy response finished",
      meta: expect.objectContaining({
        conversation_id: "c-8619-1759217450870",
      }),
    });
    expect(normalized?.activityItems).toBeUndefined();
  });

  it("uses a followup question as the completion note when it is present", () => {
    const normalized = normalizeCodeBuddyUiMessage(
      {
        ts: 1759217458000,
        type: "ask",
        ask: "followup",
        text: JSON.stringify({
          question: "还要继续吗？",
          conversationId: "c-8619-1759217450870",
        }),
      },
      context,
    );

    expect(normalized).toMatchObject({
      status: "completed",
      task: "还要继续吗？",
      activityItems: [
        expect.objectContaining({
          kind: "note",
          source: "system",
          title: "Follow-up",
          body: "还要继续吗？",
          tone: "completed",
        }),
      ],
    });
  });
});
