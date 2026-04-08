import type {
  SessionUsage,
  UsageCompleteness,
  UsageContext,
  UsageCost,
  UsageOverview,
  UsageRateLimit,
  UsageSnapshot,
  UsageTokens,
} from "../../shared/usageTypes";

function mergeTokens(previous: UsageTokens | undefined, next: UsageTokens | undefined): UsageTokens | undefined {
  if (!previous) return next;
  if (!next) return previous;
  return {
    input: next.input ?? previous.input,
    output: next.output ?? previous.output,
    total: next.total ?? previous.total,
    cachedInput: next.cachedInput ?? previous.cachedInput,
    reasoningOutput: next.reasoningOutput ?? previous.reasoningOutput,
  };
}

function mergeContext(
  previous: UsageContext | undefined,
  next: UsageContext | undefined,
): UsageContext | undefined {
  if (!previous) return next;
  if (!next) return previous;
  return {
    used: next.used ?? previous.used,
    max: next.max ?? previous.max,
    percent: next.percent ?? previous.percent,
  };
}

function mergeCost(previous: UsageCost | undefined, next: UsageCost | undefined): UsageCost | undefined {
  if (!previous) return next;
  if (!next) return previous;
  return {
    reported: next.reported ?? previous.reported,
    estimated: next.estimated ?? previous.estimated,
    currency: next.currency ?? previous.currency,
  };
}

function mergeRateLimit(
  previous: UsageRateLimit | undefined,
  next: UsageRateLimit | undefined,
): UsageRateLimit | undefined {
  if (!previous) return next;
  if (!next) return previous;
  return {
    remaining: next.remaining ?? previous.remaining,
    limit: next.limit ?? previous.limit,
    usedPercent: next.usedPercent ?? previous.usedPercent,
    resetAt: next.resetAt ?? previous.resetAt,
    windowLabel: next.windowLabel ?? previous.windowLabel,
    planType: next.planType ?? previous.planType,
    windows: next.windows ?? previous.windows,
  };
}

function completenessOf(session: {
  tokens?: UsageTokens;
  context?: UsageContext;
  cost?: UsageCost;
  rateLimit?: UsageRateLimit;
}): UsageCompleteness {
  const populated = [session.tokens, session.context, session.cost, session.rateLimit].filter(Boolean).length;
  if (populated >= 4) return "full";
  if (populated >= 2) return "partial";
  return "minimal";
}

function sumNumbers(values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => typeof value === "number");
  if (present.length === 0) return undefined;
  return present.reduce((sum, value) => sum + value, 0);
}

function summarizeRateLimits(rows: SessionUsage[]): UsageOverview["summary"]["rateLimits"] {
  const latestByAgentWindow = new Map<
    string,
    {
      agent: string;
      remaining?: number;
      limit?: number;
      usedPercent?: number;
      resetAt?: number;
      windowLabel?: string;
      planType?: string;
      updatedAt: number;
    }
  >();

  for (const row of rows) {
    if (!row.rateLimit) {
      continue;
    }

    const windows =
      row.rateLimit.windows && row.rateLimit.windows.length > 0
        ? row.rateLimit.windows.map((window) => ({
            agent: row.agent,
            remaining: window.remaining,
            limit: window.limit,
            usedPercent: window.usedPercent,
            resetAt: window.resetAt,
            windowLabel: window.label,
            planType: window.planType ?? row.rateLimit?.planType,
            updatedAt: row.updatedAt,
          }))
        : [
            {
              agent: row.agent,
              remaining: row.rateLimit.remaining,
              limit: row.rateLimit.limit,
              usedPercent: row.rateLimit.usedPercent,
              resetAt: row.rateLimit.resetAt,
              windowLabel: row.rateLimit.windowLabel,
              planType: row.rateLimit.planType,
              updatedAt: row.updatedAt,
            },
          ];

    for (const item of windows) {
      const key = `${item.agent}:${item.windowLabel ?? "default"}`;
      const current = latestByAgentWindow.get(key);
      if (!current || item.updatedAt >= current.updatedAt) {
        latestByAgentWindow.set(key, item);
      }
    }
  }

  return [...latestByAgentWindow.values()]
    .sort((a, b) => {
      if (a.agent !== b.agent) {
        return a.agent.localeCompare(b.agent);
      }
      return (a.windowLabel ?? "").localeCompare(b.windowLabel ?? "");
    })
    .map((item) => ({
      agent: item.agent,
      remaining: item.remaining,
      limit: item.limit,
      usedPercent: item.usedPercent,
      resetAt: item.resetAt,
      windowLabel: item.windowLabel,
      planType: item.planType,
    }));
}

export function createUsageStore() {
  const sessions = new Map<string, SessionUsage>();

  function applySnapshot(snapshot: UsageSnapshot) {
    if (!snapshot.sessionId) {
      return;
    }
    const key = `${snapshot.agent}:${snapshot.sessionId}`;
    const previous = sessions.get(key);
    const next: SessionUsage = {
      agent: snapshot.agent,
      sessionId: snapshot.sessionId,
      title: snapshot.title ?? previous?.title,
      updatedAt: Math.max(previous?.updatedAt ?? 0, snapshot.updatedAt),
      sources: Array.from(new Set([...(previous?.sources ?? []), snapshot.source])),
      tokens: mergeTokens(previous?.tokens, snapshot.tokens),
      context: mergeContext(previous?.context, snapshot.context),
      cost: mergeCost(previous?.cost, snapshot.cost),
      rateLimit: mergeRateLimit(previous?.rateLimit, snapshot.rateLimit),
      completeness: "minimal",
    };
    next.completeness = completenessOf(next);
    sessions.set(key, next);
  }

  function getOverview(): UsageOverview {
    const rows = [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    const currency = rows.find((row) => row.cost?.currency)?.cost?.currency;
    const summaryCost =
      currency === undefined || rows.every((row) => row.cost?.currency === undefined || row.cost.currency === currency)
        ? {
            reported: sumNumbers(rows.map((row) => row.cost?.reported)),
            estimated: sumNumbers(rows.map((row) => row.cost?.estimated)),
            ...(currency ? { currency } : {}),
          }
        : undefined;

    const singleContextRow = rows.length === 1 && rows[0]?.context ? rows[0] : undefined;

    return {
      updatedAt: rows[0]?.updatedAt,
      summary: {
        updatedAt: rows[0]?.updatedAt,
        tokens: {
          input: sumNumbers(rows.map((row) => row.tokens?.input)),
          output: sumNumbers(rows.map((row) => row.tokens?.output)),
          total: sumNumbers(rows.map((row) => row.tokens?.total)),
          cachedInput: sumNumbers(rows.map((row) => row.tokens?.cachedInput)),
          reasoningOutput: sumNumbers(rows.map((row) => row.tokens?.reasoningOutput)),
        },
        ...(summaryCost ? { cost: summaryCost } : {}),
        rateLimits: summarizeRateLimits(rows),
        contextMode: singleContextRow ? "single-session" : rows.length > 0 ? "multi-session" : "none",
        ...(singleContextRow?.context ? { context: singleContextRow.context } : {}),
      },
      sessions: rows,
    };
  }

  function removeSession(agent: string, sessionId: string) {
    sessions.delete(`${agent}:${sessionId}`);
  }

  return {
    applySnapshot,
    getOverview,
    removeSession,
  };
}
