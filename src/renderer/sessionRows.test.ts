import { describe, expect, it } from "vitest";
import { sessionRecordToRow } from "./sessionRows";

describe("sessionRecordToRow", () => {
  it("uses the last meaningful sentence from a dialog-like activity line", () => {
    const row = sessionRecordToRow({
      id: "codex-1",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "我已经完成比对。最后需要你确认是否继续合并？",
          timestamp: 1_700_000_000_000,
        },
        {
          id: "activity-2",
          kind: "tool",
          source: "tool",
          title: "Bash",
          body: "Bash",
          timestamp: 1_700_000_000_000,
          toolName: "Bash",
          toolPhase: "call",
        },
      ],
    });

    expect(row.collapsedSummary).toBe("最后需要你确认是否继续合并？");
  });

  it("keeps tool and system activities distinct when shared activityItems are present", () => {
    const row = sessionRecordToRow({
      id: "cursor-1",
      tool: "cursor",
      status: "waiting",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "tool",
          source: "tool",
          title: "Bash",
          body: "Bash",
          timestamp: 1_700_000_000_000,
          toolName: "Bash",
          toolPhase: "call",
        },
        {
          id: "activity-2",
          kind: "system",
          source: "system",
          title: "Action Closed",
          body: "Closed action a1 (consumed_local)",
          timestamp: 1_700_000_000_000,
        },
      ],
    });

    expect(row.timelineItems.map((item) => item.kind)).toEqual(["tool", "system"]);
    expect(row.timelineItems[0]).toMatchObject({
      label: "Bash",
      toolPhase: "call",
    });
  });

  it("prefers pending action titles for the collapsed summary", () => {
    const row = sessionRecordToRow({
      id: "cursor-2",
      tool: "cursor",
      status: "waiting",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "我已经完成比对。最后需要你确认是否继续合并？",
          timestamp: 1_700_000_000_000,
        },
      ],
      pendingActions: [
        {
          id: "a1",
          type: "approval",
          title: "Proceed with merge?",
          options: ["Yes", "No"],
        },
      ],
    });

    expect(row.pendingCount).toBe(1);
    expect(row.collapsedSummary).toBe("Proceed with merge?");
  });

  it("uses external approval titles for the collapsed summary when no true pending action exists", () => {
    const row = sessionRecordToRow({
      id: "claude-approval-1",
      tool: "claude",
      status: "waiting",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "需要你回到原工具里确认权限。",
          timestamp: 1_700_000_000_000,
        },
      ],
      externalApproval: {
        kind: "approval_required",
        title: "Approval required in Claude Code",
        message: "Claude needs your approval to use Bash",
        sourceTool: "claude",
        updatedAt: 1_700_000_000_000,
      },
    });

    expect(row.collapsedSummary).toBe("Approval required in Claude Code");
  });

  it("skips empty completed events and prefers the latest meaningful progress text", () => {
    const row = sessionRecordToRow({
      id: "codex-3",
      tool: "codex",
      status: "completed",
      updatedAt: 1_700_000_000_000,
      activities: [
        "Completed",
        "Agent: 我已经完成比对。最后需要你确认是否继续合并？",
      ],
    });

    expect(row.collapsedSummary).toBe("最后需要你确认是否继续合并？");
  });

  it("classifies file edits as work artifacts", () => {
    const row = sessionRecordToRow({
      id: "codex-4",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["Edited sessionRows.ts +23 -5"],
    });

    expect(row.timelineItems[0]).toMatchObject({
      kind: "system",
      label: "File Edit",
    });
  });

  it("classifies bare running/completed lines as system notes", () => {
    const row = sessionRecordToRow({
      id: "codex-5",
      tool: "codex",
      status: "completed",
      updatedAt: 1_700_000_000_000,
      activities: ["Completed", "Running"],
    });

    expect(row.timelineItems).toEqual([]);
  });

  it("renders status-prefixed progress lines as notes with stripped body text", () => {
    const row = sessionRecordToRow({
      id: "codex-5b",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["Running: 已完成接口验证并整理出结论。"],
    });

    expect(row.timelineItems[0]).toMatchObject({
      kind: "note",
      tone: "running",
      body: "已完成接口验证并整理出结论。",
    });
  });

  it("classifies bare tool identifiers as tool artifacts", () => {
    const row = sessionRecordToRow({
      id: "codex-5c",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["saveDocument", "metadata"],
    });

    expect(row.timelineItems.map((item) => item.kind)).toEqual(["tool", "tool"]);
    expect(row.timelineItems[0]).toMatchObject({
      toolPhase: "result",
      label: "Save Document",
      body: "saveDocument",
    });
  });

  it("treats natural-language lines without prefixes as messages", () => {
    const row = sessionRecordToRow({
      id: "codex-5d",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["iwiki 里面的关联信息要加上链接呀"],
    });

    expect(row.timelineItems[0]).toMatchObject({
      kind: "message",
      body: "iwiki 里面的关联信息要加上链接呀",
    });
  });

  it("preserves explicit user and agent message prefixes", () => {
    const row = sessionRecordToRow({
      id: "codex-roles",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["User: 请继续优化 UI", "Agent: 我先把消息和工具块拆开。"],
    });

    expect(row.timelineItems[0]).toMatchObject({
      kind: "message",
      label: "User",
      body: "请继续优化 UI",
    });
    expect(row.timelineItems[1]).toMatchObject({
      kind: "message",
      label: "Agent",
      body: "我先把消息和工具块拆开。",
    });
  });

  it("drops duplicated status notes when they only repeat the same message content", () => {
    const row = sessionRecordToRow({
      id: "codex-6",
      tool: "codex",
      status: "completed",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "这轮已经把 expanded 区从旧的 `event-first` 改成了 `message-first`。",
          timestamp: 1_700_000_000_000,
        },
        {
          id: "activity-2",
          kind: "note",
          source: "system",
          title: "Completed",
          body: "这轮已经把 expanded 区从旧的 `event-first` 改成了 `message-first`。",
          timestamp: 1_700_000_000_000,
          tone: "completed",
        },
      ],
    });

    expect(row.timelineItems).toHaveLength(1);
    expect(row.timelineItems[0]).toMatchObject({
      kind: "message",
      body: "这轮已经把 expanded 区从旧的 `event-first` 改成了 `message-first`。",
    });
  });

  it("flags low-information running placeholder rows as loading", () => {
    const row = sessionRecordToRow({
      id: "codex-loading-1",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "note",
          source: "system",
          title: "Running",
          body: "Working",
          timestamp: 1_700_000_000_000,
          tone: "running",
        },
      ],
    });

    expect(row.collapsedSummary).toBe("Loading…");
    expect(row.hoverSummary).toBe("Loading…");
  });

  it("does not surface low-signal hook event names as title or collapsed summary", () => {
    const row = sessionRecordToRow({
      id: "cursor-hook-noise",
      tool: "cursor",
      status: "completed",
      title: "UserPromptSubmit",
      task: "Stop",
      updatedAt: 1_700_000_000_000,
      activities: [
        "UserPromptSubmit",
        "Stop",
        "Agent: 已经完成额度展示收口。",
      ],
    });

    expect(row.titleLabel).toBe("已经完成额度展示收口。");
    expect(row.collapsedSummary).toBe("已经完成额度展示收口。");
  });

  it("does not surface lowercase hook event variants such as sessionEnd as title or collapsed summary", () => {
    const row = sessionRecordToRow({
      id: "claude-hook-noise",
      tool: "claude",
      status: "running",
      title: "sessionEnd",
      task: "sessionEnd",
      updatedAt: 1_700_000_000_000,
      activities: [
        "sessionEnd",
        "Agent: 继续处理 Claude 会话收尾后的状态展示。",
      ],
    });

    expect(row.titleLabel).toBe("继续处理 Claude 会话收尾后的状态展示。");
    expect(row.collapsedSummary).toBe("继续处理 Claude 会话收尾后的状态展示。");
  });

  it("does not surface rejected tool-use boilerplate as title or collapsed summary", () => {
    const row = sessionRecordToRow({
      id: "claude-rejected-tool",
      tool: "claude",
      status: "running",
      title:
        "The user doesn't want to proceed with this tool use. The tool use was rejected.",
      task: "The tool use was rejected.",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body:
            "The user doesn't want to proceed with this tool use. The tool use was rejected.",
          timestamp: 1_700_000_000_000,
        },
        {
          id: "activity-2",
          kind: "message",
          source: "user",
          title: "User",
          body: "帮我找一下 package.json",
          timestamp: 1_700_000_000_100,
        },
      ],
    });

    expect(row.titleLabel).toBe("帮我找一下 package.json");
    expect(row.collapsedSummary).toBe("帮我找一下 package.json");
  });

  it("does not surface raw command json blobs as title or collapsed summary", () => {
    const row = sessionRecordToRow({
      id: "agent-command-json",
      tool: "claude",
      status: "running",
      title: '{"command": "find /repo -name \\"package.json\\" | head -5"}',
      task: '{"command": "find /repo -name \\"package.json\\" | head -5"}',
      updatedAt: 1_700_000_000_000,
      activities: [
        '{"command": "find /repo -name \\"package.json\\" | head -5"}',
        "User: 帮我找一下 package.json",
      ],
    });

    expect(row.titleLabel).toBe("帮我找一下 package.json");
    expect(row.collapsedSummary).toBe("帮我找一下 package.json");
  });

  it("does not surface code-first snippets as title or collapsed summary", () => {
    const row = sessionRecordToRow({
      id: "agent-code-snippet",
      tool: "claude",
      status: "running",
      title: '1 import { describe, expect, it } from "vitest";',
      task: '1 import { describe, expect, it } from "vitest";',
      updatedAt: 1_700_000_000_000,
      activities: [
        '1 import { describe, expect, it } from "vitest";',
        "User: 给这个文件补测试",
      ],
    });

    expect(row.titleLabel).toBe("给这个文件补测试");
    expect(row.collapsedSummary).toBe("给这个文件补测试");
  });

  it("uses the latest user message as title and latest assistant message as summary across agents", () => {
    const row = sessionRecordToRow({
      id: "codebuddy-overview",
      tool: "codebuddy",
      status: "completed",
      title: "startup",
      task: "Tool result received",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "assistant-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "你好，我已经处理完了。",
          timestamp: 1_700_000_000_200,
        },
        {
          id: "user-1",
          kind: "message",
          source: "user",
          title: "User",
          body: "给我一句话",
          timestamp: 1_700_000_000_300,
        },
        {
          id: "system-1",
          kind: "note",
          source: "system",
          title: "Status",
          body: "Tool result received",
          timestamp: 1_700_000_000_100,
        },
      ],
    });

    expect(row.titleLabel).toBe("给我一句话");
    expect(row.collapsedSummary).toBe("你好，我已经处理完了。");
  });

  it("strips markdown syntax from message-derived title and summary text", () => {
    const row = sessionRecordToRow({
      id: "codex-markdown-summary",
      tool: "codex",
      status: "completed",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "assistant-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body:
            "改动在 [`src/adapters/codex/normalizeCodexLogEvent.ts`](/Users/demo/codepal/src/adapters/codex/normalizeCodexLogEvent.ts)，并保留 `activityItems.body` 全文。\n\n::git-stage{cwd=\"/Users/demo/codepal\"}",
          timestamp: 1_700_000_000_100,
        },
        {
          id: "user-1",
          kind: "message",
          source: "user",
          title: "User",
          body: "继续收口 markdown 预览",
          timestamp: 1_700_000_000_200,
        },
      ],
    });

    expect(row.titleLabel).toBe("继续收口 markdown 预览");
    expect(row.collapsedSummary).toBe(
      "改动在 src/adapters/codex/normalizeCodexLogEvent.ts，并保留 activityItems.body 全文。",
    );
  });

  it("falls back to tool text only when there is no meaningful assistant reply", () => {
    const row = sessionRecordToRow({
      id: "cursor-overview",
      tool: "cursor",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "user-1",
          kind: "message",
          source: "user",
          title: "User",
          body: "检查一下项目状态",
          timestamp: 1_700_000_000_300,
        },
        {
          id: "assistant-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "正在整理回复...",
          timestamp: 1_700_000_000_200,
        },
        {
          id: "tool-1",
          kind: "tool",
          source: "tool",
          title: "Read",
          body: "README.md",
          timestamp: 1_700_000_000_100,
          toolName: "Read",
          toolPhase: "result",
        },
      ],
    });

    expect(row.titleLabel).toBe("检查一下项目状态");
    expect(row.collapsedSummary).toBe("README.md");
  });

  it("applies the same overview rule to legacy activities without shared activityItems", () => {
    const row = sessionRecordToRow({
      id: "claude-overview",
      tool: "claude",
      status: "completed",
      title: "Stop",
      task: "startup",
      updatedAt: 1_700_000_000_000,
      activities: [
        "Assistant: 已经完成额度展示收口。",
        "User: 把 Claude 的 quota 显示出来",
        "Stop",
      ],
    });

    expect(row.titleLabel).toBe("把 Claude 的 quota 显示出来");
    expect(row.collapsedSummary).toBe("已经完成额度展示收口。");
  });
});
