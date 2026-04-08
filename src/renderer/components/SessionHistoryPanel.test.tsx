import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { SessionHistoryPanel } from "./SessionHistoryPanel";

describe("SessionHistoryPanel", () => {
  it("renders a clear-history action for trimming old session rows", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <SessionHistoryPanel loading={false} onClearHistory={vi.fn()} />
      </I18nProvider>,
    );

    expect(html).toContain("Session 历史");
    expect(html).toContain("清空历史 session");
    expect(html).toContain("保留正在运行或等待中的 session");
  });
});
