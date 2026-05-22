import { describe, expect, it, vi } from "vitest";
import { generateLlmReport } from "./llmReportGenerator";
import type { ReportFacts } from "../../shared/reportFacts";

const EMPTY_FACTS: ReportFacts = {
  granularity: "daily",
  startDate: "2026-05-12",
  endDate: "2026-05-12",
  generatedAt: Date.now(),
  aggregate: {
    inputTokens: 100_000,
    outputTokens: 50_000,
    cacheReadTokens: 200_000,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    totalTokens: 350_000,
    requestCount: 5,
    estimatedUsd: 1.05,
    pricingSource: "model-pricing",
  },
  daily: [
    {
      date: "2026-05-12",
      agent: "claude",
      tokens: {
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheReadTokens: 200_000,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        totalTokens: 350_000,
        requestCount: 5,
      },
      cost: { estimatedUsd: 1.05, pricingSource: "model-pricing" },
      source: "live",
    },
  ],
  byAgent: [
    {
      agent: "claude",
      tokens: {
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheReadTokens: 200_000,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        totalTokens: 350_000,
        requestCount: 5,
      },
      cost: { estimatedUsd: 1.05, pricingSource: "model-pricing" },
    },
  ],
  byModel: [
    {
      model: "claude-sonnet-4-5-20250929",
      agent: "claude",
      tokens: {
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheReadTokens: 200_000,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        totalTokens: 350_000,
        requestCount: 5,
      },
      cost: { estimatedUsd: 1.05, pricingSource: "model-pricing" },
    },
  ],
  sessionStatus: { running: 1, waiting: 0, completed: 2, error: 0, idle: 0, offline: 0, total: 3 },
  topSessions: [
    {
      sessionId: "abc-123",
      title: "Fix auth bug",
      agent: "claude",
      model: "claude-sonnet-4-5-20250929",
      tokens: {
        inputTokens: 50_000,
        outputTokens: 25_000,
        cacheReadTokens: 100_000,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        totalTokens: 175_000,
        requestCount: 3,
      },
      cost: { estimatedUsd: 0.53, pricingSource: "model-pricing" },
      duration: 120_000,
    },
  ],
  operations: [],
  followUps: [],
  coverage: {
    liveSessionCount: 3,
    backfillSessionCount: 0,
    estimatedCostSessionCount: 0,
    complete: true,
    gaps: [],
  },
};

describe("generateLlmReport", () => {
  it("returns ok with report text on successful gateway response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: "## Daily Report\n\nToday was productive." }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateLlmReport({
      facts: EMPTY_FACTS,
      model: "claude-haiku-4-5",
      gatewayBaseUrl: "http://127.0.0.1:9999",
    });

    expect(result.ok).toBe(true);
    expect(result.report).toContain("Daily Report");
    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.estimatedInputTokens).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it("returns error when gateway returns non-200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve("Bad Gateway"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateLlmReport({
      facts: EMPTY_FACTS,
      gatewayBaseUrl: "http://127.0.0.1:9999",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("502");

    vi.unstubAllGlobals();
  });

  it("returns an actionable error when the local gateway cannot be reached", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateLlmReport({
      facts: EMPTY_FACTS,
      gatewayBaseUrl: "http://127.0.0.1:9999",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Provider Gateway is not reachable at http://127.0.0.1:9999");
    expect(result.error).toContain("Settings -> Provider Gateway");

    vi.unstubAllGlobals();
  });

  it("applies redaction to facts before building prompt", async () => {
    let capturedBody: string | undefined;
    const mockFetch = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      capturedBody = init.body;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: "text", text: "OK" }] }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    await generateLlmReport({
      facts: EMPTY_FACTS,
      redaction: { redactSessionTitles: true, redactModelNames: true },
      gatewayBaseUrl: "http://127.0.0.1:9999",
    });

    expect(capturedBody).toBeDefined();
    // Redacted: model names replaced with "model"
    expect(capturedBody).not.toContain("claude-sonnet-4-5-20250929");
    // Redacted: session titles replaced with "Session 1"
    expect(capturedBody).not.toContain("Fix auth bug");
    expect(capturedBody).toContain("Session 1");

    vi.unstubAllGlobals();
  });
});
