import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppUpdateState } from "../../shared/updateTypes";
import { I18nProvider } from "../i18n";
import { UpdatePanel } from "./UpdatePanel";

function createState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    supported: true,
    phase: "idle",
    currentVersion: "1.0.0",
    availableVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseDate: null,
    skippedVersion: null,
    downloadPercent: null,
    errorMessage: null,
    lastCheckedAt: null,
    ...overrides,
  };
}

describe("UpdatePanel", () => {
  it("renders available update actions and release notes", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <UpdatePanel
          state={createState({
            phase: "available",
            availableVersion: "1.0.1",
            releaseNotes: "Bug fixes",
          })}
          busy={false}
          onCheck={vi.fn()}
          onDownload={vi.fn()}
          onInstall={vi.fn()}
          onSkip={vi.fn()}
          onClearSkipped={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("App Updates");
    expect(html).toContain("update-panel__status");
    expect(html).toContain("Update 1.0.1 is available");
    expect(html).toContain("Download Update");
    expect(html).toContain("Skip This Version");
    expect(html).toContain("Bug fixes");
    expect(html).toContain("update-panel__notes");
  });

  it("renders downloaded install state in Chinese", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="zh-CN">
        <UpdatePanel
          state={createState({
            phase: "downloaded",
            availableVersion: "1.0.2",
          })}
          busy={false}
          onCheck={vi.fn()}
          onDownload={vi.fn()}
          onInstall={vi.fn()}
          onSkip={vi.fn()}
          onClearSkipped={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("应用更新");
    expect(html).toContain("已准备安装 1.0.2");
    expect(html).toContain("重启安装");
  });

  it("keeps the check button clickable when updates are unsupported", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <UpdatePanel
          state={createState({
            supported: false,
            phase: "idle",
          })}
          busy={false}
          onCheck={vi.fn()}
          onDownload={vi.fn()}
          onInstall={vi.fn()}
          onSkip={vi.fn()}
          onClearSkipped={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain(">Check for Updates<");
    expect(html).not.toContain("disabled");
  });
});
