import type {
  AgentTokenStats,
  DailyTokenStats,
  ModelPricing,
  ModelTokenStats,
  SessionStatsEntry,
  SessionTokenStats,
  UsageImportStatus,
} from "../../shared/usageTypes";

export type HtmlReportInput = {
  startDate: string;
  endDate: string;
  sessionStats: SessionStatsEntry[];
  daily: DailyTokenStats[];
  byModel: ModelTokenStats[];
  byAgent?: AgentTokenStats[];
  topSessions?: SessionTokenStats[];
  importStatus?: UsageImportStatus;
  pricing: ModelPricing[];
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function shortSessionId(sessionId: string): string {
  return sessionId.length > 18 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}` : sessionId;
}

function statusLabel(status: string): string {
  return status === "unknown" ? "usage-only" : status;
}

function estimateCost(
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

export function generateHtmlReport(input: HtmlReportInput): string {
  const pricingMap = new Map<string, ModelPricing>();
  for (const p of input.pricing) {
    pricingMap.set(p.modelId, p);
  }

  const totalInput = input.daily.reduce((s, d) => s + d.inputTokens, 0);
  const totalOutput = input.daily.reduce((s, d) => s + d.outputTokens, 0);
  const totalCacheRead = input.daily.reduce((s, d) => s + d.cacheReadTokens, 0);
  const totalCacheCreation = input.daily.reduce((s, d) => s + d.cacheCreationTokens, 0);
  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheCreation;
  const totalRequests = input.daily.reduce((s, d) => s + d.requestCount, 0);
  const cacheHitRate = totalCacheRead + totalInput > 0
    ? totalCacheRead / (totalCacheRead + totalInput + totalCacheCreation) : 0;
  const totalCost = input.byModel.reduce((s, m) => s + estimateCost(m, pricingMap, m.model), 0);

  // Session stats
  const byAgent = new Map<string, Array<{ status: string; count: number }>>();
  for (const s of input.sessionStats) {
    const arr = byAgent.get(s.agent) ?? [];
    arr.push({ status: s.status, count: s.count });
    byAgent.set(s.agent, arr);
  }
  let sessionRows = "";
  for (const [agent, statuses] of byAgent) {
    const total = statuses.reduce((s, x) => s + x.count, 0);
    const label = AGENT_LABELS[agent] ?? agent;
    const parts = statuses.map((s) => `${s.count} ${statusLabel(s.status)}`).join(", ");
    sessionRows += `<tr><td>${esc(label)}</td><td class="num">${total}</td><td>${esc(parts)}</td></tr>\n`;
  }

  // Daily chart
  const dailyByDate = new Map<string, { input: number; output: number; cache: number }>();
  for (const d of input.daily) {
    const existing = dailyByDate.get(d.date) ?? { input: 0, output: 0, cache: 0 };
    existing.input += d.inputTokens;
    existing.output += d.outputTokens;
    existing.cache += d.cacheReadTokens + d.cacheCreationTokens;
    dailyByDate.set(d.date, existing);
  }
  const dailyEntries = Array.from(dailyByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDaily = Math.max(1, ...dailyEntries.map(([, v]) => v.input + v.output + v.cache));

  let chartBars = "";
  for (const [date, vals] of dailyEntries) {
    const total = vals.input + vals.output + vals.cache;
    const pct = (total / maxDaily) * 100;
    const inputPct = total > 0 ? (vals.input / total) * pct : 0;
    const outputPct = total > 0 ? (vals.output / total) * pct : 0;
    chartBars += `<div class="bar-col" title="${esc(date)}\nInput: ${fmtTokens(vals.input)}\nOutput: ${fmtTokens(vals.output)}\nCache: ${fmtTokens(vals.cache)}\nTotal: ${fmtTokens(total)}">
      <div class="bar-value">${fmtTokens(total)}</div>
      <div class="bar-stack" style="height:${Math.max(2, pct)}%">
        <div class="bar-seg bar-input" style="height:${inputPct / Math.max(2, pct) * 100}%"></div>
        <div class="bar-seg bar-output" style="height:${outputPct / Math.max(2, pct) * 100}%"></div>
        <div class="bar-seg bar-cache" style="flex:1"></div>
      </div>
      <div class="bar-label">${esc(date.slice(5))}</div>
    </div>\n`;
  }

  // Model table
  let modelRows = "";
  for (const m of input.byModel) {
    const cost = estimateCost(m, pricingMap, m.model);
    const modelTotal = m.inputTokens + m.cacheReadTokens + m.cacheCreationTokens;
    const modelCacheRate = modelTotal > 0 ? m.cacheReadTokens / modelTotal : 0;
    modelRows += `<tr>
      <td><span class="agent-tag">${esc(m.agent)}</span>${esc(m.model)}</td>
      <td class="num">${m.requestCount}</td>
      <td class="num">${fmtTokens(m.inputTokens)}</td>
      <td class="num">${fmtTokens(m.outputTokens)}</td>
      <td class="num">${modelCacheRate > 0 ? Math.round(modelCacheRate * 100) + "%" : "&mdash;"}</td>
      <td class="num">${fmtTokens(m.cacheReadTokens)}</td>
      <td class="num">${fmtCost(cost)}</td>
    </tr>\n`;
  }

  let agentRows = "";
  for (const agent of input.byAgent ?? []) {
    const totalInputLike = agent.inputTokens + agent.cacheReadTokens + agent.cacheCreationTokens;
    const cacheRate = totalInputLike > 0 ? agent.cacheReadTokens / totalInputLike : 0;
    agentRows += `<tr>
      <td>${esc(AGENT_LABELS[agent.agent] ?? agent.agent)}</td>
      <td class="num">${agent.requestCount}</td>
      <td class="num">${fmtTokens(agent.totalTokens)}</td>
      <td class="num">${fmtTokens(agent.inputTokens)}</td>
      <td class="num">${fmtTokens(agent.outputTokens)}</td>
      <td class="num">${cacheRate > 0 ? Math.round(cacheRate * 100) + "%" : "&mdash;"}</td>
    </tr>\n`;
  }

  let topSessionRows = "";
  for (const session of input.topSessions ?? []) {
    const sessionTitle = session.title?.trim() || session.sessionId;
    const secondaryId = session.title?.trim() ? shortSessionId(session.sessionId) : "";
    topSessionRows += `<tr>
      <td>
        <div class="session-title">${esc(sessionTitle)}</div>
        ${secondaryId ? `<div class="session-id">${esc(secondaryId)}</div>` : ""}
      </td>
      <td>${esc(AGENT_LABELS[session.agent] ?? session.agent)}</td>
      <td>${esc(session.model)}</td>
      <td class="num">${session.requestCount}</td>
      <td class="num">${fmtTokens(session.totalTokens)}</td>
      <td class="num">${fmtDateTime(session.lastSeenAt)}</td>
    </tr>\n`;
  }

  const importStatus = input.importStatus;
  const importSummary = importStatus
    ? `Backfill: ${
        importStatus.completedAt ? fmtDateTime(importStatus.completedAt) : "not completed"
      } · Claude rows: ${importStatus.claudeRowsImported} · Codex rows: ${importStatus.codexRowsImported}${
        importStatus.lastError ? ` · Error: ${esc(importStatus.lastError)}` : ""
      }`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CodePal Usage Report — ${esc(input.startDate)} ~ ${esc(input.endDate)}</title>
<style>
  :root {
    --bg: #0a0f15; --bg2: #121925; --bg3: #182130;
    --border: #283243; --text: #edf4ff; --muted: #8b98ad;
    --accent: #79a8ff; --green: #3fe0c2; --radius: 10px;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 14px; line-height: 1.5; color: var(--text);
    background: linear-gradient(180deg, #091018, #0d141c 40%, #101823);
    min-height: 100vh; padding: 40px 20px;
  }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
  .subtitle { color: var(--muted); font-size: 14px; margin: 0 0 32px; }
  h2 {
    font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--muted); margin: 32px 0 12px;
  }

  /* Hero grid */
  .hero-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 12px; margin-bottom: 32px;
  }
  .hero-card {
    padding: 16px 18px; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--bg2);
  }
  .hero-card .label { font-size: 11px; font-weight: 500; color: var(--muted); margin-bottom: 6px; }
  .hero-card .value { font-size: 22px; font-weight: 700; }

  /* Chart */
  .chart-wrap {
    padding: 16px; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--bg2); margin-bottom: 8px;
  }
  .chart {
    display: flex; align-items: flex-end; gap: 4px; height: 140px;
  }
  .bar-col {
    flex: 1; min-width: 12px; display: flex; flex-direction: column;
    justify-content: flex-end; align-items: center; height: 100%; gap: 2px;
  }
  .bar-value {
    font-size: 9px; font-weight: 600; color: var(--muted); white-space: nowrap;
    opacity: 0; transition: opacity 0.15s;
  }
  .bar-col:hover .bar-value { opacity: 1; }
  .bar-stack {
    width: 100%; max-width: 28px; display: flex; flex-direction: column;
    justify-content: flex-end; border-radius: 3px 3px 0 0; overflow: hidden;
  }
  .bar-seg { width: 100%; min-height: 1px; }
  .bar-input { background: var(--accent); opacity: 0.8; }
  .bar-output { background: var(--green); opacity: 0.75; }
  .bar-cache { background: rgba(121,168,255,0.3); opacity: 0.5; }
  .bar-col:hover .bar-input, .bar-col:hover .bar-output, .bar-col:hover .bar-cache { opacity: 1; }
  .bar-label {
    font-size: 10px; text-align: center; color: var(--muted);
    margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .chart-legend {
    display: flex; gap: 16px; justify-content: center; font-size: 11px; color: var(--muted);
    margin-bottom: 32px;
  }
  .legend-item { display: flex; align-items: center; gap: 5px; }
  .legend-dot {
    width: 8px; height: 8px; border-radius: 2px; display: inline-block;
  }
  .legend-dot--input { background: var(--accent); opacity: 0.8; }
  .legend-dot--output { background: var(--green); opacity: 0.75; }
  .legend-dot--cache { background: rgba(121,168,255,0.3); opacity: 0.5; }

  /* Tables */
  table {
    width: 100%; border-collapse: collapse; font-size: 13px;
    border-radius: var(--radius); overflow: hidden;
    border: 1px solid var(--border); background: var(--bg2);
    table-layout: fixed;
  }
  thead { background: rgba(255,255,255,0.03); }
  th {
    text-align: left; padding: 10px 14px; font-weight: 600; font-size: 11px;
    color: var(--muted); letter-spacing: 0.03em; border-bottom: 1px solid var(--border);
  }
  td { padding: 10px 14px; border-bottom: 1px solid rgba(40,50,67,0.5); }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: rgba(255,255,255,0.02); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  th.num { text-align: right; }
  .agent-tag { opacity: 0.5; margin-right: 6px; font-size: 11px; }
  .session-title { font-weight: 600; overflow-wrap: anywhere; }
  .session-id { margin-top: 3px; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }

  .footer { margin-top: 48px; color: var(--muted); font-size: 11px; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <h1>CodePal Usage Report</h1>
  <p class="subtitle">${esc(input.startDate)} ~ ${esc(input.endDate)}</p>

  ${sessionRows ? `<h2>Sessions</h2>
  <table><thead><tr><th>Agent</th><th class="num">Total</th><th>Breakdown</th></tr></thead>
  <tbody>${sessionRows}</tbody></table>` : ""}

  <h2>Token Usage</h2>
  <div class="hero-grid">
    <div class="hero-card"><div class="label">Total Tokens</div><div class="value">${fmtTokens(totalTokens)}</div></div>
    <div class="hero-card"><div class="label">Requests</div><div class="value">${totalRequests}</div></div>
    <div class="hero-card"><div class="label">Input</div><div class="value">${fmtTokens(totalInput)}</div></div>
    <div class="hero-card"><div class="label">Output</div><div class="value">${fmtTokens(totalOutput)}</div></div>
    <div class="hero-card"><div class="label">Cache Read</div><div class="value">${fmtTokens(totalCacheRead)}</div></div>
    <div class="hero-card"><div class="label">Cache Hit Rate</div><div class="value">${Math.round(cacheHitRate * 100)}%</div></div>
    <div class="hero-card"><div class="label">Estimated Cost</div><div class="value">${fmtCost(totalCost)}</div></div>
  </div>

  ${dailyEntries.length > 0 ? `<h2>Daily Trend</h2>
  <div class="chart-wrap"><div class="chart">${chartBars}</div></div>
  <div class="chart-legend">
    <span class="legend-item"><span class="legend-dot legend-dot--input"></span>Input</span>
    <span class="legend-item"><span class="legend-dot legend-dot--output"></span>Output</span>
    <span class="legend-item"><span class="legend-dot legend-dot--cache"></span>Cache</span>
  </div>` : ""}

  ${input.byModel.length > 0 ? `<h2>By Model</h2>
  <table><thead><tr>
    <th>Model</th><th class="num">Requests</th><th class="num">Input</th>
    <th class="num">Output</th><th class="num">Cache Hit</th><th class="num">Cache Read</th><th class="num">Cost</th>
  </tr></thead><tbody>${modelRows}</tbody></table>` : ""}

  ${agentRows ? `<h2>By Agent</h2>
  <table><thead><tr>
    <th>Agent</th><th class="num">Requests</th><th class="num">Total</th>
    <th class="num">Input</th><th class="num">Output</th><th class="num">Cache Hit</th>
  </tr></thead><tbody>${agentRows}</tbody></table>` : ""}

  ${topSessionRows ? `<h2>Top Sessions</h2>
  <table><thead><tr>
    <th>Session</th><th>Agent</th><th>Model</th><th class="num">Requests</th>
    <th class="num">Tokens</th><th class="num">Last Seen</th>
  </tr></thead><tbody>${topSessionRows}</tbody></table>` : ""}

  ${importSummary ? `<p class="footer">${importSummary}</p>` : ""}

  <div class="footer">Generated by CodePal · ${new Date().toISOString().slice(0, 19).replace("T", " ")}</div>
</div>
</body>
</html>`;
}
