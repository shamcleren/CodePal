import { expect, it } from "vitest";
import { CURSOR_FIXTURES } from "../../../tests/fixtures/cursor";
import { normalizeCursorEvent } from "./normalizeCursorEvent";

it.each(CURSOR_FIXTURES)("normalizes cursor fixture $id", ({ payload, expectation }) => {
  const event = normalizeCursorEvent(payload);

  expect(event).toMatchObject({
    type: "status_change",
    sessionId: expectation.sessionId,
    tool: "cursor",
    status: expectation.status,
    ...(expectation.task !== undefined ? { task: expectation.task } : {}),
    activityItems: expectation.activityItems,
  });

  if (expectation.meta) {
    expect(event?.meta).toEqual(expect.objectContaining(expectation.meta));
  }
});

it("normalizes a status change payload", () => {
  const event = normalizeCursorEvent({
    hook_event_name: "StatusChange",
    session_id: "s1",
    cwd: "/tmp/project",
    task: "fix auth bug",
    status: "running",
  });

  expect(event).toMatchObject({
    type: "status_change",
    sessionId: "s1",
    tool: "cursor",
    status: "running",
    task: "fix auth bug",
  });
});

it("returns null when session_id is absent", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "StatusChange",
      status: "running",
    }),
  ).toBeNull();
});

it("returns null when session_id is null or only whitespace", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "StatusChange",
      session_id: null,
      status: "running",
    }),
  ).toBeNull();
  expect(
    normalizeCursorEvent({
      hook_event_name: "StatusChange",
      session_id: "  \t  ",
      status: "running",
    }),
  ).toBeNull();
});

it("accepts sessionId alias and trims whitespace", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "StatusChange",
      sessionId: "  sid  ",
      status: "idle",
    }),
  ).toMatchObject({ sessionId: "sid", tool: "cursor" });
});

it("ignores low-signal cursor sessionStart payloads that only announce agent mode", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "SessionStart",
      session_id: "cursor-raw-1",
      composer_mode: "agent",
    }),
  ).toBeNull();
});

it("keeps supported pending actions on raw cursor payloads", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "Notification",
      session_id: "cursor-raw-2",
      pendingAction: {
        id: "act-1",
        type: "approval",
        title: "Continue?",
        options: ["Yes", "No"],
      },
      responseTarget: {
        mode: "socket",
        socketPath: "/tmp/resp.sock",
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-2",
    status: "waiting",
    pendingAction: {
      id: "act-1",
      type: "approval",
    },
    responseTarget: {
      mode: "socket",
      socketPath: "/tmp/resp.sock",
    },
    activityItems: [
      {
        kind: "note",
        source: "system",
        title: "Notification",
        body: "Waiting",
        tone: "waiting",
      },
    ],
  });
});

it("maps permission_prompt notifications to waiting state with the prompt body", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "Notification",
      session_id: "cursor-notify-1",
      notification_type: "permission_prompt",
      message: "Cursor needs permission to run Bash",
    }),
  ).toMatchObject({
    sessionId: "cursor-notify-1",
    status: "waiting",
    task: "Cursor needs permission to run Bash",
    activityItems: [
      {
        kind: "note",
        source: "system",
        title: "Notification",
        body: "Cursor needs permission to run Bash",
        tone: "waiting",
        meta: {
          notificationType: "permission_prompt",
        },
      },
    ],
  });
});

it("maps idle_prompt notifications to idle state instead of waiting", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "Notification",
      session_id: "cursor-notify-2",
      notification_type: "idle_prompt",
      message: "Cursor has been idle for 60 seconds",
    }),
  ).toMatchObject({
    sessionId: "cursor-notify-2",
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
  });
});

it("degrades unsupported cursor interactive actions into visible waiting events", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "Notification",
      session_id: "cursor-raw-3",
      pendingAction: {
        id: "act-2",
        type: "text_input",
        title: "Explain why",
        options: [],
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-3",
    status: "waiting",
    task: "Unsupported Cursor action: text_input",
    meta: {
      hook_event_name: "Notification",
      unsupported_action_type: "text_input",
      unsupported_action_title: "Explain why",
    },
    activityItems: [
      {
        kind: "system",
        source: "system",
        title: "Unsupported Cursor action",
        body: "Unsupported Cursor action: text_input",
        tone: "waiting",
      },
    ],
    pendingAction: null,
  });
});

it("reads pendingClosed from raw cursor payloads", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "Stop",
      session_id: "cursor-raw-4",
      pendingClosed: {
        actionId: "act-1",
        reason: "consumed_remote",
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-4",
    pendingClosed: {
      actionId: "act-1",
      reason: "consumed_remote",
    },
  });
});

it("falls back to conversation_id when session_id is absent", () => {
  expect(
    normalizeCursorEvent({
      tool: "cursor",
      hook_event_name: "beforeSubmitPrompt",
      conversation_id: "conv-123",
      text: "ship it",
    }),
  ).toMatchObject({
    sessionId: "conv-123",
    tool: "cursor",
    status: "running",
    task: "ship it",
    activityItems: [
      {
        kind: "message",
        source: "user",
        title: "User",
        body: "ship it",
      },
    ],
  });
});

