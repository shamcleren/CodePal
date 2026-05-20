import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UsageOverview } from "../../shared/usageTypes";
import type { UsageDisplaySettings } from "../usageDisplaySettings";
import { I18nProvider } from "../i18n";
import { UsageStatusStrip } from "./UsageStatusStrip";

function formatResetTime(resetAt: number, locale: "en" | "zh-CN"): string {
  return new Date(resetAt * 1000).toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const overview: UsageOverview = {
  updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
  summary: {
    updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
    rateLimits: [
      { agent: "claude", usedPercent: 22, resetAt: 1775200500, windowLabel: "5 小时" },
      { agent: "claude", usedPercent: 61, resetAt: 1775635200, windowLabel: "7 天" },
      { agent: "codex", usedPercent: 32, resetAt: 1775200500, windowLabel: "5 小时" },
      { agent: "codex", usedPercent: 63, resetAt: 1775635200, windowLabel: "7 天" },
      {
        agent: "codebuddy",
        usedPercent: 0.90596,
        remaining: 99094.04,
        limit: 100000,
        resetAt: 1777564800,
        windowLabel: "Code",
        planType: "credits",
      },
      {
        agent: "codebuddy",
        usedPercent: 1.72,
        remaining: 98.28,
        limit: 100,
        windowLabel: "内网",
        planType: "percent",
      },
      {
        agent: "cursor",
        usedPercent: 40,
        remaining: 12000,
        limit: 30000,
        resetAt: 1775635200,
        windowLabel: "总量",
        planType: "usd-cents",
      },
    ],
    contextMode: "multi-session",
  },
  sessions: [
    {
      agent: "claude",
      sessionId: "claude-1",
      updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
      sources: ["session-derived"],
      completeness: "minimal",
      tokens: {
        input: 17392,
        output: 4,
        total: 17396,
      },
    },
  ],
};

const defaultSettings: UsageDisplaySettings = {
  showInStatusBar: true,
  hiddenAgents: [],
  density: "compact",
};

describe("UsageStatusStrip", () => {
  it("renders compact per-agent usage in the status bar", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <UsageStatusStrip overview={overview} settings={defaultSettings} />
      </I18nProvider>,
    );

    expect(html).toContain("usage-strip");
    expect(html).toContain("Claude");
    expect(html).toContain("5h 78%");
    expect(html).toContain("7d 39%");
    expect(html).toContain("Codex");
    expect(html).toContain("5h 68%");
    expect(html).toContain("7d 37%");
    expect(html).toContain("CodeBuddy");
    expect(html).toContain("Code 99%");
    expect(html).toContain("内网 98%");
    expect(html).toContain("Cursor");
    expect(html).toContain("$180 / 300");
    expect(html).toContain("60%");
    expect(html).toContain("cursor-app-icon");
    expect(html).toContain("codex-app-icon");
    expect(html).toContain("codebuddy-app-icon");
    expect(html).toContain("claude-app-icon");
    expect(html).not.toContain("usage-strip__meter");
    expect(html).toContain("usage-strip__value--primary");
  });

  it("renders reset times inline in detailed mode and keeps hover hints", () => {
    const shortReset = formatResetTime(1775200500, "en");
    const longReset = formatResetTime(1775635200, "en");
    const codeReset = formatResetTime(1777564800, "en");
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <UsageStatusStrip
          overview={overview}
          settings={{ showInStatusBar: true, hiddenAgents: [], density: "detailed" }}
        />
      </I18nProvider>,
    );

    expect(html).toContain("usage-strip__value--primary\">5h 68%</span>");
    expect(html).toContain(`usage-strip__value--secondary">${shortReset}</span>`);
    expect(html).toContain("usage-strip__value--primary\">5h 78%</span>");
    expect(html).toContain(`usage-strip__value--secondary">${shortReset}</span>`);
    expect(html).toContain("usage-strip__value--primary\">7d 39%</span>");
    expect(html).toContain(`usage-strip__value--secondary">${longReset}</span>`);
    expect(html).toContain("usage-strip__value--primary\">7d 37%</span>");
    expect(html).toContain(`usage-strip__value--secondary">${longReset}</span>`);
    expect(html).toContain("usage-strip__value--primary\">Code 99%</span>");
    expect(html).toContain("usage-strip__value--primary\">internal 98%</span>");
    expect(html).toContain(`usage-strip__value--secondary">${codeReset}</span>`);
    expect(html).toContain("usage-strip__value--primary\">60%</span>");
    expect(html).toContain(`title="5h reset ${shortReset} | 7d reset ${longReset}"`);
    expect(html).toContain(`title="Code reset ${codeReset} | Code remaining 99% | internal remaining 98%"`);
    expect(html).toContain("usage-strip__value--secondary");
  });

  it("hides agents disabled in settings", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <UsageStatusStrip
          overview={overview}
          settings={{ showInStatusBar: true, hiddenAgents: ["claude", "cursor", "codebuddy"], density: "compact" }}
        />
      </I18nProvider>,
    );

    expect(html).toContain("Codex");
    expect(html).not.toContain("Claude");
    expect(html).not.toContain("Cursor");
    expect(html).not.toContain("CodeBuddy");
  });

  it("renders nothing when the strip is disabled", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <UsageStatusStrip
          overview={overview}
          settings={{ showInStatusBar: false, hiddenAgents: [], density: "compact" }}
        />
      </I18nProvider>,
    );

    expect(html).toBe("");
  });

  it("renders estimated cost when pricing and model data are available", () => {
    const withPricing: UsageOverview = {
      updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
      summary: {
        updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
        rateLimits: [
          { agent: "claude", usedPercent: 22, resetAt: 1775200500, windowLabel: "5h" },
        ],
        contextMode: "single-session",
      },
      sessions: [
        {
          agent: "claude",
          sessionId: "claude-1",
          model: "claude-opus-4-7",
          updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
          sources: ["session-derived"],
          completeness: "partial",
          tokens: { input: 1_000_000, output: 500_000, cachedInput: 100_000 },
        },
      ],
      pricing: [
        {
          modelId: "claude-opus-4-7",
          displayName: "Claude Opus 4.7",
          inputPerMillion: "5",
          outputPerMillion: "25",
          cacheReadPerMillion: "0.50",
          cacheCreationPerMillion: "6.25",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <UsageStatusStrip overview={withPricing} settings={defaultSettings} />
      </I18nProvider>,
    );

    // input: 1M * $5/M = $5, output: 0.5M * $25/M = $12.50, cached: 0.1M * $0.50/M = $0.05 → $17.55
    expect(html).toContain("$17.55");
  });

  it("omits cost segment when no pricing data is provided", () => {
    const noPricing: UsageOverview = {
      updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
      summary: {
        updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
        rateLimits: [
          { agent: "claude", usedPercent: 10, resetAt: 1775200500, windowLabel: "5h" },
        ],
        contextMode: "single-session",
      },
      sessions: [
        {
          agent: "claude",
          sessionId: "claude-1",
          model: "claude-opus-4-7",
          updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
          sources: ["session-derived"],
          completeness: "partial",
          tokens: { input: 1_000_000, output: 500_000 },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <UsageStatusStrip overview={noPricing} settings={defaultSettings} />
      </I18nProvider>,
    );

    expect(html).toContain("Claude");
    expect(html).not.toContain("$");
  });

  it("omits cost segment when sessions have no model field", () => {
    const noModel: UsageOverview = {
      updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
      summary: {
        updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
        rateLimits: [
          { agent: "claude", usedPercent: 10, resetAt: 1775200500, windowLabel: "5h" },
        ],
        contextMode: "single-session",
      },
      sessions: [
        {
          agent: "claude",
          sessionId: "claude-1",
          updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
          sources: ["session-derived"],
          completeness: "partial",
          tokens: { input: 1_000_000, output: 500_000 },
        },
      ],
      pricing: [
        {
          modelId: "claude-opus-4-7",
          displayName: "Claude Opus 4.7",
          inputPerMillion: "5",
          outputPerMillion: "25",
          cacheReadPerMillion: "0.50",
          cacheCreationPerMillion: "6.25",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <UsageStatusStrip overview={noModel} settings={defaultSettings} />
      </I18nProvider>,
    );

    expect(html).toContain("Claude");
    expect(html).not.toContain("$");
  });
});
