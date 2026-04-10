import hookAfterMCPExecutionResponseStderr from "./hook-after-mcp-execution-response-stderr.json";
import hookAfterFileEditStructuredPath from "./hook-after-file-edit-structured-path.json";
import hookAfterShellExecutionMixedResultPriority from "./hook-after-shell-execution-mixed-result-priority.json";
import hookAfterShellExecutionOutputOverSummary from "./hook-after-shell-execution-output-over-summary.json";
import hookAfterShellExecutionToolResultSummary from "./hook-after-shell-execution-tool-result-summary.json";
import hookBeforeMCPExecutionUri from "./hook-before-mcp-execution-uri.json";
import hookBeforeReadFile from "./hook-before-read-file.json";
import hookNotificationIdlePrompt from "./hook-notification-idle-prompt.json";
import hookPostToolUseResponseResultOutput from "./hook-post-tool-use-response-result-output.json";
import hookStatusChangeUsage from "./hook-status-change-usage.json";

export interface CursorFixtureDescriptor {
  id: string;
  source: "official-doc" | "quasi-real";
  description: string;
  payload: Record<string, unknown>;
  expectation: {
    sessionId: string;
    status: string;
    task?: string;
    activityItems: Array<{
      kind: string;
      source: string;
      title: string;
      body: string;
      toolName?: string;
      toolPhase?: string;
      tone?: string;
    }>;
    meta?: Record<string, string>;
  };
}

export interface CursorUsageFixtureDescriptor {
  id: string;
  source: "quasi-real";
  description: string;
  payload: Record<string, unknown>;
  expectation: {
    agent: string;
    sessionId: string;
    updatedAt: number;
    tokens: {
      input: number;
      output: number;
      total: number;
    };
    context: {
      used: number;
      max: number;
      percent: number;
    };
    rateLimit: {
      usedPercent: number;
      resetAt: number;
      windowLabel: string;
      planType: string;
    };
  };
}

