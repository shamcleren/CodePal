import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultNotificationSettings } from "../../shared/appSettings";
import { I18nProvider } from "../i18n";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";

describe("NotificationPreferencesPanel", () => {
  it("renders all notification toggles", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <NotificationPreferencesPanel
          settings={defaultNotificationSettings}
          onUpdate={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("通知");
    expect(html).toContain("启用通知");
    expect(html).toContain("播放声音");
    expect(html).toContain("任务完成");
    expect(html).toContain("等待决策");
    expect(html).toContain("任务出错");
    expect(html).toContain("恢复活动");
  });

  it("hides per-state toggles when master switch is off", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <NotificationPreferencesPanel
          settings={{ ...defaultNotificationSettings, enabled: false }}
          onUpdate={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("启用通知");
    expect(html).not.toContain("播放声音");
    expect(html).not.toContain("任务完成");
  });
});
