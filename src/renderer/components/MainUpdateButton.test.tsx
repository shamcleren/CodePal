import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppUpdateState } from "../../shared/updateTypes";
import { I18nProvider } from "../i18n";
import { MainUpdateButton } from "./MainUpdateButton";

function createState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    supported: true,
    phase: "idle",
    currentVersion: "1.0.2",
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

function renderButton(state: AppUpdateState | null) {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <MainUpdateButton
        state={state}
        busy={false}
        onOpenMaintenance={vi.fn()}
        onInstall={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("MainUpdateButton", () => {
  it("stays hidden for idle, checking, skipped, unsupported, and null states", () => {
    expect(renderButton(null)).toBe("");
    expect(renderButton(createState())).toBe("");
    expect(renderButton(createState({ phase: "checking" }))).toBe("");
    expect(renderButton(createState({ phase: "skipped", availableVersion: "1.0.3" }))).toBe("");
    expect(renderButton(createState({ supported: false }))).toBe("");
  });

  it("shows an available update with the version", () => {
    const html = renderButton(createState({ phase: "available", availableVersion: "1.0.3" }));

    expect(html).toContain("Update 1.0.3");
    expect(html).toContain("app-update-button");
  });

  it("shows download progress when available", () => {
    const html = renderButton(
      createState({
        phase: "downloading",
        availableVersion: "1.0.3",
        downloadPercent: 42,
      }),
    );

    expect(html).toContain("Downloading 42%");
  });

  it("shows install and error labels", () => {
    expect(
      renderButton(createState({ phase: "downloaded", availableVersion: "1.0.3" })),
    ).toContain("Install update");
    expect(renderButton(createState({ phase: "error", errorMessage: "network" }))).toContain(
      "Update failed",
    );
  });
});
