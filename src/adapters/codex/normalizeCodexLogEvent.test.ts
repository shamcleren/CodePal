import { describe, expect, it } from "vitest";
import { CODEX_FIXTURES, CODEX_FIXTURE_SOURCE_PATH } from "../../../tests/fixtures/codex";
import { normalizeCodexLogEvent } from "./normalizeCodexLogEvent";

describe("normalizeCodexLogEvent", () => {
  const sourcePath = CODEX_FIXTURE_SOURCE_PATH;

  it.each(CODEX_FIXTURES)("normalizes codex fixture $id", ({ entry, expectation }) => {
    const event = normalizeCodexLogEvent(JSON.stringify(entry), sourcePath);

    expect(event).toMatchObject({
      sessionId: expectation.sessionId,
      tool: "codex",
      status: expectation.status,
      task: expectation.task,
      activityItems: expectation.activityItems,
      meta: expectation.meta,
    });
  });

  it("maps session_meta to a running Codex session event", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T02:46:49.900Z",
        type: "session_meta",
        payload: {
          id: "019d4c15-8d42-78f1-955e-d57f67061b9e",
          cwd: "/Users/demo/codepal",
          model_provider: "openai",
          source: "vscode",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      type: "status_change",
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "running",
      task: "Codex session: codepal",
      meta: {
        event_type: "session_meta",
        cwd: "/Users/demo/codepal",
        model_provider: "openai",
        source: "vscode",
      },
    });
    expect(event?.timestamp).toBe(Date.parse("2026-04-02T02:46:49.900Z"));
  });

  it("maps user_message events to running activity", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T02:46:58.278Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "继续推进 Codex 接入。",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "running",
      task: "继续推进 Codex 接入。",
      activityItems: [
        {
          kind: "message",
          source: "user",
          title: "User",
          body: "继续推进 Codex 接入。",
        },
      ],
      meta: {
        event_type: "event_msg",
        codex_event_type: "user_message",
      },
    });
  });

  it("maps task_complete to completed status", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T02:47:14.847Z",
        type: "event_msg",
        payload: {
          type: "task_complete",
          last_agent_message: "已经完成当前步骤。\n下一步继续验证。",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "completed",
      task: "已经完成当前步骤。",
      activityItems: [
        {
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "已经完成当前步骤。\n下一步继续验证。",
        },
      ],
      meta: {
        event_type: "event_msg",
        codex_event_type: "task_complete",
      },
    });
  });

  it("maps final_answer agent messages to completed status before task_complete arrives", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T07:12:56.916Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          phase: "final_answer",
          message: "刚跑了一条真实交互链路，结果是通的。\n\n后续还有更多验证。",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "completed",
      task: "刚跑了一条真实交互链路，结果是通的。",
      activityItems: [
        {
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "刚跑了一条真实交互链路，结果是通的。\n\n后续还有更多验证。",
        },
      ],
      meta: {
        event_type: "event_msg",
        codex_event_type: "agent_message",
        phase: "final_answer",
      },
    });
  });

  it("keeps full multiline user_message text inside the activity body while task stays concise", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T02:46:58.278Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "先检查 Cursor timeline。\n再确认 Codex 最终输出有没有被截断。",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      status: "running",
      task: "先检查 Cursor timeline。",
      activityItems: [
        {
          kind: "message",
          source: "user",
          body: "先检查 Cursor timeline。\n再确认 Codex 最终输出有没有被截断。",
        },
      ],
    });
  });

  it("maps turn_aborted to idle status so stale running sessions can close", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T02:45:00.914Z",
        type: "event_msg",
        payload: {
          type: "turn_aborted",
          turn_id: "turn_1",
          reason: "interrupted",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "idle",
      task: "Turn aborted",
      activityItems: [
        {
          kind: "system",
          source: "system",
          title: "Turn aborted",
          body: "Turn aborted",
          tone: "idle",
        },
      ],
      meta: {
        event_type: "event_msg",
        codex_event_type: "turn_aborted",
      },
    });
  });

  it("maps task_started to a concise running state", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T02:46:58.283Z",
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: "turn_1",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "running",
      task: "Working",
      meta: {
        event_type: "event_msg",
        codex_event_type: "task_started",
      },
    });
  });

  it("returns null for noisy agent commentary payloads", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T02:46:58.444Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "我先看一下仓库状态。",
        },
      }),
      sourcePath,
    );

    expect(event).toBeNull();
  });

  it("maps response_item assistant messages into running assistant activity", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T08:13:11.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "我先补一组回归测试，再继续收口。",
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "running",
      task: "我先补一组回归测试，再继续收口。",
      activityItems: [
        {
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "我先补一组回归测试，再继续收口。",
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "message",
        role: "assistant",
      },
    });
  });

  it("maps response_item assistant messages from nested content structures", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T08:13:11.500Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              content: [
                {
                  type: "text",
                  text: "我先补 adapter，再回头清理 renderer。",
                },
              ],
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      status: "running",
      task: "我先补 adapter，再回头清理 renderer。",
      activityItems: [
        {
          kind: "message",
          source: "assistant",
          body: "我先补 adapter，再回头清理 renderer。",
        },
      ],
    });
  });

  it("maps response_item function calls into tool call activity", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T08:13:12.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call_123",
          name: "shell",
          arguments: "{\"command\":\"npm test -- src/adapters/codex/normalizeCodexLogEvent.test.ts\"}",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "running",
      task: "shell",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "shell",
          toolName: "shell",
          toolPhase: "call",
          body: "{\"command\":\"npm test -- src/adapters/codex/normalizeCodexLogEvent.test.ts\"}",
          meta: {
            callId: "call_123",
          },
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "function_call",
      },
    });
  });

  it("maps response_item function calls with object arguments into tool call activity", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T08:13:12.500Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell",
          arguments: {
            command: "npm test -- src/adapters/codex/normalizeCodexLogEvent.test.ts",
          },
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      status: "running",
      task: "shell",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "shell",
          toolPhase: "call",
          body: '{\n  "command": "npm test -- src/adapters/codex/normalizeCodexLogEvent.test.ts"\n}',
        },
      ],
    });
  });

  it("maps response_item function call outputs into tool result activity", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T08:13:13.000Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_123",
          output: "PASS src/adapters/codex/normalizeCodexLogEvent.test.ts",
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "running",
      task: "PASS src/adapters/codex/normalizeCodexLogEvent.test.ts",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Tool",
          toolName: "Tool",
          toolPhase: "result",
          body: "PASS src/adapters/codex/normalizeCodexLogEvent.test.ts",
          meta: {
            callId: "call_123",
          },
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "function_call_output",
      },
    });
  });

  it("maps response_item function call outputs with structured output into tool result activity", () => {
    const event = normalizeCodexLogEvent(
      JSON.stringify({
        timestamp: "2026-04-02T08:13:13.500Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          name: "shell",
          output: [
            {
              type: "text",
              text: "PASS src/adapters/codex/normalizeCodexLogEvent.test.ts",
            },
          ],
        },
      }),
      sourcePath,
    );

    expect(event).toMatchObject({
      status: "running",
      task: "PASS src/adapters/codex/normalizeCodexLogEvent.test.ts",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "shell",
          toolName: "shell",
          toolPhase: "result",
          body: "PASS src/adapters/codex/normalizeCodexLogEvent.test.ts",
        },
      ],
    });
  });
});
