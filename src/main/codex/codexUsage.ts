type CodexTokenUsageSourceKeyParts = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  reasoningTokens?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCacheReadTokens?: number;
  totalReasoningTokens?: number;
};

function keyNumber(value: number | undefined): number {
  return value ?? 0;
}

export function codexInputTokensForStorage(
  inputTokens: number | undefined,
  cacheReadTokens: number | undefined,
): number | undefined {
  if (inputTokens === undefined) {
    return undefined;
  }
  if (cacheReadTokens === undefined) {
    return inputTokens;
  }
  return Math.max(0, inputTokens - cacheReadTokens);
}

export function makeCodexTokenUsageSourceKey(
  sessionId: string,
  parts: CodexTokenUsageSourceKeyParts,
): string {
  return [
    "codex",
    sessionId,
    "total",
    keyNumber(parts.totalInputTokens),
    keyNumber(parts.totalOutputTokens),
    keyNumber(parts.totalCacheReadTokens),
    keyNumber(parts.totalReasoningTokens),
    "last",
    keyNumber(parts.inputTokens),
    keyNumber(parts.outputTokens),
    keyNumber(parts.cacheReadTokens),
    keyNumber(parts.reasoningTokens),
  ].join(":");
}
