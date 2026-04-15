import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n";
import { SessionRow } from "./SessionRow";
import type { MonitorSessionRow } from "../monitorSession";

function baseRow(overrides: Partial<MonitorSessionRow> = {}): MonitorSessionRow {
  return {
    id: "s1",
    tool: "cursor",
    status: "waiting",
    updatedAt: Date.now(),
    titleLabel: "CURSOR · review diff",
    shortId: "s1",
    updatedLabel: "04-02 16:00",
    durationLabel: "0s",
    pendingCount: 0,
    loading: false,
    collapsedSummary: "waiting for approval",
    timelineItems: [],
    activityItems: [],
    hoverSummary: "waiting",
    ...overrides,
  };
}

function renderRow(row: MonitorSessionRow, options?: { expanded?: boolean; showExperimentalControls?: boolean }) {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <SessionRow
        session={row}
        expanded={options?.expanded ?? false}
        deemphasized={false}
        showExperimentalControls={options?.showExperimentalControls}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("SessionRow pending action", () => {
  it("renders option buttons when pendingActions has one item", () => {
    const html = renderRow(
      baseRow({
          pendingActions: [
            {
              id: "a1",
              type: "approval",
              title: "Proceed?",
              options: ["Approve", "Reject"],
            },
          ],
        }),
      { expanded: true, showExperimentalControls: true },
    );
    expect(html).toContain("Proceed?");
    expect(html).toContain("Awaiting decision");
    expect(html).toContain(">Allow<");
    expect(html).toContain(">Deny<");
  });

  it("renders two pending action cards with buttons when pendingActions has two items", () => {
    const html = renderRow(
      baseRow({
          pendingActions: [
            {
              id: "a1",
              type: "approval",
              title: "First decision",
              options: ["OK", "Cancel"],
            },
            {
              id: "a2",
              type: "single_choice",
              title: "Second decision",
              options: ["A", "B"],
            },
          ],
        }),
      { expanded: true, showExperimentalControls: true },
    );
    expect(html).toContain("First decision");
    expect(html).toContain("Second decision");
    expect(html).toContain(">Allow<");
    expect(html).toContain(">Deny<");
    expect(html).toContain(">A<");
    expect(html).toContain(">B<");
    const cards = html.match(/class="pending-action"/g);
    expect(cards).toHaveLength(2);
  });

  it("omits pending action UI when pendingActions is absent", () => {
    const html = renderRow(baseRow());
    expect(html).not.toContain("pending-action__title");
    expect(html).not.toContain("session-row__interaction");
  });

  it("omits pending action UI when pendingActions is empty", () => {
    const html = renderRow(baseRow({ pendingActions: [] }));
    expect(html).not.toContain("pending-action__title");
    expect(html).not.toContain("session-row__interaction");
  });

  it("renders latest and recent activity sections in the expanded details panel", () => {
    const html = renderRow(
      baseRow({
          timelineItems: [
            {
              id: "1",
              kind: "tool",
              source: "tool",
              label: "Bash",
              title: "Bash",
              body: "Tool call: Bash",
              timestamp: 1,
              toolName: "Bash",
              toolPhase: "call",
            },
            {
              id: "2",
              kind: "note",
              source: "system",
              label: "System",
              title: "System",
              body: "Notification (permission_prompt): CodeBuddy needs your permission to use Bash",
              timestamp: 2,
            },
          ],
          hoverSummary: "scan repo",
        }),
      { expanded: true, showExperimentalControls: true },
    );

    expect(html).toContain("session-stream");
    expect(html).not.toContain("session-row__interaction");
    expect(html).toContain("session-stream__artifact-kicker");
    expect(html).toContain("Tool call: Bash");
    expect(html).toContain(
      "Notification (permission_prompt): CodeBuddy needs your permission to use Bash",
    );
    expect(html).toContain("session-stream__item--artifact-group");
    expect(html).toContain("session-stream__artifact-group-summary");
  });

  it("renders the collapsed summary line", () => {
    const html = renderRow(
      baseRow({
          titleLabel: "Codex · review diff",
          tool: "codex",
          collapsedSummary: "最后需要你确认是否继续合并？",
          pendingCount: 2,
          durationLabel: "14m",
          shortId: "9af3",
          updatedLabel: "04-02 16:01",
        }),
    );

    expect(html).toContain("Codex · review diff");
    expect(html).toContain("最后需要你确认是否继续合并？");
    expect(html).toContain("2 pending");
    expect(html).toContain("9af3");
    expect(html).toContain("04-02 16:01");
    expect(html).toContain("14m");
  });

  it("omits the collapsed summary line when it duplicates the title text", () => {
    const html = renderRow(
      baseRow({
          titleLabel: "这轮已经把 expanded 区从旧的 `event-first` 改成了 `message-first`。",
          collapsedSummary: "Completed: 这轮已经把 expanded 区从旧的 `event-first` 改成了 `message-first`。",
        }),
    );

    expect(html).not.toContain("session-row__summary-text");
  });

  it("does not duplicate tool name inside the title line", () => {
    const html = renderRow(
      baseRow({
          tool: "codex",
          titleLabel: "已经重新拉起来了。",
        }),
    );

    expect(html).toContain(">Codex<");
    expect(html).toContain("已经重新拉起来了。");
    expect(html).not.toContain("Codex</span><span class=\"session-row__title\">Codex");
  });

  it("renders pending actions inside the expanded details container", () => {
    const html = renderRow(
      baseRow({
          timelineItems: [
            {
              id: "1",
              kind: "message",
              source: "assistant",
              label: "Agent",
              title: "Agent",
              body: "Proceed when ready.",
              timestamp: 1,
            },
          ],
          pendingActions: [
            {
              id: "a1",
              type: "approval",
              title: "Proceed?",
              options: ["Yes", "No"],
            },
          ],
        }),
      { expanded: true, showExperimentalControls: true },
    );

    expect(html).toContain("session-row__details");
    expect(html).toContain("Proceed?");
  });

  it("renders footer actions for expanded sessions", () => {
    const html = renderRow(
      baseRow({
        timelineItems: [
          {
            id: "1",
            kind: "message",
            source: "assistant",
            label: "Assistant",
            title: "Assistant",
            body: "Proceed when ready.",
            timestamp: 1,
          },
        ],
      }),
      { expanded: true },
    );

    expect(html).toContain("session-row__details-shell");
    expect(html).toContain("session-row__footer");
    expect(html).toContain("Back to latest");
    expect(html).toContain("Copy last 10 messages");
    expect(html).toContain("</div><div class=\"session-row__footer\">");
  });

  it("hides pending action UI in dashboard mode even when pending actions exist", () => {
    const html = renderRow(
      baseRow({
          pendingActions: [
            {
              id: "a1",
              type: "approval",
              title: "Proceed?",
              options: ["Approve", "Reject"],
            },
          ],
        }),
      { expanded: true, showExperimentalControls: false },
    );

    expect(html).not.toContain("Awaiting decision");
    expect(html).not.toContain(">Allow<");
    expect(html).not.toContain("session-row__interaction");
  });

  it("renders inline code and external-style markdown links inside assistant messages", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "改动在 [`src/adapters/codex/normalizeCodexLogEvent.ts`](/Users/demo/codepal/src/adapters/codex/normalizeCodexLogEvent.ts)，并保留 `activityItems.body` 全文。",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__code");
    expect(html).toContain("session-stream__link");
    expect(html).toContain("src/adapters/codex/normalizeCodexLogEvent.ts");
    expect(html).toContain("activityItems.body");
    expect(html).toContain("target=\"_blank\"");
  });

  it("renders fenced code blocks and strong emphasis inside assistant messages", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "md-1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "最新日志末尾是：\n\n```text\n[case1] round 2/12 start at 2026-04-03T10:35:00\n[case1] request 1/10 success in 253.202s\n```\n\n另外，目前日志里还**没有**看到 `connection_refused`。",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__codeblock");
    expect(html).toContain("session-stream__codeblock-copy");
    expect(html).toContain("[case1] round 2/12 start at 2026-04-03T10:35:00");
    expect(html).not.toContain("```text");
    expect(html).not.toContain("```</code>");
    expect(html).toContain("<strong class=\"session-stream__strong\">没有</strong>");
    expect(html).toContain("session-stream__codeblock-content");
    expect(html).toContain("session-stream__codeblock-code language-text");
  });

  it("renders known git directives as lightweight chips under assistant prose", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "git-directive-1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "已提交并推送到 `origin/main`。\n\n::git-stage{cwd=\"/Users/demo/CodePal\"} ::git-commit{cwd=\"/Users/demo/CodePal\"} ::git-push{cwd=\"/Users/demo/CodePal\" branch=\"main\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("已提交并推送到");
    expect(html).toContain("session-stream__directive-chips");
    expect(html).toContain("session-stream__directive-chip");
    expect(html).toContain("Staged");
    expect(html).toContain("Committed");
    expect(html).toContain("Pushed main");
    expect(html).not.toContain("::git-stage");
    expect(html).not.toContain("::git-commit");
    expect(html).not.toContain("::git-push");
  });

  it("renders directive-only assistant messages without an empty prose block", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "git-directive-only",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "::git-stage{cwd=\"/Users/demo/CodePal\"}\n::git-push{cwd=\"/Users/demo/CodePal\" branch=\"main\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__directive-chips");
    expect(html).toContain("Staged");
    expect(html).toContain("Pushed main");
    expect(html).not.toContain("<p></p>");
  });

  it("renders unknown directives as generic fallback chips", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "unknown-directive-1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body: "保留摘要。\n\n::sync_status{state=\"ok\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("保留摘要");
    expect(html).toContain("session-stream__directive-chips");
    expect(html).toContain("sync status");
    expect(html).not.toContain("::sync_status");
  });

  it("renders known non-git directives with explicit labels", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "known-directive-2",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "::git-create-branch{branch=\"codex/directive-ui\"} ::git-create-pr{url=\"https://example.test/pr/1\"} ::code-comment{file=\"/tmp/demo.ts\"} ::archive{reason=\"done\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Created branch codex/directive-ui");
    expect(html).toContain("Created PR");
    expect(html).toContain("Added comment");
    expect(html).toContain("Archived");
  });

  it("renders automation-update directives with mode-aware labels", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "automation-directive-1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "::automation-update{mode=\"suggested create\" name=\"Daily report\"} ::automation-update{mode=\"suggested update\" id=\"123\"} ::automation-update{mode=\"view\" id=\"456\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Suggested automation");
    expect(html).toContain("Suggested automation update");
    expect(html).toContain("View automation");
  });

  it("shows a typing indicator as the last inline message while a running session already has visible content", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          status: "running",
          timelineItems: [
            {
              id: "1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body: "我先看一下当前实现。",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__typing-indicator");
    expect(html).toContain("session-stream__typing-dots");
    expect(html).toContain("Drafting a reply");
    expect(html).not.toContain("session-stream__section--footer");
  });

  it("renders user and agent messages with distinct role classes", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "1",
              kind: "message",
              source: "user",
              label: "User",
              title: "User",
              body: "请继续优化 UI",
              timestamp: 1,
            },
            {
              id: "2",
              kind: "message",
              source: "assistant",
              label: "Agent",
              title: "Agent",
              body: "我先把消息和工具块拆开。",
              timestamp: 2,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__item--message-user");
    expect(html).toContain("session-stream__item--message-agent");
  });

  it("renders a full-context panel with overview, timeline, and interaction slot", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          status: "running",
          collapsedSummary: "最后需要你确认是否继续合并？",
          timelineItems: [
            {
              id: "1",
              kind: "message",
              source: "assistant",
              label: "Agent",
              title: "Agent",
              body: "最后需要你确认是否继续合并？",
              timestamp: 1,
            },
            {
              id: "2",
              kind: "tool",
              source: "tool",
              label: "Bash",
              title: "Bash",
              body: "git diff --stat",
              timestamp: 2,
              toolName: "Bash",
              toolPhase: "call",
            },
            {
              id: "3",
              kind: "note",
              source: "system",
              label: "System",
              title: "System",
              body: "Closed action a1 (consumed_local)",
              timestamp: 3,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream");
    expect(html).not.toContain("session-row__interaction");
    expect(html).toContain("session-row__overview-artifact");
    expect(html).toContain("session-stream__item--artifact-active");
    expect(html).toContain("session-stream__artifact-kicker");
    expect(html).toContain("session-stream__item--artifact-group");
    expect(html).toContain("session-stream__artifact-group-summary");
  });

  it("renders result artifacts with a distinct result-state class", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          status: "completed",
          timelineItems: [
            {
              id: "tool-result-1",
              kind: "tool",
              source: "tool",
              label: "Bash",
              title: "Bash",
              body: "PASS src/main/ipc/ipcHub.test.ts",
              timestamp: 2,
              toolName: "Bash",
              toolPhase: "result",
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__item--artifact-group");
    expect(html).toContain("session-stream__artifact-group-summary-breakdown");
    expect(html).toContain("1 result");
  });

  it("renders tool artifacts with a collapsible body shell when content is long", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          status: "running",
          timelineItems: [
            {
              id: "tool-long-1",
              kind: "tool",
              source: "tool",
              label: "Tool",
              title: "Tool",
              body:
                "renjinming 67781 18.2 0.0 410663008 8576 ?? Ss 10:40AM 0:00.09 /bin/zsh -c snap=$(command cat <&3); builtin unsetopt aliases 2>/dev/null; builtin unalias -m '*' 2>/dev/null || true; builtin eval \"$snap\"",
              timestamp: 2,
              toolName: "Tool",
              toolPhase: "result",
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__item--artifact-group");
    expect(html).toContain("session-stream__artifact-group-summary");
    expect(html).toContain("session-stream__artifact-toggle");
    expect(html).not.toContain("session-stream__plaintext");
  });

  it("renders tool artifacts as plain text instead of markdown blocks", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          status: "completed",
          timelineItems: [
            {
              id: "tool-diff-1",
              kind: "tool",
              source: "tool",
              label: "Tool",
              title: "Tool",
              body: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ /dev/null\n-# Heading",
              timestamp: 2,
              toolName: "Tool",
              toolPhase: "result",
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__artifact-group-summary");
    expect(html).not.toContain("session-stream__plaintext--diff");
    expect(html).not.toContain("session-stream__richtext");
    expect(html).not.toContain("session-stream__strong");
  });

  it("renders json tool artifacts with a dedicated plaintext json class", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          status: "completed",
          timelineItems: [
            {
              id: "tool-json-1",
              kind: "tool",
              source: "tool",
              label: "Tool",
              title: "Tool",
              body: "{\"status\":\"ok\",\"count\":2}",
              timestamp: 2,
              toolName: "Tool",
              toolPhase: "result",
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__artifact-group-summary");
    expect(html).toContain("session-stream__artifact-group-summary-text");
  });

  it("omits a single low-information terminal note when top-level status already covers it", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          status: "completed",
          timelineItems: [
            {
              id: "1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body: "内容已经整理好了。",
              timestamp: 1,
            },
            {
              id: "2",
              kind: "note",
              source: "system",
              label: "Completed",
              title: "Completed",
              body: "Completed",
              timestamp: 2,
              tone: "completed",
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).not.toContain("session-stream__status-rail");
    expect(html).not.toContain("session-stream__section--notes");
    expect(html).not.toContain(">Completed<");
  });

  it("omits low-signal file edit system events from the expanded timeline", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          tool: "cursor",
          timelineItems: [
            {
              id: "1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body: "我已经改好了。",
              timestamp: 1,
            },
            {
              id: "2",
              kind: "system",
              source: "system",
              label: "File Edit",
              title: "File Edit",
              body: "File edited",
              timestamp: 2,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).not.toContain("File edited");
    expect(html).not.toContain("session-stream__section--notes");
  });

  it("does not repeat collapsed title or summary inside the expanded overview", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          titleLabel: "这两个问题已经收掉了。",
          collapsedSummary: "最后需要你确认是否继续合并？",
          timelineItems: [
            {
              id: "1",
              kind: "message",
              source: "assistant",
              label: "Agent",
              title: "Agent",
              body: "最后需要你确认是否继续合并？",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).not.toContain("session-row__overview-summary");
    expect(html).not.toContain("session-row__overview-title");
    expect(html).not.toContain("session-row__overview-rail");
    expect(html).not.toContain("session-row__overview-artifact");
  });

  it("renders tool-specific marker classes for codex, cursor, codebuddy, goland, and pycharm", () => {
    const codexHtml = renderToStaticMarkup(
      <SessionRow
        session={baseRow({ tool: "codex" })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    const cursorHtml = renderToStaticMarkup(
      <SessionRow
        session={baseRow({ tool: "cursor" })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    const codebuddyHtml = renderToStaticMarkup(
      <SessionRow
        session={baseRow({ tool: "codebuddy" })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    const golandHtml = renderToStaticMarkup(
      <SessionRow
        session={baseRow({ tool: "goland" })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    const pycharmHtml = renderToStaticMarkup(
      <SessionRow
        session={baseRow({ tool: "pycharm" })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(codexHtml).toContain("tool-icon--codex");
    expect(cursorHtml).toContain("tool-icon--cursor");
    expect(codebuddyHtml).toContain("tool-icon--codebuddy");
    expect(codebuddyHtml).toContain("codebuddy-app-icon");
    expect(golandHtml).toContain("GoLand");
    expect(golandHtml).toContain("tool-icon--goland");
    expect(golandHtml).toContain("tool-name--goland");
    expect(golandHtml).toContain("jetbrains-app-icon");
    expect(pycharmHtml).toContain("PyCharm");
    expect(pycharmHtml).toContain("tool-icon--pycharm");
    expect(pycharmHtml).toContain("tool-name--pycharm");
    expect(pycharmHtml).toContain("pycharm-app-icon");
  });

  it("renders a loading panel while running with no renderable primary content", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          tool: "codex",
          status: "running",
          loading: false,
          collapsedSummary: "正在读取…",
          timelineItems: [
            {
              id: "1",
              kind: "note",
              source: "system",
              label: "Running",
              title: "Running",
              body: "Working",
              timestamp: 1,
              tone: "running",
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-row__loading");
    expect(html).toContain("session-row__loading-bubble");
    expect(html).toContain("session-row__loading-label");
    expect(html).toContain("session-row__loading-dots");
    expect(html).toContain("Drafting a reply");
    expect(html).not.toContain("Working");
  });
});
