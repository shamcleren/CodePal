import type { ClaudeQuotaDiagnostics, ClaudeQuotaSyncResult } from "../../shared/claudeQuotaTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";

type ClaudeQuotaServiceOptions = {
  getCachedSnapshot?: () => UsageSnapshot | null;
};

function isClaudeCliRateLimitSnapshot(snapshot: UsageSnapshot | null | undefined): snapshot is UsageSnapshot {
  return Boolean(
    snapshot &&
      snapshot.agent === "claude" &&
      snapshot.source === "statusline-derived" &&
      snapshot.rateLimit,
  );
}

export function buildClaudeQuotaDiagnostics(snapshot: UsageSnapshot | null): ClaudeQuotaDiagnostics {
  if (isClaudeCliRateLimitSnapshot(snapshot)) {
    return {
      state: "connected",
      message: "已接收 Claude Code CLI quota",
      messageKey: "claudeQuota.message.connected",
      source: "statusline-derived",
      lastSyncAt: snapshot.updatedAt,
    };
  }

  return {
    state: "not_connected",
    message: "尚未收到 Claude Code CLI rate_limits",
    messageKey: "claudeQuota.message.not_connected",
  };
}

export function createClaudeQuotaService(options: ClaudeQuotaServiceOptions = {}) {
  const getCachedSnapshot = options.getCachedSnapshot ?? (() => null);

  function currentSnapshot() {
    const snapshot = getCachedSnapshot();
    return isClaudeCliRateLimitSnapshot(snapshot) ? snapshot : null;
  }

  async function getDiagnostics(): Promise<ClaudeQuotaDiagnostics> {
    return buildClaudeQuotaDiagnostics(currentSnapshot());
  }

  async function refreshUsage(): Promise<ClaudeQuotaSyncResult> {
    const snapshot = currentSnapshot();
    return {
      diagnostics: buildClaudeQuotaDiagnostics(snapshot),
      synced: Boolean(snapshot),
    };
  }

  return {
    getDiagnostics,
    refreshUsage,
  };
}
