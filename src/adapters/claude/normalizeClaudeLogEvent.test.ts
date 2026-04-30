import { describe, expect, it } from "vitest";
import { normalizeClaudeLogEvent } from "./normalizeClaudeLogEvent";

const sourcePath =
  "/Users/demo/.claude/projects/-Users-demo-codepal/cc438eb3-af18-4eab-b69f-76925a94655b.jsonl";

describe("normalizeClaudeLogEvent", () => {
  it("maps hook progress stop events into completed lifecycle activity", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "progress",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        cwd: "/Users/demo/codepal",
        timestamp: "2026-04-03T13:08:27.952Z",
        data: {
          type: "hook_progress",
          hookEvent: "Stop",
          hookName: "Stop",
          command: "/Users/demo/.vibe-island/bin/vibe-island-bridge --source claude",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      tool: "claude",
      status: "completed",
      task: "Claude request finished",
      meta: {
        event_type: "progress",
        cwd: "/Users/demo/codepal",
        hook_event: "Stop",
        hook_name: "Stop",
        progress_type: "hook_progress",
      },
      activityItems: [
        {
          kind: "system",
          source: "system",
          title: "Claude request finished",
          body: "Claude request finished",
          tone: "completed",
        },
      ],
    });
  });

  it("keeps SubagentStop on the parent Claude session id instead of creating a new session", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "progress",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        cwd: "/Users/demo/codepal",
        timestamp: "2026-04-03T13:08:27.952Z",
        data: {
          type: "hook_progress",
          hookEvent: "SubagentStop",
          hookName: "SubagentStop",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
      tool: "claude",
      status: "completed",
      task: "Claude request finished",
      meta: {
        hook_event: "SubagentStop",
      },
    });
  });

  it("maps user messages into running session activity", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        cwd: "/Users/demo/codepal",
        gitBranch: "feat/dashboard",
        version: "2.1.63",
        timestamp: "2026-04-03T13:08:23.948Z",
        message: {
          role: "user",
          content: "可以切换到 2.7 模型吗？",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      type: "status_change",
      tool: "claude",
      sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
      status: "running",
      task: "可以切换到 2.7 模型吗？",
      activityItems: [
        {
          kind: "message",
          source: "user",
          title: "User",
          body: "可以切换到 2.7 模型吗？",
        },
      ],
      meta: {
        event_type: "user",
        cwd: "/Users/demo/codepal",
        git_branch: "feat/dashboard",
        version: "2.1.63",
        role: "user",
      },
    });
  });

  it("maps assistant text replies and marks end_turn as completed", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "assistant",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:08:27.948Z",
        message: {
          role: "assistant",
          model: "MiniMax-M2.5",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "\n\n根据当前可用的模型选项，我可以使用 Opus 4.6、Sonnet 4.6 和 Haiku 4.5。",
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      tool: "claude",
      status: "completed",
      task: "根据当前可用的模型选项，我可以使用 Opus 4.6、Sonnet 4.6 和 Haiku 4.5。",
      activityItems: [
        {
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "根据当前可用的模型选项，我可以使用 Opus 4.6、Sonnet 4.6 和 Haiku 4.5。",
        },
      ],
      meta: {
        event_type: "assistant",
        role: "assistant",
        model: "MiniMax-M2.5",
      },
    });
  });

  it("maps assistant tool_use entries into tool call activity", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "assistant",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:12:07.001Z",
        message: {
          role: "assistant",
          model: "MiniMax-M2.7",
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "call_function_8z8r0padslbj_1",
              name: "WebFetch",
              input: {
                url: "https://code.claude.com/docs/en/settings",
              },
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      tool: "claude",
      status: "running",
      task: "WebFetch: https://code.claude.com/docs/en/settings",
      meta: {
        event_type: "assistant",
        role: "assistant",
        model: "MiniMax-M2.7",
        tool_name: "WebFetch",
        callId: "call_function_8z8r0padslbj_1",
      },
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "WebFetch",
          body: '{\n  "url": "https://code.claude.com/docs/en/settings"\n}',
          toolName: "WebFetch",
          toolPhase: "call",
          meta: {
            callId: "call_function_8z8r0padslbj_1",
          },
        },
      ],
    });
  });

  it("summarizes Bash tool_use with the command text instead of just the tool name", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "assistant",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:12:07.001Z",
        message: {
          role: "assistant",
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "toolu_bash_1",
              name: "Bash",
              input: { command: "ls -la /tmp", description: "list tmp" },
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event?.task).toBe("Bash: ls -la /tmp");
  });

  it("summarizes Read tool_use with the file basename", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "assistant",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:12:07.001Z",
        message: {
          role: "assistant",
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "toolu_read_1",
              name: "Read",
              input: { file_path: "/Users/demo/codepal/src/renderer/App.tsx" },
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event?.task).toBe("Read: App.tsx");
  });

  it("renders image content blocks in tool_result as [image] instead of base64 JSON", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:12:07.426Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_screenshot_1",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: "iVBORw0KGgoAAAANSUhEUgAA".repeat(50),
                  },
                },
                { type: "text", text: "Screenshot saved to /tmp/foo.png" },
              ],
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event?.task).toBe("[image]");
    expect(event?.activityItems?.[0]?.body).toBe(
      "[image]\nScreenshot saved to /tmp/foo.png",
    );
    expect(event?.activityItems?.[0]?.body).not.toContain("iVBOR");
    expect(event?.activityItems?.[0]?.body).not.toContain("base64");
  });

  it("maps tool_result user entries into tool result activity", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:12:07.426Z",
        toolUseResult: {
          bytes: 497,
          code: 301,
        },
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_function_8z8r0padslbj_1",
              content:
                "REDIRECT DETECTED: The URL redirects to a different host.",
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      tool: "claude",
      status: "running",
      task: "REDIRECT DETECTED: The URL redirects to a different host.",
      meta: {
        event_type: "user",
        role: "user",
        callId: "call_function_8z8r0padslbj_1",
      },
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Tool result",
          body: "REDIRECT DETECTED: The URL redirects to a different host.",
          toolName: "Tool result",
          toolPhase: "result",
          meta: {
            callId: "call_function_8z8r0padslbj_1",
          },
        },
      ],
    });
  });

  it("ignores Claude local-command/meta user entries so they do not revive sessions", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        isMeta: true,
        timestamp: "2026-04-07T03:50:53.384Z",
        message: {
          role: "user",
          content:
            "<command-name>/status</command-name>\n<command-message>status</command-message>",
        },
      }),
      sourcePath,
    );

    expect(event).toBeNull();
  });

  it("maps rejected tool results into idle instead of running", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-07T08:17:12.149Z",
        toolUseResult: "User rejected tool use",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_012uKFbEjptrbaSM9S6choun",
              is_error: true,
              content:
                "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.",
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      tool: "claude",
      status: "idle",
      task: "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.",
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          toolPhase: "result",
          tone: "idle",
        }),
      ],
    });
  });

  it("returns null for pure thinking-only assistant entries", () => {
    const event = normalizeClaudeLogEvent(
      JSON.stringify({
        type: "assistant",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:08:27.802Z",
        message: {
          role: "assistant",
          model: "MiniMax-M2.5",
          content: [
            {
              type: "thinking",
              thinking: "让我先整理一下。",
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event).toBeNull();
  });
});
