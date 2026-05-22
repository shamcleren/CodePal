import type { ReportFacts } from "../../shared/reportFacts";
import type { ReportRedactionOptions } from "./generateHtmlReport";

export type LlmReportInput = {
  facts: ReportFacts;
  model?: string;
  redaction?: ReportRedactionOptions;
  gatewayBaseUrl?: string;
  gatewayApiKey?: string;
};

export type LlmReportResult = {
  ok: boolean;
  report?: string;
  error?: string;
  model: string;
  estimatedInputTokens: number;
};

/** Strip sensitive fields from facts before sending to LLM */
function applyRedaction(facts: ReportFacts, redaction?: ReportRedactionOptions): ReportFacts {
  if (!redaction) return facts;

  const result = { ...facts };

  if (redaction.redactSessionTitles) {
    result.topSessions = facts.topSessions.map((s, i) => ({
      ...s,
      title: `Session ${i + 1}`,
    }));
  }

  if (redaction.redactModelNames) {
    result.byModel = facts.byModel.map((m) => ({ ...m, model: "model" }));
    result.topSessions = result.topSessions.map((s) => ({ ...s, model: "model" }));
  }

  return result;
}

/** Serialize facts to a compact JSON string for the LLM prompt */
function factsToPrompt(facts: ReportFacts): string {
  const lines: string[] = [
    `Report Period: ${facts.startDate} to ${facts.endDate} (${facts.granularity})`,
    "",
    "## Summary",
    `Total Tokens: ${facts.aggregate.totalTokens}`,
    `Input: ${facts.aggregate.inputTokens} | Output: ${facts.aggregate.outputTokens}`,
    `Cache Read: ${facts.aggregate.cacheReadTokens} | Cache Creation: ${facts.aggregate.cacheCreationTokens}`,
    `Requests: ${facts.aggregate.requestCount}`,
    `Estimated Cost: $${facts.aggregate.estimatedUsd.toFixed(2)}`,
    "",
    "## Sessions",
    `Running: ${facts.sessionStatus.running} | Waiting: ${facts.sessionStatus.waiting} | Completed: ${facts.sessionStatus.completed} | Error: ${facts.sessionStatus.error} | Idle: ${facts.sessionStatus.idle} | Offline: ${facts.sessionStatus.offline}`,
    "",
  ];

  if (facts.byAgent.length > 0) {
    lines.push("## By Agent");
    for (const a of facts.byAgent) {
      lines.push(`- ${a.agent}: ${a.tokens.totalTokens} tokens (${a.tokens.requestCount} requests)`);
    }
    lines.push("");
  }

  if (facts.byModel.length > 0) {
    lines.push("## By Model");
    for (const m of facts.byModel) {
      lines.push(`- ${m.model} (${m.agent}): ${m.tokens.totalTokens} tokens, ~$${m.cost.estimatedUsd.toFixed(2)}`);
    }
    lines.push("");
  }

  if (facts.followUps.length > 0) {
    lines.push("## Follow-up Needed");
    for (const f of facts.followUps) {
      lines.push(`- Session ${f.sessionId.slice(0, 8)}: ${f.reason}`);
    }
    lines.push("");
  }

  if (facts.operations.length > 0) {
    lines.push("## Operations");
    const ok = facts.operations.filter((o) => o.ok).length;
    const failed = facts.operations.filter((o) => !o.ok).length;
    lines.push(`Total: ${facts.operations.length} (${ok} succeeded, ${failed} failed)`);
    for (const op of facts.operations.filter((o) => !o.ok).slice(0, 5)) {
      lines.push(`  - ${op.action} on ${op.sessionId.slice(0, 8)}: ${op.error ?? "failed"}`);
    }
    lines.push("");
  }

  if (facts.topSessions.length > 0) {
    lines.push("## Top Sessions");
    for (const s of facts.topSessions.slice(0, 5)) {
      const title = s.title ?? s.sessionId.slice(0, 8);
      const dur = s.duration ? ` (${Math.round(s.duration / 60_000)}m)` : "";
      lines.push(`- ${title}${dur}: ${s.tokens.totalTokens} tokens, ~$${s.cost.estimatedUsd.toFixed(2)} [${s.agent}/${s.model}]`);
    }
    lines.push("");
  }

  if (facts.daily.length > 0) {
    lines.push("## Daily Trend");
    for (const d of facts.daily) {
      lines.push(`- ${d.date}: ${d.tokens.totalTokens} tokens (${d.tokens.requestCount} reqs)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const REPORT_SYSTEM_PROMPT = `You are a concise technical report writer. Given structured usage facts for a developer's AI coding tool sessions, write a clear daily/weekly/monthly summary report in Markdown.

Rules:
- Focus on actionable insights: what was done, what needs attention, cost trends
- Be concise: no more than 500 words
- Use bullet points for key findings
- Highlight any failed sessions, follow-up items, or cost outliers
- Do NOT invent data that is not in the facts
- Do NOT include any personal opinions or productivity scoring
- Write in the same language as the input (if facts contain Chinese text, write in Chinese; otherwise write in English)`;

/**
 * Generate an LLM-powered report from Report Facts.
 * Calls the local Provider Gateway which handles model mapping and auth.
 */
export async function generateLlmReport(input: LlmReportInput): Promise<LlmReportResult> {
  const gatewayUrl = input.gatewayBaseUrl ?? "http://127.0.0.1:15721";
  const model = input.model ?? "claude-haiku-4-5";

  // Apply redaction before building the prompt
  const sanitizedFacts = applyRedaction(input.facts, input.redaction);
  const userPrompt = factsToPrompt(sanitizedFacts);
  const estimatedInputTokens = Math.ceil(userPrompt.length / 4) + 500; // rough estimate

  try {
    const response = await fetch(`${gatewayUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(input.gatewayApiKey ? { "x-api-key": input.gatewayApiKey } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: REPORT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      return {
        ok: false,
        error: `Gateway returned ${response.status}: ${errorText}`,
        model,
        estimatedInputTokens,
      };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");

    if (!text) {
      return {
        ok: false,
        error: "No text content in LLM response",
        model,
        estimatedInputTokens,
      };
    }

    return {
      ok: true,
      report: text,
      model,
      estimatedInputTokens,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Provider Gateway is not reachable at ${gatewayUrl}. Open Settings -> Provider Gateway and make sure the local gateway is listening. Details: ${message}`,
      model,
      estimatedInputTokens,
    };
  }
}
