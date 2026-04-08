import type { UsageSnapshot, UsageRateLimit } from "../../shared/usageTypes";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(payload: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function resetAtSeconds(value: unknown): number | undefined {
  const numeric = numberValue(value);
  if (numeric !== undefined) {
    return numeric > 1_000_000_000_000 ? Math.round(numeric / 1000) : Math.round(numeric);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed / 1000);
    }
  }
  return undefined;
}

function inferWindowLabel(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized === "primary" || normalized.includes("five") || normalized.includes("5h")) {
    return "5h";
  }
  if (
    normalized === "secondary" ||
    normalized.includes("seven") ||
    normalized.includes("7d") ||
    normalized.includes("week")
  ) {
    return "7d";
  }
  return key.replace(/_/g, " ");
}

function buildRateLimit(raw: Record<string, unknown> | undefined): UsageRateLimit | undefined {
  if (!raw) {
    return undefined;
  }

  const windows = Object.entries(raw)
    .map(([key, value]) => {
      const window = asRecord(value);
      if (!window) {
        return null;
      }
      const usedPercent =
        numberValue(window.used_percentage) ?? numberValue(window.usedPercent);
      const resetAt = resetAtSeconds(window.resets_at ?? window.resetAt);
      const remaining = numberValue(window.remaining);
      const limit = numberValue(window.limit);
      if (
        usedPercent === undefined &&
        resetAt === undefined &&
        remaining === undefined &&
        limit === undefined
      ) {
        return null;
      }
      return {
        key,
        label:
          firstString(window, ["label", "window_label", "windowLabel"]) ?? inferWindowLabel(key),
        usedPercent,
        resetAt,
        remaining,
        limit,
        windowLabel:
          firstString(window, ["window_label", "windowLabel"]) ?? inferWindowLabel(key),
        planType: firstString(window, ["plan_type", "planType"]),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (windows.length > 0) {
    const primary = windows[0];
    return {
      usedPercent: primary.usedPercent,
      resetAt: primary.resetAt,
      remaining: primary.remaining,
      limit: primary.limit,
      windowLabel: primary.label,
      planType: primary.planType,
      windows: windows.map((window) => ({
        key: window.key,
        label: window.label,
        usedPercent: window.usedPercent,
        resetAt: window.resetAt,
        remaining: window.remaining,
        limit: window.limit,
        windowLabel: window.windowLabel,
        planType: window.planType,
      })),
    };
  }

  const usedPercent = numberValue(raw.used_percentage) ?? numberValue(raw.usedPercent);
  const resetAt = resetAtSeconds(raw.resets_at ?? raw.resetAt);
  if (usedPercent === undefined && resetAt === undefined) {
    return undefined;
  }
  return {
    usedPercent,
    resetAt,
  };
}

function parseStatusLinePayload(trimmed: string): Record<string, unknown> {
  if (!trimmed) {
    throw new Error("claudeStatusLine: empty payload");
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload must be a JSON object");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`claudeStatusLine: invalid JSON: ${message}`);
  }
}

export function buildClaudeStatusLineUsageLine(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
): string | null {
  const payload = parseStatusLinePayload(rawStdin.trim());
  const sessionId =
    firstString(payload, ["session_id", "sessionId"]) ??
    env.CLAUDE_SESSION_ID?.trim();
  if (!sessionId) {
    return null;
  }

  const rateLimit = buildRateLimit(asRecord(payload.rate_limits));
  if (!rateLimit) {
    return null;
  }

  const snapshot: UsageSnapshot = {
    agent: "claude",
    sessionId,
    source: "statusline-derived",
    updatedAt: Date.now(),
    title:
      firstString(payload, ["title"]) ??
      firstString(asRecord(payload.model) ?? {}, ["display_name", "name"]) ??
      "Claude quota",
    rateLimit,
    meta: {
      statusline_source: "claude",
    },
  };

  return JSON.stringify(snapshot);
}
