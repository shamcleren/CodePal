import type { TokenUsageWrite, UsageSnapshot } from "../../shared/usageTypes";

function numberOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function snapshotModel(snapshot: UsageSnapshot): string | undefined {
  const model = snapshot.meta?.model;
  return typeof model === "string" && model.trim() ? model.trim() : undefined;
}

export function tokenUsageWriteFromUsageSnapshot(
  snapshot: UsageSnapshot,
): TokenUsageWrite | null {
  if (!snapshot.sessionId || !snapshot.tokens) {
    return null;
  }

  const inputTokens = numberOrZero(snapshot.tokens.input);
  const outputTokens = numberOrZero(snapshot.tokens.output);
  const cacheReadTokens = numberOrZero(snapshot.tokens.cachedInput);
  const reasoningTokens = numberOrZero(snapshot.tokens.reasoningOutput);
  if (inputTokens + outputTokens + cacheReadTokens + reasoningTokens <= 0) {
    return null;
  }

  const model = snapshotModel(snapshot);
  const sourceKey = [
    snapshot.source,
    snapshot.agent,
    snapshot.sessionId,
    model ?? "",
    String(inputTokens),
    String(outputTokens),
    String(cacheReadTokens),
    String(reasoningTokens),
  ].join(":");

  return {
    sessionId: snapshot.sessionId,
    agent: snapshot.agent,
    ...(model ? { model } : {}),
    timestamp: snapshot.updatedAt,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    reasoningTokens,
    sourceKind: `usage-snapshot:${snapshot.source}`,
    sourceKey,
  };
}
