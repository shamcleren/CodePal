import type { DailyTokenStats, ModelPricing, ModelTokenStats, SessionStatsEntry } from "../shared/usageTypes";

export type TokenReportInput = {
  rangeLabel: string;
  startDate: string;
  endDate: string;
  sessionStats: SessionStatsEntry[];
  daily: DailyTokenStats[];
  byModel: ModelTokenStats[];
  pricing: ModelPricing[];
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function estimateModelCost(
  stats: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number },
  pricingMap: Map<string, ModelPricing>,
  model?: string,
): number {
  const pricing = (model ? pricingMap.get(model) : null) ?? pricingMap.get("claude-sonnet-4-5-20250929");
  if (!pricing) return 0;
  return (
    (stats.inputTokens / 1_000_000) * Number(pricing.inputPerMillion) +
    (stats.outputTokens / 1_000_000) * Number(pricing.outputPerMillion) +
    (stats.cacheReadTokens / 1_000_000) * Number(pricing.cacheReadPerMillion) +
    (stats.cacheCreationTokens / 1_000_000) * Number(pricing.cacheCreationPerMillion)
  );
}

const AGENT_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  codebuddy: "CodeBuddy",
  cursor: "Cursor",
  goland: "GoLand",
  pycharm: "PyCharm",
};

export function buildTokenReport(input: TokenReportInput): string {
  const lines: string[] = [];
  const pricingMap = new Map<string, ModelPricing>();
  for (const p of input.pricing) {
    pricingMap.set(p.modelId, p);
  }

  lines.push("CodePal Usage Report");
  lines.push(`Period: ${input.startDate} ~ ${input.endDate} (${input.rangeLabel})`);

  // Sessions
  if (input.sessionStats.length > 0) {
    lines.push("");
    lines.push("Sessions");
    const byAgent = new Map<string, Array<{ status: string; count: number }>>();
    for (const s of input.sessionStats) {
      const arr = byAgent.get(s.agent) ?? [];
      arr.push({ status: s.status, count: s.count });
      byAgent.set(s.agent, arr);
    }
    for (const [agent, statuses] of byAgent) {
      const total = statuses.reduce((s, x) => s + x.count, 0);
      const label = AGENT_LABELS[agent] ?? agent;
      const parts = statuses.map((s) => `${s.count} ${s.status}`).join(", ");
      lines.push(`  ${label}: ${total} sessions (${parts})`);
    }
  }

  // Token usage
  const totalInput = input.daily.reduce((s, d) => s + d.inputTokens, 0);
  const totalOutput = input.daily.reduce((s, d) => s + d.outputTokens, 0);
  const totalCacheRead = input.daily.reduce((s, d) => s + d.cacheReadTokens, 0);
  const totalCacheCreation = input.daily.reduce((s, d) => s + d.cacheCreationTokens, 0);
  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheCreation;
  const totalRequests = input.daily.reduce((s, d) => s + d.requestCount, 0);
  const cacheHitRate = totalCacheRead + totalInput > 0
    ? totalCacheRead / (totalCacheRead + totalInput + totalCacheCreation)
    : 0;
  const totalCost = input.byModel.reduce(
    (s, m) => s + estimateModelCost(m, pricingMap, m.model),
    0,
  );

  lines.push("");
  lines.push("Token Usage");
  lines.push(`  Input:        ${formatTokens(totalInput)} tokens`);
  lines.push(`  Output:       ${formatTokens(totalOutput)} tokens`);
  lines.push(`  Cache Read:   ${formatTokens(totalCacheRead)} tokens`);
  lines.push(`  Total:        ${formatTokens(totalTokens)} tokens`);
  lines.push(`  Requests:     ${totalRequests}`);
  lines.push(`  Cache Hit:    ${Math.round(cacheHitRate * 100)}%`);
  lines.push(`  Est. Cost:    ${formatCost(totalCost)}`);

  // Daily breakdown
  if (input.daily.length > 0) {
    lines.push("");
    lines.push("Daily Breakdown");

    const dailyByDate = new Map<string, Map<string, { input: number; output: number; cost: number }>>();
    for (const d of input.daily) {
      const agentMap = dailyByDate.get(d.date) ?? new Map();
      const existing = agentMap.get(d.agent) ?? { input: 0, output: 0, cost: 0 };
      existing.input += d.inputTokens;
      existing.output += d.outputTokens;
      agentMap.set(d.agent, existing);
      dailyByDate.set(d.date, agentMap);
    }

    for (const [date, agentMap] of Array.from(dailyByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      for (const [agent, vals] of agentMap) {
        const label = AGENT_LABELS[agent] ?? agent;
        lines.push(`  ${date}  ${label.padEnd(10)} ${formatTokens(vals.input).padStart(8)} in / ${formatTokens(vals.output).padStart(8)} out`);
      }
    }
  }

  // Top models
  if (input.byModel.length > 0) {
    lines.push("");
    lines.push("Top Models");
    for (const m of input.byModel.slice(0, 10)) {
      const cost = estimateModelCost(m, pricingMap, m.model);
      const label = `${m.agent}/${m.model}`;
      lines.push(
        `  ${label.padEnd(36)} ${String(m.requestCount).padStart(5)} req  ${formatTokens(m.totalTokens).padStart(8)} tokens  ${formatCost(cost).padStart(8)}`,
      );
    }
  }

  return lines.join("\n");
}
