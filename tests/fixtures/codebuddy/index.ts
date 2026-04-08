import agentSessionUpdateStateCurrentTask from "./agent-session-update-state-current-task.json";
import agentSessionUpdateStatusMessage from "./agent-session-update-status-message.json";
import hookNotificationIdlePrompt from "./hook-notification-idle-prompt.json";
import hookNotificationPermissionPrompt from "./hook-notification-permission-prompt.json";
import hookPostToolUseWriteResult from "./hook-post-tool-use-write-result.json";
import hookPostToolUseResponseResultOutput from "./hook-post-tool-use-response-result-output.json";
import hookPreToolUseWrite from "./hook-pre-tool-use-write.json";
import hookSessionEndOther from "./hook-session-end-other.json";
import hookSessionStartSourceStartup from "./hook-session-start-source-startup.json";
import hookUserPromptSubmit from "./hook-user-prompt-submit.json";

export interface CodeBuddyFixtureExpectation {
  sessionId: string;
  status: string;
  task?: string;
  timestamp: number | "now";
  meta?: Record<string, string>;
  activityItems?: Array<{
    kind: string;
    source: string;
    title: string;
    body: string;
    toolName?: string;
    toolPhase?: string;
    tone?: string;
  }>;
}

export interface CodeBuddyFixtureDescriptor {
  id: string;
  source: "official-doc" | "quasi-real";
  description: string;
  sessionIdFields: readonly string[];
  statusSignals: readonly string[];
  taskSignals: readonly string[];
  timestampSignals: readonly string[];
  hookSignal?: string;
  payload: Record<string, unknown>;
  expectation: CodeBuddyFixtureExpectation;
}