export const CURSOR_FIXTURES: readonly CursorFixtureDescriptor[] = [
  {
    id: "hook-before-read-file",
    source: "official-doc",
    description: "beforeReadFile 应从结构化 tool_input 中提取文件路径",
    payload: hookBeforeReadFile,
    expectation: {
      sessionId: "cursor-fixture-101",
      status: "running",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Read",
          body: "src/renderer/App.tsx",
          toolName: "Read",
          toolPhase: "call",
        },
      ],
      meta: {
        hook_event_name: "beforeReadFile",
        tool_name: "Read",
      },
    },
  },
  {
    id: "hook-notification-idle-prompt",
    source: "official-doc",
    description: "idle_prompt 应映射为 idle，而不是 waiting",
    payload: hookNotificationIdlePrompt,
    expectation: {
      sessionId: "cursor-fixture-102",
      status: "idle",
      task: "Cursor has been idle for 60 seconds",
      activityItems: [
        {
          kind: "note",
          source: "system",
          title: "Notification",
          body: "Cursor has been idle for 60 seconds",
          tone: "waiting",
        },
      ],
      meta: {
        hook_event_name: "Notification",
        notification_type: "idle_prompt",
      },
    },
  },
  {
    id: "hook-before-mcp-execution-uri",
    source: "quasi-real",
    description: "beforeMCPExecution 应从结构化 tool_input.uri 中提取调用目标",
    payload: hookBeforeMCPExecutionUri,
    expectation: {
      sessionId: "cursor-fixture-105",
      status: "running",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "fetch_docs",
          body: "docs://electron/ipc",
          toolName: "fetch_docs",
          toolPhase: "call",
        },
      ],
      meta: {
        hook_event_name: "beforeMCPExecution",
        tool_name: "fetch_docs",
      },
    },
  },
  {
    id: "hook-after-mcp-execution-response-stderr",
    source: "quasi-real",
    description: "afterMCPExecution 应从 response.stderr 中提取 tool result",
    payload: hookAfterMCPExecutionResponseStderr,
    expectation: {
      sessionId: "cursor-fixture-103",
      status: "running",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "fetch_docs",
          body: "read_timeout while fetching docs",
          toolName: "fetch_docs",
          toolPhase: "result",
        },
      ],
      meta: {
        hook_event_name: "afterMCPExecution",
        tool_name: "fetch_docs",
      },
    },
  },
  {
    id: "hook-after-file-edit-structured-path",
    source: "quasi-real",
    description: "afterFileEdit 在缺少文本摘要时应从结构化 file_path 生成可读编辑提示",
    payload: hookAfterFileEditStructuredPath,
    expectation: {
      sessionId: "cursor-fixture-109",
      status: "running",
      activityItems: [
        {
          kind: "system",
          source: "system",
          title: "File Edit",
          body: "Edited src/main/session/sessionStore.ts",
        },
      ],
      meta: {
        hook_event_name: "afterFileEdit",
      },
    },
  },
  {
    id: "hook-after-shell-execution-tool-result-summary",
    source: "quasi-real",
    description: "afterShellExecution 应从 tool_result.summary 中提取 tool result",
    payload: hookAfterShellExecutionToolResultSummary,
    expectation: {
      sessionId: "cursor-fixture-106",
      status: "running",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Bash",
          body: "16 files changed, 2 insertions(+), 5087 deletions(-)",
          toolName: "Bash",
          toolPhase: "result",
        },
      ],
      meta: {
        hook_event_name: "afterShellExecution",
        tool_name: "Bash",
      },
    },
  },
  {
    id: "hook-after-shell-execution-mixed-result-priority",
    source: "quasi-real",
    description: "afterShellExecution 同时出现 stdout/stderr/summary 时优先使用 concise summary",
    payload: hookAfterShellExecutionMixedResultPriority,
    expectation: {
      sessionId: "cursor-fixture-107",
      status: "running",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Bash",
          body: "3 tests passed with warnings",
          toolName: "Bash",
          toolPhase: "result",
        },
      ],
      meta: {
        hook_event_name: "afterShellExecution",
        tool_name: "Bash",
      },
    },
  },
  {
    id: "hook-after-shell-execution-output-over-summary",
    source: "quasi-real",
    description: "afterShellExecution 同时出现 output 和 summary 时优先显式 output",
    payload: hookAfterShellExecutionOutputOverSummary,
    expectation: {
      sessionId: "cursor-fixture-108",
      status: "running",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Bash",
          body: "Primary output wins",
          toolName: "Bash",
          toolPhase: "result",
        },
      ],
      meta: {
        hook_event_name: "afterShellExecution",
        tool_name: "Bash",
      },
    },
  },
  {
    id: "hook-post-tool-use-response-result-output",
    source: "quasi-real",
    description: "PostToolUse 应从 response.result.output 中提取 tool result",
    payload: hookPostToolUseResponseResultOutput,
    expectation: {
      sessionId: "cursor-fixture-104",
      status: "running",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Edit",
          body: "Updated src/renderer/components/HoverDetails.tsx",
          toolName: "Edit",
          toolPhase: "result",
        },
      ],
      meta: {
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
      },
    },
  },
] as const;

export const CURSOR_USAGE_FIXTURES: readonly CursorUsageFixtureDescriptor[] = [
  {
    id: "hook-status-change-usage",
    source: "quasi-real",
    description: "StatusChange payload can carry usage, context window, and rate-limit fields",
    payload: hookStatusChangeUsage,
    expectation: {
      agent: "cursor",
      sessionId: "cursor-usage-1",
      updatedAt: 123,
      tokens: {
        input: 1200,
        output: 200,
        total: 1400,
      },
      context: {
        used: 1400,
        max: 32000,
        percent: 4.375,
      },
      rateLimit: {
        usedPercent: 12.5,
        resetAt: 999,
        windowLabel: "60m",
        planType: "pro",
      },
    },
  },
] as const;
