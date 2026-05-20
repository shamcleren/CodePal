import { describe, expect, it } from "vitest";
import { buildClaudeQuotaDiagnostics, createClaudeQuotaService } from "./claudeQuotaService";

describe("claudeQuotaService", () => {
  it("reports connected when a cached Claude CLI statusline snapshot exists", () => {
    expect(
      buildClaudeQuotaDiagnostics({
        agent: "claude",
        sessionId: "claude-1",
        source: "statusline-derived",
        updatedAt: 1_776_000_000_000,
        rateLimit: {
          usedPercent: 22,
        },
      }),
    ).toEqual({
      state: "connected",
      message: "已接收 Claude Code CLI quota",
      messageKey: "claudeQuota.message.connected",
      source: "statusline-derived",
      lastSyncAt: 1_776_000_000_000,
    });
  });

  it("reports not connected when no Claude CLI quota snapshot exists", () => {
    expect(buildClaudeQuotaDiagnostics(null)).toEqual({
      state: "not_connected",
      message: "尚未收到 Claude Code CLI rate_limits",
      messageKey: "claudeQuota.message.not_connected",
    });
  });

  it("refreshes by re-reading the cached Claude CLI snapshot", async () => {
    const service = createClaudeQuotaService({
      getCachedSnapshot: () => ({
        agent: "claude",
        sessionId: "claude-2",
        source: "statusline-derived",
        updatedAt: 1_776_000_100_000,
        rateLimit: {
          usedPercent: 35,
          resetAt: 1_775_808_000,
        },
      }),
    });

    await expect(service.refreshUsage()).resolves.toEqual({
      diagnostics: {
        state: "connected",
        message: "已接收 Claude Code CLI quota",
        messageKey: "claudeQuota.message.connected",
        source: "statusline-derived",
        lastSyncAt: 1_776_000_100_000,
      },
      synced: true,
    });
  });

  it("stays not connected when no cached Claude CLI quota snapshot is available", async () => {
    const service = createClaudeQuotaService();

    await expect(service.refreshUsage()).resolves.toEqual({
      diagnostics: {
        state: "not_connected",
        message: "尚未收到 Claude Code CLI rate_limits",
        messageKey: "claudeQuota.message.not_connected",
      },
      synced: false,
    });
  });

  it("reports connected with modelName when snapshot has model info but no rate limits", () => {
    expect(
      buildClaudeQuotaDiagnostics({
        agent: "claude",
        sessionId: "claude-3",
        source: "statusline-derived",
        updatedAt: 1_776_000_200_000,
        meta: { statusline_source: "claude", model: "claude-opus-4-7" },
      }),
    ).toEqual({
      state: "connected",
      message: "已接收 Claude Code CLI quota",
      messageKey: "claudeQuota.message.connected",
      source: "statusline-derived",
      lastSyncAt: 1_776_000_200_000,
      modelName: "claude-opus-4-7",
    });
  });

  it("includes modelName when snapshot has both rate limits and model info", () => {
    expect(
      buildClaudeQuotaDiagnostics({
        agent: "claude",
        sessionId: "claude-4",
        source: "statusline-derived",
        updatedAt: 1_776_000_300_000,
        rateLimit: { usedPercent: 45 },
        meta: { statusline_source: "claude", model: "claude-sonnet-4-6-20260217" },
      }),
    ).toEqual({
      state: "connected",
      message: "已接收 Claude Code CLI quota",
      messageKey: "claudeQuota.message.connected",
      source: "statusline-derived",
      lastSyncAt: 1_776_000_300_000,
      modelName: "claude-sonnet-4-6-20260217",
    });
  });
});