export const CODEBUDDY_FIXTURES: readonly CodeBuddyFixtureDescriptor[] = [
  {
    id: "agent-session-update-state-current-task",
    source: "quasi-real",
    description: "当前 CodePal 已支持的 CodeBuddy 状态更新形状",
    sessionIdFields: ["session_id"],
    statusSignals: ["state"],
    taskSignals: ["current_task"],
    timestampSignals: ["timestamp"],
    hookSignal: "AgentSessionUpdate",
    payload: agentSessionUpdateStateCurrentTask,
    expectation: {
      sessionId: "cb-session-001",
      status: "waiting",
      task: "review diff",
      timestamp: 1710000000001,
      activityItems: [
        {
          kind: "note",
          source: "system",
          title: "Waiting",
          body: "review diff",
          tone: "waiting",
        },
      ],
      meta: {
        hook_event_name: "AgentSessionUpdate",
        cwd: "/workspace/demo",
      },
    },
  },
  {
    id: "agent-session-update-status-message",
    source: "quasi-real",
    description: "兼容 camelCase sessionId、status 和 message 兜底",
    sessionIdFields: ["sessionId"],
    statusSignals: ["status"],
    taskSignals: ["message"],
    timestampSignals: ["ts"],
    hookSignal: "AgentSessionUpdate",
    payload: agentSessionUpdateStatusMessage,
    expectation: {
      sessionId: "cb-session-002",
      status: "running",
      task: "index workspace",
      timestamp: 1710000000002,
      activityItems: [
        {
          kind: "note",
          source: "system",
          title: "Running",
          body: "index workspace",
          tone: "running",
        },
      ],
      meta: {
        hook_event_name: "AgentSessionUpdate",
        cwd: "/workspace/demo",
      },
    },
  },
  {
    id: "hook-session-start-source-startup",
    source: "official-doc",
    description: "SessionStart 使用 source 表达启动来源，不能覆盖 CodeBuddy 路由标识",
    sessionIdFields: ["session_id"],
    statusSignals: ["hook_event_name=SessionStart"],
    taskSignals: ["source"],
    timestampSignals: [],
    hookSignal: "SessionStart",
    payload: hookSessionStartSourceStartup,
    expectation: {
      sessionId: "cb-session-101",
      status: "running",
      task: "startup",
      timestamp: "now",
      activityItems: [
        {
          kind: "system",
          source: "system",
          title: "SessionStart",
          body: "startup",
        },
      ],
      meta: {
        hook_event_name: "SessionStart",
        source: "startup",
      },
    },
  },
  {
    id: "hook-notification-permission-prompt",
    source: "official-doc",
    description: "授权提示应映射为 waiting，并保留 notification_type 以便排查",
    sessionIdFields: ["session_id"],
    statusSignals: ["notification_type=permission_prompt"],
    taskSignals: ["message"],
    timestampSignals: [],
    hookSignal: "Notification",
    payload: hookNotificationPermissionPrompt,
    expectation: {
      sessionId: "cb-session-102",
      status: "waiting",
      task: "CodeBuddy needs your permission to use Bash",
      timestamp: "now",
      activityItems: [
        {
          kind: "note",
          source: "system",
          title: "Notification",
          body: "CodeBuddy needs your permission to use Bash",
          tone: "waiting",
        },
      ],
      meta: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
      },
    },
  },
  {
    id: "hook-notification-idle-prompt",
    source: "official-doc",
    description: "空闲提醒应映射为 idle，而不是 waiting",
    sessionIdFields: ["session_id"],
    statusSignals: ["notification_type=idle_prompt"],
    taskSignals: ["message"],
    timestampSignals: [],
    hookSignal: "Notification",
    payload: hookNotificationIdlePrompt,
    expectation: {
      sessionId: "cb-session-103",
      status: "idle",
      task: "CodeBuddy has been idle for 60 seconds",
      timestamp: "now",
      activityItems: [
        {
          kind: "note",
          source: "system",
          title: "Notification",
          body: "CodeBuddy has been idle for 60 seconds",
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
    id: "hook-user-prompt-submit",
    source: "official-doc",
    description: "用户提交 prompt 后应切回 running，并展示 prompt 摘要",
    sessionIdFields: ["session_id"],
    statusSignals: ["hook_event_name=UserPromptSubmit"],
    taskSignals: ["prompt"],
    timestampSignals: [],
    hookSignal: "UserPromptSubmit",
    payload: hookUserPromptSubmit,
    expectation: {
      sessionId: "cb-session-104",
      status: "running",
      task: "Write a function to calculate the factorial of a number",
      timestamp: "now",
      activityItems: [
        {
          kind: "message",
          source: "user",
          title: "User",
          body: "Write a function to calculate the factorial of a number",
        },
      ],
      meta: {
        hook_event_name: "UserPromptSubmit",
      },
    },
  },
  {
    id: "hook-post-tool-use-write-result",
    source: "quasi-real",
    description: "PostToolUse 在结果字段存在时，应落成 tool result 而不是泛化状态 note",
    sessionIdFields: ["session_id"],
    statusSignals: ["hook_event_name=PostToolUse"],
    taskSignals: ["tool_name"],
    timestampSignals: [],
    hookSignal: "PostToolUse",
    payload: hookPostToolUseWriteResult,
    expectation: {
      sessionId: "cb-session-107",
      status: "running",
      task: "Write",
      timestamp: "now",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Write",
          body: "/workspace/demo/src/index.ts",
          toolName: "Write",
          toolPhase: "result",
        },
      ],
      meta: {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
      },
    },
  },
  {
    id: "hook-post-tool-use-response-result-output",
    source: "quasi-real",
    description: "PostToolUse 在 response.result.output 存在时，也应提取为可读 tool result",
    sessionIdFields: ["session_id"],
    statusSignals: ["hook_event_name=PostToolUse"],
    taskSignals: ["tool_name"],
    timestampSignals: [],
    hookSignal: "PostToolUse",
    payload: hookPostToolUseResponseResultOutput,
    expectation: {
      sessionId: "cb-session-108",
      status: "running",
      task: "Write",
      timestamp: "now",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Write",
          body: "Updated /workspace/demo/src/session.ts",
          toolName: "Write",
          toolPhase: "result",
        },
      ],
      meta: {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
      },
    },
  },
  {
    id: "hook-pre-tool-use-write",
    source: "official-doc",
    description: "PreToolUse 缺少显式 task 时，可降级使用 tool_name",
    sessionIdFields: ["session_id"],
    statusSignals: ["hook_event_name=PreToolUse"],
    taskSignals: ["tool_name"],
    timestampSignals: [],
    hookSignal: "PreToolUse",
    payload: hookPreToolUseWrite,
    expectation: {
      sessionId: "cb-session-105",
      status: "running",
      task: "Write",
      timestamp: "now",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Write",
          body: "/workspace/demo/src/index.ts",
          toolName: "Write",
          toolPhase: "call",
        },
      ],
      meta: {
        hook_event_name: "PreToolUse",
        tool_name: "Write",
      },
    },
  },
  {
    id: "hook-session-end-other",
    source: "official-doc",
    description: "SessionEnd 代表会话下线而非任务完成，状态偏向 offline",
    sessionIdFields: ["session_id"],
    statusSignals: ["hook_event_name=SessionEnd"],
    taskSignals: ["reason"],
    timestampSignals: [],
    hookSignal: "SessionEnd",
    payload: hookSessionEndOther,
    expectation: {
      sessionId: "cb-session-106",
      status: "offline",
      task: "other",
      timestamp: "now",
      activityItems: [
        {
          kind: "system",
          source: "system",
          title: "SessionEnd",
          body: "other",
          tone: "system",
        },
      ],
      meta: {
        hook_event_name: "SessionEnd",
        reason: "other",
      },
    },
  },
] as const;
