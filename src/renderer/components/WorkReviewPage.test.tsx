import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MonitorSessionRow } from "../monitorSession";
import { I18nProvider } from "../i18n";
import { WorkReviewPage } from "./WorkReviewPage";

function row(overrides: Partial<MonitorSessionRow>): MonitorSessionRow {
  return {
    id: "s",
    tool: "codex",
    status: "completed",
    updatedAt: Date.parse("2026-05-25T09:00:00+08:00"),
    titleLabel: "修复托管 CLI 续写入口",
    shortId: "0001",
    updatedLabel: "05/25 09:00",
    durationLabel: "1h",
    pendingCount: 0,
    loading: false,
    collapsedSummary: "捕获原生 session 并恢复续写入口",
    timelineItems: [],
    activityItems: [],
    hoverSummary: "",
    capabilities: null,
    ...overrides,
  };
}

describe("WorkReviewPage", () => {
  it("renders a calm daily summary with expandable details", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <WorkReviewPage
          sessions={[
            row({
              id: "managed:mt_1",
              isManaged: true,
              managedTaskTitle: "托管 CLI 体验修复",
              updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
              activityItems: [
                {
                  id: "managed-running",
                  kind: "note",
                  source: "system",
                  title: "Running",
                  body: "Running",
                  tone: "running",
                  timestamp: Date.parse("2026-05-25T09:30:00+08:00"),
                },
                {
                  id: "managed-done",
                  kind: "note",
                  source: "system",
                  title: "Completed",
                  body: "Completed",
                  tone: "completed",
                  timestamp: Date.parse("2026-05-25T09:42:00+08:00"),
                },
              ],
            }),
            row({
              id: "running-1",
              status: "running",
              titleLabel: "推进每日工作回顾",
              updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
            }),
            row({
              id: "error-1",
              status: "error",
              titleLabel: "无效错误对话",
              updatedAt: Date.parse("2026-05-25T11:00:00+08:00"),
            }),
          ]}
          historySessions={[
            {
              id: "older-history",
              tool: "claude",
              status: "completed",
              title: "整理 v1.2.0 发布检查",
              task: "整理 v1.2.0 发布检查",
              updatedAt: Date.parse("2026-05-20T18:00:00+08:00"),
              lastUserMessageAt: Date.parse("2026-05-20T17:58:00+08:00"),
            },
          ]}
          tokenTrendPoints={[
            {
              bucketStart: Date.parse("2026-05-20T00:00:00+08:00"),
              agent: "claude",
              model: "claude-sonnet-4-5-20250929",
              inputTokens: 100_000,
              outputTokens: 50_000,
              cacheReadTokens: 20_000,
              cacheCreationTokens: 0,
              reasoningTokens: 0,
              totalTokens: 170_000,
              requestCount: 2,
            },
          ]}
          pricing={[
            {
              modelId: "claude-sonnet-4-5-20250929",
              displayName: "Claude Sonnet 4.5",
              inputPerMillion: "3",
              outputPerMillion: "15",
              cacheReadPerMillion: "0.30",
              cacheCreationPerMillion: "3.75",
            },
          ]}
          usageOverview={{
            summary: { rateLimits: [], contextMode: "multi-session" },
            sessions: [
              {
                agent: "codex",
                sessionId: "managed:mt_1",
                updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
                sources: ["session-derived"],
                completeness: "partial",
                tokens: { total: 1_200 },
                cost: { estimated: 0.02, currency: "USD" },
              },
              {
                agent: "codex",
                sessionId: "running-1",
                updatedAt: Date.parse("2026-05-25T10:00:00+08:00"),
                sources: ["session-derived"],
                completeness: "partial",
                tokens: { total: 1_800 },
                cost: { estimated: 0.03, currency: "USD" },
              },
            ],
          }}
          now={Date.parse("2026-05-25T12:00:00+08:00")}
          onFocusSession={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("工作回顾");
    expect(html).toContain("今天");
    expect(html).toContain("2026/5/25");
    expect(html).toContain("当天摘要");
    expect(html).toContain("完成了什么");
    expect(html).toContain("推进中的事");
    expect(html).not.toContain("遇到的问题");
    expect(html).toContain("托管 CLI 体验修复");
    expect(html).toContain("推进每日工作回顾");
    expect(html).toContain("1 个事项：完成 1；1 个 agent；消耗 170K token，预估花费 US$1.06。");
    expect(html).not.toContain("无效错误对话");
    expect(html).toContain("2 个事项：完成 1、跟进 1；1 个 agent；消耗 3K token，预估花费 US$0.05。");
    expect(html).toContain("最近运行 12 分钟");
    expect(html).toContain("总时长 12 分钟");
    expect(html).not.toContain("<summary");
  });

  it("does not show an in-progress block for historical dates", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <WorkReviewPage
          sessions={[]}
          historySessions={[
            {
              id: "older-history",
              tool: "codex",
              status: "completed",
              title: "整理 v1.2.0 发布检查",
              task: "整理 v1.2.0 发布检查",
              updatedAt: Date.parse("2026-05-20T18:00:00+08:00"),
              lastUserMessageAt: Date.parse("2026-05-20T17:58:00+08:00"),
            },
          ]}
          now={Date.parse("2026-05-25T12:00:00+08:00")}
        />
      </I18nProvider>,
    );

    expect(html).toContain("整理 v1.2.0 发布检查");
    expect(html).toContain("完成了什么");
    expect(html).not.toContain("推进中的事");
    expect(html).not.toContain("<summary");
  });

  it("groups daily review entries by project instead of repeating project labels", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <WorkReviewPage
          sessions={[
            row({
              id: "codepal-session",
              titleLabel: "实现会话分组",
              projectPath: "/repo/CodePal",
              projectName: "CodePal",
            }),
            row({
              id: "gateway-session",
              titleLabel: "校准指标注入",
              projectPath: "/repo/gateway",
              projectName: "gateway",
            }),
          ]}
          now={Date.parse("2026-05-25T12:00:00+08:00")}
        />
      </I18nProvider>,
    );

    expect(html).toContain("work-review__project-group");
    expect(html).toContain("work-review__project-heading");
    expect(html).toContain("work-review__project-toggle");
    expect(html).toContain("work-review__project-drag");
    expect(html).toContain("aria-expanded=\"true\"");
    expect(html).toContain("draggable=\"true\"");
    expect(html).toContain("CodePal");
    expect(html).toContain("实现会话分组");
    expect(html).toContain("gateway");
    expect(html).toContain("校准指标注入");
    expect(html.indexOf("CodePal")).toBeLessThan(html.indexOf("实现会话分组"));
    expect(html.indexOf("gateway")).toBeLessThan(html.indexOf("校准指标注入"));
    expect(html.indexOf("实现会话分组")).toBeLessThan(html.indexOf("gateway"));
  });

  it("marks historical entries as archived instead of offering a live session jump", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <WorkReviewPage
          sessions={[]}
          historySessions={[
            {
              id: "older-history",
              tool: "codex",
              status: "completed",
              title: "旧标题",
              task: "旧标题",
              updatedAt: Date.parse("2026-05-20T18:00:00+08:00"),
              lastUserMessageAt: Date.parse("2026-05-20T17:58:00+08:00"),
              userPrompts: [
                {
                  id: "prompt-1",
                  body: "实现工作回顾历史状态标记",
                  timestamp: Date.parse("2026-05-20T17:00:00+08:00"),
                },
              ],
            },
          ]}
          now={Date.parse("2026-05-25T12:00:00+08:00")}
          onFocusSession={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("实现工作回顾历史状态标记");
    expect(html).toContain("历史记录");
    expect(html).not.toContain("查看会话");
  });

  it("shows only remaining entries in details when the summary preview is capped", () => {
    const sessions = Array.from({ length: 6 }, (_, index) =>
      row({
        id: `done-${index + 1}`,
        titleLabel: `完成条目${index + 1}`,
        updatedAt: Date.parse(`2026-05-25T${String(9 + index).padStart(2, "0")}:00:00+08:00`),
      }),
    );

    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <WorkReviewPage
          sessions={sessions}
          now={Date.parse("2026-05-25T15:00:00+08:00")}
          onFocusSession={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("查看剩余明细");
    expect(html).toContain("完成条目1");
    expect(html).not.toContain("完成条目2");
    expect(html).toContain("展开 2 条");
    expect(html).toContain("完成条目6");
  });
});