it("falls back to generation_id when neither session_id nor conversation_id is present", () => {
  expect(
    normalizeCursorEvent({
      tool: "cursor",
      hook_event_name: "afterAgentResponse",
      generation_id: "gen-123",
      text: "done",
    }),
  ).toMatchObject({
    sessionId: "gen-123",
    tool: "cursor",
    status: "running",
    task: "done",
    meta: {
      cursor_session_id_source: "generation",
    },
  });
});

it("maps afterAgentResponse into an assistant message activity", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterAgentResponse",
      session_id: "cursor-raw-5",
      text: "I finished the refactor and test pass.",
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-5",
    status: "running",
    activityItems: [
      {
        kind: "message",
        source: "assistant",
        title: "Assistant",
        body: "I finished the refactor and test pass.",
      },
    ],
  });
});

it("maps beforeShellExecution into a tool call activity", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "beforeShellExecution",
      session_id: "cursor-raw-6",
      tool_name: "Bash",
      command: "npm test -- --runInBand",
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-6",
    status: "running",
    activityItems: [
      {
        kind: "tool",
        source: "tool",
        title: "Bash",
        toolName: "Bash",
        toolPhase: "call",
        body: "npm test -- --runInBand",
      },
    ],
  });
});

it("maps beforeReadFile into a tool call activity with the file path from structured input", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "beforeReadFile",
      session_id: "cursor-raw-6b",
      tool_name: "Read",
      tool_input: {
        file_path: "src/renderer/App.tsx",
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-6b",
    status: "running",
    activityItems: [
      {
        kind: "tool",
        source: "tool",
        title: "Read",
        toolName: "Read",
        toolPhase: "call",
        body: "src/renderer/App.tsx",
      },
    ],
  });
});

it("maps afterMCPExecution into a tool result activity with output text", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterMCPExecution",
      session_id: "cursor-raw-6c",
      tool_name: "fetch_docs",
      output: "Found 3 docs for Electron IPC.",
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-6c",
    status: "running",
    activityItems: [
      {
        kind: "tool",
        source: "tool",
        title: "fetch_docs",
        toolName: "fetch_docs",
        toolPhase: "result",
        body: "Found 3 docs for Electron IPC.",
      },
    ],
  });
});

it("maps afterMCPExecution into a tool result activity with nested response stderr", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterMCPExecution",
      session_id: "cursor-raw-6c2",
      tool_name: "fetch_docs",
      response: {
        stderr: "read_timeout while fetching docs",
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-6c2",
    status: "running",
    activityItems: [
      {
        kind: "tool",
        source: "tool",
        title: "fetch_docs",
        toolName: "fetch_docs",
        toolPhase: "result",
        body: "read_timeout while fetching docs",
      },
    ],
  });
});

it("maps afterShellExecution into a tool result activity with stdout text", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterShellExecution",
      session_id: "cursor-raw-6cc",
      tool_name: "Bash",
      stdout: "PASS src/main/ipc/ipcHub.test.ts",
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-6cc",
    status: "running",
    activityItems: [
      {
        kind: "tool",
        source: "tool",
        title: "Bash",
        toolName: "Bash",
        toolPhase: "result",
        body: "PASS src/main/ipc/ipcHub.test.ts",
      },
    ],
  });
});

it("maps PostToolUse into a tool result activity with nested result text", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "PostToolUse",
      session_id: "cursor-raw-6d",
      tool_name: "Edit",
      result: {
        output: "Updated src/main/ipc/ipcHub.ts",
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-6d",
    status: "running",
    activityItems: [
      {
        kind: "tool",
        source: "tool",
        title: "Edit",
        toolName: "Edit",
        toolPhase: "result",
        body: "Updated src/main/ipc/ipcHub.ts",
      },
    ],
  });
});

it("maps PostToolUse into a tool result activity with nested response result output", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "PostToolUse",
      session_id: "cursor-raw-6dd",
      tool_name: "Edit",
      response: {
        result: {
          output: "Updated src/renderer/components/HoverDetails.tsx",
        },
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-6dd",
    status: "running",
    activityItems: [
      {
        kind: "tool",
        source: "tool",
        title: "Edit",
        toolName: "Edit",
        toolPhase: "result",
        body: "Updated src/renderer/components/HoverDetails.tsx",
      },
    ],
  });
});

it("maps afterFileEdit into a system activity with edit summary", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterFileEdit",
      session_id: "cursor-raw-7",
      text: "Edited src/renderer/styles.css +22 -6",
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-7",
    status: "running",
    activityItems: [
      {
        kind: "system",
        source: "system",
        title: "File Edit",
        body: "Edited src/renderer/styles.css +22 -6",
      },
    ],
  });
});

it("maps afterFileEdit into a system activity with the edited file path when only structured payload exists", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterFileEdit",
      session_id: "cursor-raw-7b",
      tool_input: {
        file_path: "src/main/session/sessionStore.ts",
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-7b",
    status: "running",
    activityItems: [
      {
        kind: "system",
        source: "system",
        title: "File Edit",
        body: "Edited src/main/session/sessionStore.ts",
      },
    ],
  });
});

it("drops afterAgentThought so internal reasoning does not render in the session timeline", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterAgentThought",
      session_id: "cursor-raw-8",
      text: "**Explaining JSON completion** I think I need to clarify...",
    }),
  ).toBeNull();
});
