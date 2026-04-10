import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClaudeSessionWatcher } from "./claudeSessionWatcher";

describe("createClaudeSessionWatcher", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("reads new Claude log lines incrementally without replaying old ones", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-claude-"));
    const projectDir = path.join(tmpDir, "-Users-demo-codepal");
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(
      projectDir,
      "cc438eb3-af18-4eab-b69f-76925a94655b.jsonl",
    );

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:08:23.948Z",
        message: {
          role: "user",
          content: "可以切换到 2.7 模型吗？",
        },
      })}\n`,
    );

    const onEvent = vi.fn();
    const watcher = createClaudeSessionWatcher({
      projectsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();
    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
      tool: "claude",
      status: "running",
      task: "可以切换到 2.7 模型吗？",
    });

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
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
              text: "\n\n当前可用的是 Opus 4.6、Sonnet 4.6 和 Haiku 4.5。",
            },
          ],
        },
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      status: "completed",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "assistant",
          body: "当前可用的是 Opus 4.6、Sonnet 4.6 和 Haiku 4.5。",
        }),
      ],
    });
  });

  it("backfills tool result names from earlier Claude tool calls", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-claude-"));
    const projectDir = path.join(tmpDir, "-Users-demo-codepal");
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(
      projectDir,
      "cc438eb3-af18-4eab-b69f-76925a94655b.jsonl",
    );

    fs.writeFileSync(filePath, "");

    const onEvent = vi.fn();
    const watcher = createClaudeSessionWatcher({
      projectsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        type: "assistant",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:12:07.001Z",
        message: {
          role: "assistant",
          model: "MiniMax-M2.7",
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
      })}\n`,
    );
    await watcher.pollOnce();

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:12:07.426Z",
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
      })}\n`,
    );
    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      task: "REDIRECT DETECTED: The URL redirects to a different host.",
      activityItems: [
        expect.objectContaining({
          title: "WebFetch",
          toolName: "WebFetch",
          toolPhase: "result",
        }),
      ],
    });
  });

  it("emits usage snapshots from assistant usage payloads even when session event is suppressed", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-claude-"));
    const projectDir = path.join(tmpDir, "-Users-demo-codepal");
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(
      projectDir,
      "cc438eb3-af18-4eab-b69f-76925a94655b.jsonl",
    );

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        type: "assistant",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:08:12.504Z",
        message: {
          role: "assistant",
          model: "MiniMax-M2.5",
          content: [
            {
              type: "thinking",
              thinking: "让我先整理一下。",
            },
          ],
          usage: {
            input_tokens: 4424,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          },
        },
      })}\n`,
    );

    const onEvent = vi.fn();
    const onUsageSnapshot = vi.fn();
    const watcher = createClaudeSessionWatcher({
      projectsRoot: tmpDir,
      onEvent,
      onUsageSnapshot,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();

    expect(onEvent).not.toHaveBeenCalled();
    expect(onUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "claude",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        source: "session-derived",
        title: "MiniMax-M2.5",
        tokens: expect.objectContaining({
          input: 4424,
          output: 0,
          total: 4424,
          cachedInput: 0,
        }),
      }),
    );
  });

  it("marks a Claude session completed when transcript hook progress emits Stop", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-claude-"));
    const projectDir = path.join(tmpDir, "-Users-demo-codepal");
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(
      projectDir,
      "cc438eb3-af18-4eab-b69f-76925a94655b.jsonl",
    );

    fs.writeFileSync(filePath, "");

    const onEvent = vi.fn();
    const watcher = createClaudeSessionWatcher({
      projectsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:08:23.948Z",
        message: {
          role: "user",
          content: "hello",
        },
      })}\n`,
    );
    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        type: "progress",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-03T13:08:27.952Z",
        data: {
          type: "hook_progress",
          hookEvent: "Stop",
          hookName: "Stop",
          command: "/Users/demo/.vibe-island/bin/vibe-island-bridge --source claude",
        },
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
      tool: "claude",
      status: "completed",
      task: "Claude request finished",
      activityItems: [
        expect.objectContaining({
          kind: "system",
          source: "system",
          title: "Claude request finished",
          tone: "completed",
        }),
      ],
    });
  });

  it("ignores local-command user lines after Stop so completed Claude sessions stay completed", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-claude-"));
    const projectDir = path.join(tmpDir, "-Users-demo-codepal");
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(
      projectDir,
      "cc438eb3-af18-4eab-b69f-76925a94655b.jsonl",
    );

    fs.writeFileSync(filePath, "");

    const onEvent = vi.fn();
    const watcher = createClaudeSessionWatcher({
      projectsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        type: "assistant",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-07T03:50:34.269Z",
        message: {
          role: "assistant",
          model: "MiniMax-M2.7",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "我是 MiniMax-M2.7 模型。" }],
        },
      })}\n`,
    );
    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        type: "progress",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        timestamp: "2026-04-07T03:50:34.272Z",
        data: {
          type: "hook_progress",
          hookEvent: "Stop",
          hookName: "Stop",
        },
      })}\n`,
    );
    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        type: "user",
        sessionId: "cc438eb3-af18-4eab-b69f-76925a94655b",
        isMeta: true,
        timestamp: "2026-04-07T03:50:53.384Z",
        message: {
          role: "user",
          content:
            "<command-name>/status</command-name>\n<command-message>status</command-message>",
        },
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      status: "completed",
      task: "Claude request finished",
    });
  });
});
