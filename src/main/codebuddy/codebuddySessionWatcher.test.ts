import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodeBuddySessionWatcher } from "./codebuddySessionWatcher";

const transcriptFixturePath = path.resolve(
  __dirname,
  "../../../tests/fixtures/codebuddy/transcript-basic.jsonl",
);
const transcriptFixture = fs.readFileSync(transcriptFixturePath, "utf8");

describe("createCodeBuddySessionWatcher", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("reads CodeBuddy transcript lines incrementally and emits assistant messages", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codebuddy-"));
    const projectDir = path.join(tmpDir, "Users-demo-codepal");
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(projectDir, "transcript-basic.jsonl");

    fs.writeFileSync(filePath, `${transcriptFixture.split("\n")[0]}\n`);

    const onEvent = vi.fn();
    const watcher = createCodeBuddySessionWatcher({
      projectsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();
    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "transcript-basic",
      tool: "codebuddy",
      status: "running",
      task: "帮我看一下当前仓库的问题",
    });

    fs.appendFileSync(filePath, `${transcriptFixture.split("\n")[1]}\n`);

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "transcript-basic",
      status: "completed",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "assistant",
          body: "我先检查一下仓库结构和最近变更。",
        }),
      ],
    });
  });

  it("backfills tool result names from earlier CodeBuddy tool calls", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codebuddy-"));
    const projectDir = path.join(tmpDir, "Users-demo-codepal");
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(projectDir, "transcript-basic.jsonl");

    fs.writeFileSync(filePath, "");

    const onEvent = vi.fn();
    const watcher = createCodeBuddySessionWatcher({
      projectsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    for (const line of transcriptFixture.trim().split("\n")) {
      fs.appendFileSync(filePath, `${line}\n`);
      await watcher.pollOnce();
    }

    expect(onEvent).toHaveBeenCalledTimes(4);
    expect(onEvent.mock.calls[3]?.[0]).toMatchObject({
      task: "# CodePal",
      activityItems: [
        expect.objectContaining({
          title: "Read",
          toolName: "Read",
          toolPhase: "result",
          meta: expect.objectContaining({
            callId: "toolu_read_1",
          }),
        }),
      ],
    });
  });

  it("reads CodeBuddy CN app ui_messages and emits user and assistant messages", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codebuddy-ui-"));
    const tasksRoot = path.join(tmpDir, "tasks");
    const taskDir = path.join(tasksRoot, "1759217450870");
    fs.mkdirSync(taskDir, { recursive: true });
    const filePath = path.join(taskDir, "ui_messages.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify([
        {
          ts: 1759217450933,
          type: "say",
          say: "text",
          text: "给我一句话",
          conversationHistoryIndex: -1,
        },
        {
          ts: 1759217454811,
          type: "say",
          say: "text",
          text: "你好！",
          partial: false,
          conversationHistoryIndex: 0,
        },
        {
          ts: 1759217455426,
          type: "ask",
          ask: "followup",
          text: JSON.stringify({
            question: "",
            conversationId: "c-8619-1759217450870",
          }),
          partial: false,
          conversationHistoryIndex: 0,
        },
      ]),
    );

    const onEvent = vi.fn();
    const watcher = createCodeBuddySessionWatcher({
      projectsRoot: path.join(tmpDir, "projects"),
      appTasksRoot: tasksRoot,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "c-8619-1759217450870",
      tool: "codebuddy",
      status: "running",
      task: "给我一句话",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "user",
          body: "给我一句话",
        }),
      ],
    });
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "c-8619-1759217450870",
      tool: "codebuddy",
      status: "running",
      task: "你好！",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "assistant",
          body: "你好！",
        }),
      ],
    });
    expect(onEvent.mock.calls[2]?.[0]).toMatchObject({
      sessionId: "c-8619-1759217450870",
      tool: "codebuddy",
      status: "completed",
    });
  });

  it("keeps a stable ui session id when conversationId appears in a later poll", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codebuddy-ui-late-conv-"));
    const tasksRoot = path.join(tmpDir, "tasks");
    const taskDir = path.join(tasksRoot, "1760151605769");
    fs.mkdirSync(taskDir, { recursive: true });
    const filePath = path.join(taskDir, "ui_messages.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify([
        {
          ts: 1760151605798,
          type: "say",
          say: "text",
          text: "给我一句话",
          conversationHistoryIndex: -1,
        },
        {
          ts: 1760151610567,
          type: "say",
          say: "text",
          text: "你好！",
          partial: false,
          conversationHistoryIndex: 0,
        },
      ]),
    );

    const onEvent = vi.fn();
    const watcher = createCodeBuddySessionWatcher({
      projectsRoot: path.join(tmpDir, "projects"),
      appTasksRoot: tasksRoot,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();

    fs.writeFileSync(
      filePath,
      JSON.stringify([
        {
          ts: 1760151605798,
          type: "say",
          say: "text",
          text: "给我一句话",
          conversationHistoryIndex: -1,
        },
        {
          ts: 1760151610567,
          type: "say",
          say: "text",
          text: "你好！",
          partial: false,
          conversationHistoryIndex: 0,
        },
        {
          ts: 1760151612000,
          type: "ask",
          ask: "followup",
          text: JSON.stringify({
            question: "",
            conversationId: "c-10425-1760151605769",
          }),
          partial: false,
          conversationHistoryIndex: 1,
        },
        {
          ts: 1760151613000,
          type: "say",
          say: "text",
          text: "再补一句。",
          partial: false,
          conversationHistoryIndex: 1,
        },
      ]),
    );

    await watcher.pollOnce();

    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "codebuddy-ui:1760151605769",
    });
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "codebuddy-ui:1760151605769",
    });
    expect(onEvent.mock.calls[2]?.[0]).toMatchObject({
      sessionId: "codebuddy-ui:1760151605769",
      status: "completed",
    });
    expect(onEvent.mock.calls[3]?.[0]).toMatchObject({
      sessionId: "codebuddy-ui:1760151605769",
      activityItems: [
        expect.objectContaining({
          source: "assistant",
          body: "再补一句。",
        }),
      ],
    });
  });

  it("reads CodeBuddy IDE history transcripts and emits assistant content from message files", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codebuddy-ide-history-"));
    const historyRoot = path.join(tmpDir, "CodeBuddyExtension", "Data");
    const conversationDir = path.join(
      historyRoot,
      "user-1",
      "CodeBuddyIDE",
      "user-1",
      "history",
      "workspace-1",
      "030c49b34692413a8cd7b1c9817b0d57",
    );
    const messagesDir = path.join(conversationDir, "messages");
    fs.mkdirSync(messagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(conversationDir, "index.json"),
      JSON.stringify(
        {
          messages: [
            {
              id: "f16ad1bf452f46b183cf43914fb40fec",
              type: "text",
              role: "user",
              isComplete: true,
            },
            {
              id: "7fa30d20b1fb4a149c248f70b53b912b",
              type: "text",
              role: "assistant",
              isComplete: true,
            },
          ],
          requests: [
            {
              id: "2c15675026434c36b91e06d2837784b2",
              type: "craft",
              messages: [
                "f16ad1bf452f46b183cf43914fb40fec",
                "7fa30d20b1fb4a149c248f70b53b912b",
              ],
              state: "complete",
              startedAt: 1775569531215,
            },
          ],
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(messagesDir, "f16ad1bf452f46b183cf43914fb40fec.json"),
      JSON.stringify({
        role: "user",
        message: JSON.stringify({
          role: "user",
          content: [
            {
              type: "text",
              text: "<user_query>\n欢迎使用 CodePal\n</user_query>",
            },
          ],
        }),
        id: "f16ad1bf452f46b183cf43914fb40fec",
        extra: JSON.stringify({
          sourceContentBlocks: [{ type: "text", text: "欢迎使用 CodePal" }],
        }),
      }),
    );
    fs.writeFileSync(
      path.join(messagesDir, "7fa30d20b1fb4a149c248f70b53b912b.json"),
      JSON.stringify({
        role: "assistant",
        message: JSON.stringify({
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "用户让我直接说欢迎使用 CodePal。",
            },
            {
              type: "text",
              text: "谢谢！我是CodePal，很高兴为您服务。请问有什么可以帮您的？",
            },
          ],
        }),
        id: "7fa30d20b1fb4a149c248f70b53b912b",
      }),
    );

    const onEvent = vi.fn();
    const watcher = createCodeBuddySessionWatcher({
      projectsRoot: path.join(tmpDir, "projects"),
      appHistoryRoot: historyRoot,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sessionId: "030c49b34692413a8cd7b1c9817b0d57",
        tool: "codebuddy",
        status: "running",
        task: "欢迎使用 CodePal",
        activityItems: [
          expect.objectContaining({
            kind: "message",
            source: "assistant",
            body: "谢谢！我是CodePal，很高兴为您服务。请问有什么可以帮您的？",
          }),
        ],
      }),
    );
    expect(onEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: "030c49b34692413a8cd7b1c9817b0d57",
        tool: "codebuddy",
        status: "completed",
      }),
    );
  });
});
