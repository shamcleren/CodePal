import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHistoryStore } from "./historyStore";
import { runUsageBackfill } from "./usageBackfill";

describe("runUsageBackfill", () => {
  let tmpDir: string | null = null;
  let store: ReturnType<typeof createHistoryStore> | null = null;

  afterEach(() => {
    store?.close();
    store = null;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("imports Claude and Codex token usage from local JSONL history idempotently", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-usage-backfill-"));
    const dbPath = path.join(tmpDir, "history.sqlite");
    const claudeRoot = path.join(tmpDir, ".claude", "projects");
    const codexRoot = path.join(tmpDir, ".codex", "sessions");
    fs.mkdirSync(path.join(claudeRoot, "project-a"), { recursive: true });
    fs.mkdirSync(path.join(codexRoot, "2026", "05"), { recursive: true });

    fs.writeFileSync(
      path.join(claudeRoot, "project-a", "claude-session.jsonl"),
      [
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          timestamp: "2026-05-12T09:59:00.000Z",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: "帮我优化 Analytics 的 session 展示\n第二行不用进标题",
              },
            ],
          },
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: "claude-session",
          timestamp: "2026-05-12T10:00:00.000Z",
          message: {
            id: "msg_1",
            model: "claude-sonnet-4-5-20250929",
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 25,
              cache_creation_input_tokens: 5,
            },
          },
        }),
        "",
      ].join("\n"),
    );

    const codexSessionId = "12345678-1234-1234-1234-123456789abc";
    fs.writeFileSync(
      path.join(codexRoot, "2026", "05", `${codexSessionId}.jsonl`),
      [
        JSON.stringify({
          type: "turn_context",
          timestamp: "2026-05-12T11:00:00.000Z",
          payload: { model: "gpt-5.5" },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-05-12T11:00:30.000Z",
          payload: {
            type: "user_message",
            message: "继续推进 Codex 历史用量补齐。",
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-05-12T11:01:00.000Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 200,
                output_tokens: 75,
                cached_input_tokens: 50,
                reasoning_output_tokens: 25,
              },
            },
          },
        }),
        "",
      ].join("\n"),
    );

    store = createHistoryStore({ dbPath, now: () => Date.parse("2026-05-19T00:00:00.000Z") });

    const first = runUsageBackfill({
      historyStore: store,
      claudeProjectsPath: claudeRoot,
      codexSessionsPath: codexRoot,
      now: () => Date.parse("2026-05-19T00:00:00.000Z"),
    });
    const second = runUsageBackfill({
      historyStore: store,
      claudeProjectsPath: claudeRoot,
      codexSessionsPath: codexRoot,
      now: () => Date.parse("2026-05-19T00:00:00.000Z"),
    });

    expect(first).toMatchObject({
      completedAt: Date.parse("2026-05-19T00:00:00.000Z"),
      claudeRowsImported: 1,
      codexRowsImported: 1,
      lastError: null,
    });
    expect(second).toMatchObject({
      claudeRowsImported: 1,
      codexRowsImported: 1,
      lastError: null,
    });
    expect(store.getUsageImportStatus()).toEqual(first);
    expect(store.getTokenUsageByModel(0, Date.parse("2026-05-13T00:00:00.000Z"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: "codex",
          model: "gpt-5.5",
          inputTokens: 200,
          outputTokens: 75,
          cacheReadTokens: 50,
          totalTokens: 325,
          requestCount: 1,
        }),
        expect.objectContaining({
          agent: "claude",
          model: "claude-sonnet-4-5-20250929",
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 25,
          cacheCreationTokens: 5,
          totalTokens: 180,
          requestCount: 1,
        }),
      ]),
    );
    expect(store.getTopTokenUsageSessions(0, Date.parse("2026-05-13T00:00:00.000Z"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: codexSessionId,
          title: "继续推进 Codex 历史用量补齐。",
        }),
        expect.objectContaining({
          sessionId: "claude-session",
          title: "帮我优化 Analytics 的 session 展示",
        }),
      ]),
    );
  });
});
