import { describe, expect, it } from "vitest";
import type { TimelineItem } from "../monitorSession";
import { buildItemRenderKeys } from "./HoverDetails";
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
