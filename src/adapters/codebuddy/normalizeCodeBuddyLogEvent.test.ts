import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCodeBuddyLogEvent } from "./normalizeCodeBuddyLogEvent";

const fixturePath = path.resolve(
  __dirname,
  "../../../tests/fixtures/codebuddy/transcript-basic.jsonl",
);
const fixtureLines = fs
  .readFileSync(fixturePath, "utf8")
  .trim()
  .split("\n");

describe("normalizeCodeBuddyLogEvent", () => {
  it("maps assistant transcript messages into shared assistant activity", () => {
    const normalized = normalizeCodeBuddyLogEvent(fixtureLines[1] ?? "", fixturePath);

    expect(normalized).toMatchObject({
      type: "status_change",
      sessionId: "transcript-basic",
      tool: "codebuddy",
      status: "completed",
      task: "我先检查一下仓库结构和最近变更。",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "我先检查一下仓库结构和最近变更。",
        }),
      ],
    });
  });

  it("maps tool calls and tool results with call ids for later correlation", () => {
    const toolCall = normalizeCodeBuddyLogEvent(fixtureLines[2] ?? "", fixturePath);
    const toolResult = normalizeCodeBuddyLogEvent(fixtureLines[3] ?? "", fixturePath);

    expect(toolCall).toMatchObject({
      sessionId: "transcript-basic",
      task: "Read",
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          title: "Read",
          toolName: "Read",
          toolPhase: "call",
          meta: expect.objectContaining({
            callId: "toolu_read_1",
          }),
        }),
      ],
    });

    expect(toolResult).toMatchObject({
      sessionId: "transcript-basic",
      task: "# CodePal",
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          title: "Read",
          toolName: "Read",
          toolPhase: "result",
          body: "# CodePal",
          meta: expect.objectContaining({
            callId: "toolu_read_1",
          }),
        }),
      ],
    });
  });
});
