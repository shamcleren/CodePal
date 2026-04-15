import { describe, expect, it } from "vitest";
import type { TimelineItem } from "../monitorSession";
import {
  buildItemRenderKeys,
  buildPrimaryRenderEntries,
  calculateVirtualWindow,
  buildPrimaryDisplayItems,
  summarizeToolGroup,
} from "./HoverDetails";
import { toRenderableMessageBody } from "../messageBody";

function toolItem(id: string, timestamp: number): TimelineItem {
  return {
    id,
    kind: "tool",
    source: "tool",
    label: "Exec",
    title: "Exec",
    body: "tool output",
    timestamp,
    toolName: "exec_command",
    toolPhase: "result",
  };
}

describe("buildItemRenderKeys", () => {
  it("assigns distinct renderer keys to duplicated tool item ids", () => {
    expect(
      buildItemRenderKeys([
        toolItem("tool-duplicate", 1),
        toolItem("tool-duplicate", 2),
        toolItem("tool-duplicate", 3),
      ]),
    ).toEqual(["tool-duplicate::0", "tool-duplicate::1", "tool-duplicate::2"]);
  });

  it("preserves unsuffixed first occurrence across mixed ids", () => {
    expect(
      buildItemRenderKeys([
        toolItem("tool-a", 1),
        toolItem("tool-b", 2),
        toolItem("tool-a", 3),
        toolItem("tool-c", 4),
      ]),
    ).toEqual(["tool-a::0", "tool-b::0", "tool-a::1", "tool-c::0"]);
  });
});

describe("buildPrimaryRenderEntries", () => {
  it("appends a typing indicator for active running sessions", () => {
    const entries = buildPrimaryRenderEntries([toolItem("tool-a", 1)], "running", "正在整理回复");

    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      renderKey: "session-stream-typing-indicator",
      isTypingItem: true,
    });
  });

  it("keeps completed sessions free of synthetic typing rows", () => {
    const entries = buildPrimaryRenderEntries([toolItem("tool-a", 1)], "completed", "typing");

    expect(entries).toHaveLength(1);
    expect(entries[0].isTypingItem).toBe(false);
  });
});

describe("buildPrimaryDisplayItems", () => {
  it("groups adjacent tool items into a single compact group", () => {
    const items: TimelineItem[] = [
      {
        id: "tool-call",
        kind: "tool",
        source: "tool",
        label: "terminal",
        title: "terminal",
        body: "Tool call: terminal",
        timestamp: 1,
        toolName: "terminal",
        toolPhase: "call",
      },
      {
        id: "tool-result-a",
        kind: "tool",
        source: "tool",
        label: "terminal",
        title: "terminal",
        body: "pwd",
        timestamp: 2,
        toolName: "terminal",
        toolPhase: "result",
      },
      {
        id: "tool-result-b",
        kind: "tool",
        source: "tool",
        label: "terminal",
        title: "terminal",
        body: "ls -la",
        timestamp: 3,
        toolName: "terminal",
        toolPhase: "result",
      },
    ];

    const grouped = buildPrimaryDisplayItems(items, "completed", "typing");

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      kind: "tool-group",
      items: items,
    });
  });

  it("keeps messages as standalone items between tool groups", () => {
    const items: TimelineItem[] = [
      toolItem("tool-a", 1),
      {
        id: "message-1",
        kind: "message",
        source: "assistant",
        label: "Assistant",
        title: "Assistant",
        body: "Done.",
        timestamp: 2,
      },
      toolItem("tool-b", 3),
    ];

    const grouped = buildPrimaryDisplayItems(items, "completed", "typing");
    expect(grouped.map((entry) => entry.kind)).toEqual(["tool-group", "item", "tool-group"]);
  });
});

describe("summarizeToolGroup", () => {
  it("builds a compact summary for collapsed tool groups", () => {
    const summary = summarizeToolGroup([
      {
        id: "tool-call",
        kind: "tool",
        source: "tool",
        label: "terminal",
        title: "terminal",
        body: "npm run build",
        timestamp: 1,
        toolName: "exec_command",
        toolPhase: "call",
      },
      {
        id: "tool-result",
        kind: "tool",
        source: "tool",
        label: "terminal",
        title: "terminal",
        body: "build completed",
        timestamp: 2,
        toolName: "write_stdin",
        toolPhase: "result",
      },
    ]);

    expect(summary).toMatchObject({
      count: 2,
      uniqueToolCount: 2,
      latestToolLabel: "write_stdin",
      phaseCounts: {
        call: 1,
        result: 1,
      },
    });
    expect(summary.summary).toContain("2 calls");
    expect(summary.summary).toContain("2 tools");
    expect(summary.summary).toContain("latest write_stdin");
  });
});

describe("calculateVirtualWindow", () => {
  it("returns a bounded visible range for a scrolling window", () => {
    expect(
      calculateVirtualWindow([0, 110, 220, 330], [100, 100, 100, 100], 95, 260),
    ).toEqual({
      startIndex: 0,
      endIndex: 3,
    });
  });

  it("returns an empty range for empty inputs", () => {
    expect(calculateVirtualWindow([], [], 0, 100)).toEqual({
      startIndex: 0,
      endIndex: -1,
    });
  });
});

describe("toRenderableMessageBody", () => {
  it("preserves single-line markdown breaks in normal text", () => {
    expect(toRenderableMessageBody("第一行\n第二行\n\n第三段")).toBe("第一行  \n第二行\n\n第三段");
  });

  it("keeps assistant intro lines separated without affecting markdown structure", () => {
    expect(
      toRenderableMessageBody(
        "欢迎使用 CodePal！\n- 编写代码\n- 调试问题\n- 理解代码\n- 工具使用",
      ),
    ).toBe("欢迎使用 CodePal！  \n- 编写代码  \n- 调试问题  \n- 理解代码  \n- 工具使用");
  });

  it("does not rewrite newlines inside fenced code blocks", () => {
    expect(toRenderableMessageBody("```bash\nline1\nline2\n```\n下一行")).toBe(
      "```bash\nline1\nline2\n```  \n下一行",
    );
  });
});
