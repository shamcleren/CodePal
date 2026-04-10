import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_FIXTURES,
  CODEX_FIXTURE_SOURCE_PATH,
} from "../../../tests/fixtures/codex";
import { createCodexSessionWatcher } from "./codexSessionWatcher";

describe("createCodexSessionWatcher", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("reads new Codex log lines incrementally without replaying old ones", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codex-"));
    const sessionDir = path.join(tmpDir, "2026", "04", "02");
    fs.mkdirSync(sessionDir, { recursive: true });
    const filePath = path.join(
      sessionDir,
      "rollout-2026-04-02T10-46-14-019d4c15-8d42-78f1-955e-d57f67061b9e.jsonl",
    );

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T02:46:49.900Z",
        type: "session_meta",
        payload: {
          id: "019d4c15-8d42-78f1-955e-d57f67061b9e",
          cwd: "/Users/demo/codepal",
        },
      })}\n`,
    );

    const onEvent = vi.fn();
    const watcher = createCodexSessionWatcher({
      sessionsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();
    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "running",
    });

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T02:46:58.278Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "继续推进 Codex 接入。",
        },
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      task: "继续推进 Codex 接入。",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "user",
          body: "继续推进 Codex 接入。",
        }),
      ],
    });
  });

  it("keeps incremental reads aligned when new lines contain multibyte text", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codex-"));
    const sessionDir = path.join(tmpDir, "2026", "04", "02");
    fs.mkdirSync(sessionDir, { recursive: true });
    const filePath = path.join(
      sessionDir,
      "rollout-2026-04-02T15-11-32-019d4d08-71ca-71a2-a533-55d6b7a9d395.jsonl",
    );

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T08:00:51.370Z",
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: "turn_1",
        },
      })}\n`,
    );

    const onEvent = vi.fn();
    const watcher = createCodexSessionWatcher({
      sessionsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T08:00:51.372Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "好像还不对，现在的消息还是之前的？我新写的消息没有同步上？\n",
        },
      })}\n`,
    );

    await watcher.pollOnce();

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T08:02:11.745Z",
        type: "event_msg",
        payload: {
          type: "context_compacted",
        },
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      status: "running",
      task: "好像还不对，现在的消息还是之前的？我新写的消息没有同步上？",
    });
    expect(onEvent.mock.calls[2]?.[0]).toMatchObject({
      status: "idle",
      task: "Context compacted",
    });
  });

  it("replays codex response_item fixtures through watcher incremental polling", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codex-"));
    const relativePath = CODEX_FIXTURE_SOURCE_PATH.replace("/Users/demo/.codex/sessions/", "");
    const filePath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "");

    const onEvent = vi.fn();
    const watcher = createCodexSessionWatcher({
      sessionsRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    for (const fixture of CODEX_FIXTURES) {
      fs.appendFileSync(filePath, `${JSON.stringify(fixture.entry)}\n`);
      await watcher.pollOnce();
    }

    expect(onEvent).toHaveBeenCalledTimes(CODEX_FIXTURES.length);
    expect(onEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      sessionId: CODEX_FIXTURES[CODEX_FIXTURES.length - 1]?.expectation.sessionId,
      tool: "codex",
      status: CODEX_FIXTURES[CODEX_FIXTURES.length - 1]?.expectation.status,
      task: CODEX_FIXTURES[CODEX_FIXTURES.length - 1]?.expectation.task,
      activityItems: CODEX_FIXTURES[CODEX_FIXTURES.length - 1]?.expectation.activityItems,
    });
  });

  it("emits usage snapshots from codex token_count events", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codex-"));
    const sessionDir = path.join(tmpDir, "2026", "04", "03");
    fs.mkdirSync(sessionDir, { recursive: true });
    const filePath = path.join(
      sessionDir,
      "rollout-2026-04-03T15-58-28-019d5259-c667-7f20-8671-cfef325536d3.jsonl",
    );

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-03T09:58:30.686Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 1200,
              cached_input_tokens: 800,
              output_tokens: 120,
              reasoning_output_tokens: 20,
              total_tokens: 1320,
            },
            last_token_usage: {
              input_tokens: 300,
              cached_input_tokens: 120,
              output_tokens: 40,
              reasoning_output_tokens: 8,
              total_tokens: 340,
            },
            model_context_window: 258400,
          },
          rate_limits: {
            primary: {
              used_percent: 2,
              window_minutes: 300,
              resets_at: 1772804843,
            },
            secondary: {
              used_percent: 9,
              window_minutes: 10080,
              resets_at: 1773373632,
            },
            plan_type: "plus",
          },
        },
      })}\n`,
    );

    const onEvent = vi.fn();
    const onUsageSnapshot = vi.fn();
    const watcher = createCodexSessionWatcher({
      sessionsRoot: tmpDir,
      onEvent,
      onUsageSnapshot,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();

    expect(onEvent).not.toHaveBeenCalled();
    expect(onUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "codex",
        sessionId: "019d5259-c667-7f20-8671-cfef325536d3",
        source: "session-derived",
        tokens: expect.objectContaining({
          input: 300,
          output: 40,
          total: 340,
          cachedInput: 120,
          reasoningOutput: 8,
        }),
        context: expect.objectContaining({
          used: 340,
          max: 258400,
        }),
        rateLimit: expect.objectContaining({
          usedPercent: 2,
          resetAt: 1772804843,
          windowLabel: "300m",
          planType: "plus",
          windows: [
            expect.objectContaining({
              key: "primary",
              label: "5 小时",
              usedPercent: 2,
            }),
            expect.objectContaining({
              key: "secondary",
              label: "7 天",
              usedPercent: 9,
            }),
          ],
        }),
        meta: expect.objectContaining({
          totalTokenUsage: expect.objectContaining({
            total_tokens: 1320,
          }),
        }),
      }),
    );
  });
});
