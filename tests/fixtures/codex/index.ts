import responseItemFunctionCallObjectArguments from "./response-item-function-call-object-arguments.json";
import responseItemFunctionCallOutputOutputOverContent from "./response-item-function-call-output-output-over-content.json";
import responseItemFunctionCallOutputStructuredOutput from "./response-item-function-call-output-structured-output.json";
import responseItemMessageContentString from "./response-item-message-content-string.json";
import responseItemMessageMultiSegmentContent from "./response-item-message-multi-segment-content.json";
import responseItemMessageNestedContent from "./response-item-message-nested-content.json";

export const CODEX_FIXTURE_SOURCE_PATH =
  "/Users/demo/.codex/sessions/2026/04/02/rollout-2026-04-02T10-46-14-019d4c15-8d42-78f1-955e-d57f67061b9e.jsonl";

export interface CodexFixtureDescriptor {
  id: string;
  source: "quasi-real";
  description: string;
  entry: Record<string, unknown>;
  expectation: {
    sessionId: string;
    status: string;
    task: string;
    activityItems: Array<{
      kind: string;
      source: string;
      title: string;
      body: string;
      toolName?: string;
      toolPhase?: string;
    }>;
    meta: Record<string, string>;
  };
}

export const CODEX_FIXTURES: readonly CodexFixtureDescriptor[] = [
  {
    id: "response-item-message-nested-content",
    source: "quasi-real",
    description: "response_item assistant message 支持更深层 content 嵌套",
    entry: responseItemMessageNestedContent,
    expectation: {
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      status: "running",
      task: "我先补 adapter，再回头清理 renderer。",
      activityItems: [
        {
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "我先补 adapter，再回头清理 renderer。",
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "message",
        role: "assistant",
      },
    },
  },
  {
    id: "response-item-message-content-string",
    source: "quasi-real",
    description: "response_item assistant message 支持 content 子项直接给字符串",
    entry: responseItemMessageContentString,
    expectation: {
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      status: "running",
      task: "我先确认 watcher，再补 fixture。",
      activityItems: [
        {
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "我先确认 watcher，再补 fixture。",
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "message",
        role: "assistant",
      },
    },
  },
  {
    id: "response-item-message-multi-segment-content",
    source: "quasi-real",
    description: "response_item assistant message 多段 content 时保留首个正文段",
    entry: responseItemMessageMultiSegmentContent,
    expectation: {
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      status: "running",
      task: "先补第一段正文。",
      activityItems: [
        {
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "先补第一段正文。",
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "message",
        role: "assistant",
      },
    },
  },
  {
    id: "response-item-function-call-object-arguments",
    source: "quasi-real",
    description: "response_item function_call 支持对象形 arguments",
    entry: responseItemFunctionCallObjectArguments,
    expectation: {
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      status: "running",
      task: "shell",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "shell",
          body: '{\n  "command": "npm test -- src/adapters/codex/normalizeCodexLogEvent.test.ts"\n}',
          toolName: "shell",
          toolPhase: "call",
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "function_call",
      },
    },
  },
  {
    id: "response-item-function-call-output-structured-output",
    source: "quasi-real",
    description: "response_item function_call_output 支持结构化 output",
    entry: responseItemFunctionCallOutputStructuredOutput,
    expectation: {
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      status: "running",
      task: "PASS src/adapters/codex/normalizeCodexLogEvent.test.ts",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "shell",
          body: "PASS src/adapters/codex/normalizeCodexLogEvent.test.ts",
          toolName: "shell",
          toolPhase: "result",
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "function_call_output",
      },
    },
  },
  {
    id: "response-item-function-call-output-output-over-content",
    source: "quasi-real",
    description: "response_item function_call_output 同时出现 output 和 content 时优先 output",
    entry: responseItemFunctionCallOutputOutputOverContent,
    expectation: {
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      status: "running",
      task: "Primary output wins",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "shell",
          body: "Primary output wins",
          toolName: "shell",
          toolPhase: "result",
        },
      ],
      meta: {
        event_type: "response_item",
        item_type: "function_call_output",
      },
    },
  },
] as const;
