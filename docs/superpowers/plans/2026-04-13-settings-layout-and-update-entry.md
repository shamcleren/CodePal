# Settings Layout And Update Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conditional main-panel update button and rebalance settings pages around compact status-first cards.

**Architecture:** Keep update state owned by the existing app-level renderer state. Add a small renderer-only update button helper/component, then reuse the existing update handlers from `App.tsx`. Settings density changes stay in renderer components, i18n copy, and CSS; no main-process update behavior changes are planned.

**Tech Stack:** Electron, React 19, TypeScript, Vitest static-render tests, CSS modules in `src/renderer/styles.css`.

---

## File Structure

- Modify `src/renderer/App.tsx`: render the main update button, navigate to Maintenance when appropriate, remove long settings nav descriptions from visible nav rows, and pass compact content through existing panels.
- Create `src/renderer/components/MainUpdateButton.tsx`: isolate update button visibility, labels, and click behavior.
- Create `src/renderer/components/MainUpdateButton.test.tsx`: unit-test hidden and visible update states with static rendering.
- Modify `src/renderer/components/DisplayPreferencesPanel.tsx`: group controls into compact cards.
- Modify `src/renderer/components/IntegrationPanel.tsx`: keep status first, move detailed healthy/attention diagnostics behind `<details>` when possible, and reduce default explanatory text.
- Modify `src/renderer/components/UpdatePanel.tsx`: keep the detailed update panel but trim duplicated subtitle density.
- Modify `src/renderer/i18n.tsx`: add short nav labels/status strings and main update button strings in English and Simplified Chinese.
- Modify `src/renderer/styles.css`: add main update button styles, compact settings card styles, and navigation density styles.
- Modify `src/renderer/App.test.tsx`: assert the settings shell no longer renders repeated nav descriptions by default and still exposes settings sections.
- Modify `src/renderer/styles.test.ts`: assert new layout classes exist and old scroll constraints remain.

---

### Task 1: Main Update Button Component

**Files:**
- Create: `src/renderer/components/MainUpdateButton.tsx`
- Create: `src/renderer/components/MainUpdateButton.test.tsx`
- Modify: `src/renderer/i18n.tsx`

- [ ] **Step 1: Write the failing component tests**

Add `src/renderer/components/MainUpdateButton.test.tsx`:

```tsx
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
    expect(renderButton(createState({ phase: "downloaded", availableVersion: "1.0.3" }))).toContain(
      "Install update",
    );
    expect(renderButton(createState({ phase: "error", errorMessage: "network" }))).toContain(
      "Update failed",
    );
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- src/renderer/components/MainUpdateButton.test.tsx
```

Expected: FAIL because `MainUpdateButton` does not exist.

- [ ] **Step 3: Add i18n strings**

Add these keys to both `ZH_CN_MESSAGES` and `EN_MESSAGES` in `src/renderer/i18n.tsx`:

```ts
"update.main.available": "Update {version}",
"update.main.downloading": "Downloading {percent}",
"update.main.downloadingNoPercent": "Downloading update",
"update.main.downloaded": "Install update",
"update.main.error": "Update failed",
```

Chinese equivalents:

```ts
"update.main.available": "更新 {version}",
"update.main.downloading": "下载中 {percent}",
"update.main.downloadingNoPercent": "下载更新中",
"update.main.downloaded": "安装更新",
"update.main.error": "更新失败",
```

- [ ] **Step 4: Implement the component**

Create `src/renderer/components/MainUpdateButton.tsx`:

```tsx
import type { AppUpdateState } from "../../shared/updateTypes";
import { useI18n } from "../i18n";

type MainUpdateButtonProps = {
  state: AppUpdateState | null;
  busy: boolean;
  onOpenMaintenance: () => void;
  onInstall: () => void;
};

function formatPercent(value: number | null): string | null {
  return value == null ? null : `${Math.round(value)}%`;
}

export function MainUpdateButton({
  state,
  busy,
  onOpenMaintenance,
  onInstall,
}: MainUpdateButtonProps) {
  const { t } = useI18n();

  if (!state?.supported) {
    return null;
  }

  let label: string | null = null;
  let tone = "neutral";
  let onClick = onOpenMaintenance;

  if (state.phase === "available" && state.availableVersion) {
    label = t("update.main.available", { version: state.availableVersion });
  } else if (state.phase === "downloading") {
    const percent = formatPercent(state.downloadPercent);
    label = percent
      ? t("update.main.downloading", { percent })
      : t("update.main.downloadingNoPercent");
  } else if (state.phase === "downloaded") {
    label = t("update.main.downloaded");
    onClick = onInstall;
  } else if (state.phase === "error") {
    label = t("update.main.error");
    tone = "error";
  }

  if (!label) {
    return null;
  }

  return (
    <button
      type="button"
      className={`app-update-button app-update-button--${tone}`}
      disabled={busy && state.phase !== "error"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 5: Run the component test and verify it passes**

Run:

```bash
npm test -- src/renderer/components/MainUpdateButton.test.tsx
```

Expected: PASS.

---

### Task 2: Wire Main Update Button Into App

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles.test.ts`

- [ ] **Step 1: Write the failing app/static style assertions**

In `src/renderer/App.test.tsx`, update the shell test to expect the new class name and keep settings available:

```tsx
expect(html).toContain("app-header__actions");
expect(html).toContain("aria-label=\"Open settings\"");
expect(html).toContain("settings-nav");
```

In `src/renderer/styles.test.ts`, add:

```ts
expect(css).toMatch(/\.app-header__actions\s*\{/);
expect(css).toMatch(/\.app-update-button\s*\{/);
expect(css).toMatch(/\.app-update-button--error\s*\{/);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- src/renderer/App.test.tsx src/renderer/styles.test.ts
```

Expected: FAIL because `app-header__actions` and update button styles do not exist.

- [ ] **Step 3: Wire the button into `App.tsx`**

Import the component:

```tsx
import { MainUpdateButton } from "./components/MainUpdateButton";
```

Add helper functions near `openSettingsDrawer`:

```tsx
function openSettingsSection(section: SettingsSectionId) {
  setActiveSettingsSection(section);
  setSettingsOpen(true);
  refreshIntegrations();
}

function openSettingsDrawer() {
  openSettingsSection("integrations");
}

function openMaintenanceSettings() {
  openSettingsSection("maintenance");
}
```

Replace the single settings button in the app header with:

```tsx
<div className="app-header__actions">
  <MainUpdateButton
    state={updateState}
    busy={updateBusy}
    onOpenMaintenance={openMaintenanceSettings}
    onInstall={() => {
      void runUpdateAction(() => window.codepal.installUpdate());
    }}
  />
  <button
    type="button"
    className="app-settings-trigger"
    aria-label={i18n.t("app.openSettings")}
    onClick={openSettingsDrawer}
  >
    {i18n.t("app.settings")}
  </button>
</div>
```

- [ ] **Step 4: Add header/update styles**

Add to `src/renderer/styles.css` near app header styles:

```css
.app-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.app-update-button {
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--running) 42%, var(--border));
  background: color-mix(in srgb, var(--running) 14%, var(--bg-elevated));
  color: var(--text);
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.app-update-button:hover {
  border-color: color-mix(in srgb, var(--running) 68%, var(--border));
  background: color-mix(in srgb, var(--running) 20%, var(--bg-elevated));
}

.app-update-button:disabled {
  opacity: 0.64;
  cursor: not-allowed;
}

.app-update-button--error {
  border-color: color-mix(in srgb, var(--error) 52%, var(--border));
  background: color-mix(in srgb, var(--error) 16%, var(--bg-elevated));
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/renderer/components/MainUpdateButton.test.tsx src/renderer/App.test.tsx src/renderer/styles.test.ts
```

Expected: PASS.

---

### Task 3: Compact Settings Navigation And Section Shell

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Update app test expectations**

In `src/renderer/App.test.tsx`, remove assertions that expect visible long section descriptions, such as:

```tsx
expect(html).toContain("Integrations &amp; Diagnostics");
expect(html).toContain("Usage &amp; Sign-ins");
expect(html).toContain("Maintenance &amp; History");
expect(html).toContain("Support &amp; Diagnostics");
```

Add assertions that visible navigation no longer repeats the old long copy:

```tsx
expect(html).toContain("Integrations");
expect(html).toContain("Panel Display");
expect(html).not.toContain("Handle listener state, hook repairs, and login issues in one place.");
expect(html).not.toContain("Keep Claude, Cursor, and CodeBuddy sign-ins plus quota sync together.");
```

- [ ] **Step 2: Run app test and verify failure if old copy is still visible**

Run:

```bash
npm test -- src/renderer/App.test.tsx
```

Expected: FAIL until the visible nav/section descriptions are removed.

- [ ] **Step 3: Change `SettingsSection` copy contract**

In `src/renderer/App.tsx`, replace `description` with `summary`:

```ts
type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  eyebrow: string;
  summary: string;
};
```

Use new i18n keys in `settingsSections`:

```tsx
summary: i18n.t("settings.summary.integrations"),
summary: i18n.t("settings.summary.display"),
summary: i18n.t("settings.summary.usage"),
summary: i18n.t("settings.summary.maintenance"),
summary: i18n.t("settings.summary.support"),
```

Remove this visible nav span:

```tsx
<span className="settings-nav__description">{section.description}</span>
```

Change section subtitle to:

```tsx
<p className="settings-section-shell__subtitle">
  {activeSettingsSectionConfig.summary}
</p>
```

- [ ] **Step 4: Add short summary i18n keys**

Add English:

```ts
"settings.summary.integrations": "Listener, hooks, and repair status.",
"settings.summary.display": "Panel controls, visible agents, density, and language.",
"settings.summary.usage": "Quota connections and refresh state.",
"settings.summary.maintenance": "Updates, local config, and history cleanup.",
"settings.summary.support": "Diagnostics and support links.",
```

Add Chinese:

```ts
"settings.summary.integrations": "监听、hooks 与修复状态。",
"settings.summary.display": "面板、agent、密度与语言。",
"settings.summary.usage": "额度连接与刷新状态。",
"settings.summary.maintenance": "更新、本地配置与历史清理。",
"settings.summary.support": "诊断信息与支持入口。",
```

- [ ] **Step 5: Tighten nav CSS**

In `src/renderer/styles.css`, reduce nav width and item density:

```css
.app-settings-drawer__content {
  grid-template-columns: 170px minmax(0, 1fr);
}

.settings-nav__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 11px;
  border-radius: 8px;
}
```

Remove the visible `.settings-nav__description` dependency or leave the class unused only if existing tests require it. Prefer removing unused CSS after `rg "settings-nav__description"` returns no source references.

- [ ] **Step 6: Run app and style tests**

Run:

```bash
npm test -- src/renderer/App.test.tsx src/renderer/styles.test.ts
```

Expected: PASS.

---

### Task 4: Compact Display And Integration Panels

**Files:**
- Modify: `src/renderer/components/DisplayPreferencesPanel.tsx`
- Modify: `src/renderer/components/DisplayPreferencesPanel.test.tsx`
- Modify: `src/renderer/components/IntegrationPanel.tsx`
- Modify: `src/renderer/components/IntegrationPanel.test.tsx`
- Modify: `src/renderer/i18n.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Update display panel tests**

In `src/renderer/components/DisplayPreferencesPanel.test.tsx`, assert grouped cards:

```tsx
expect(html).toContain("display-panel__grid");
expect(html).toContain("display-panel__card");
expect(html).toContain("Panel");
expect(html).toContain("Visible Agents");
expect(html).toContain("Usage Density");
expect(html).toContain("Language");
```

- [ ] **Step 2: Run display panel test and verify failure**

Run:

```bash
npm test -- src/renderer/components/DisplayPreferencesPanel.test.tsx
```

Expected: FAIL because the card/grid classes are not present.

- [ ] **Step 3: Implement display panel cards**

Wrap the display controls with:

```tsx
<div className="display-panel__grid">
  <div className="display-panel__card">
    <div className="display-panel__title">{t("display.panel.title")}</div>
    <label className="display-panel__toggle">...</label>
  </div>
  <div className="display-panel__card">
    <div className="display-panel__title">{t("display.agents.title")}</div>
    <div className="display-panel__agents">...</div>
  </div>
  <div className="display-panel__card">
    <div className="display-panel__title">{t("display.density.title")}</div>
    <div className="display-panel__agents">...</div>
  </div>
  <div className="display-panel__card">
    <div className="display-panel__title">{t("display.language.title")}</div>
    <div className="display-panel__agents">...</div>
  </div>
</div>
```

Add i18n keys:

```ts
"display.panel.title": "Panel",
```

Chinese:

```ts
"display.panel.title": "面板",
```

- [ ] **Step 4: Update integration panel tests**

In `src/renderer/components/IntegrationPanel.test.tsx`, add assertions for compact status and details:

```tsx
expect(html).toContain("integration-panel__status-grid");
expect(html).toContain("integration-panel__details");
expect(html).toContain("Integration details");
```

- [ ] **Step 5: Implement integration details**

Keep the header summary and refresh button visible. Move lower-frequency healthy metadata and attention-grid details into:

```tsx
<div className="integration-panel__status-grid">
  ...
</div>
<details className="integration-panel__details">
  <summary>{i18n.t("integration.details")}</summary>
  ...
</details>
```

Add i18n:

```ts
"integration.details": "Integration details",
```

Chinese:

```ts
"integration.details": "接入详情",
```

- [ ] **Step 6: Add compact card CSS**

Add:

```css
.display-panel__grid,
.integration-panel__status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.display-panel__card {
  display: grid;
  gap: 9px;
  min-height: 96px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, white 4%);
  background: rgba(255, 255, 255, 0.025);
}

.integration-panel__details {
  display: grid;
  gap: 10px;
}

.integration-panel__details > summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
}
```

- [ ] **Step 7: Run focused component tests**

Run:

```bash
npm test -- src/renderer/components/DisplayPreferencesPanel.test.tsx src/renderer/components/IntegrationPanel.test.tsx
```

Expected: PASS.

---

### Task 5: Maintenance And Support Density Pass

**Files:**
- Modify: `src/renderer/components/UpdatePanel.tsx`
- Modify: `src/renderer/components/UpdatePanel.test.tsx`
- Modify: `src/renderer/components/SupportPanel.tsx`
- Modify: `src/renderer/components/SupportPanel.test.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Update update panel tests for compact notes/detail structure**

In `src/renderer/components/UpdatePanel.test.tsx`, keep existing assertions and add:

```tsx
expect(html).toContain("update-panel__status");
expect(html).toContain("update-panel__notes");
```

- [ ] **Step 2: Implement update panel status block**

In `UpdatePanel.tsx`, wrap the summary in:

```tsx
<div className="update-panel__status">{summary}</div>
```

Keep release notes visible when available, because release notes are primary update information.

- [ ] **Step 3: Update support panel tests**

In `src/renderer/components/SupportPanel.test.tsx`, assert concise action grouping:

```tsx
expect(html).toContain("support-panel__actions");
expect(html).toContain("Diagnostics Preview");
```

- [ ] **Step 4: Keep support content action-first**

If `SupportPanel.tsx` already uses action-first layout, only adjust class names and remove redundant subtitle copy when `showHeader={false}`. Do not remove diagnostics preview or external links.

- [ ] **Step 5: Add CSS**

Add:

```css
.update-panel__status {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
```

If support actions need spacing:

```css
.support-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- src/renderer/components/UpdatePanel.test.tsx src/renderer/components/SupportPanel.test.tsx
```

Expected: PASS.

---

### Task 6: Verification And Final Commit

**Files:**
- Modify only files changed by Tasks 1-5.

- [ ] **Step 1: Run full renderer/unit test suite**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS and `out/` build artifacts are produced.

- [ ] **Step 4: Run E2E**

Run:

```bash
npm run test:e2e
```

Expected: all Playwright E2E tests PASS.

- [ ] **Step 5: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Review changed files**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended renderer, tests, i18n, style, and plan files are changed.

- [ ] **Step 7: Commit**

Run:

```bash
git add -f docs/superpowers/plans/2026-04-13-settings-layout-and-update-entry.md
git add src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/i18n.tsx src/renderer/styles.css src/renderer/styles.test.ts src/renderer/components/MainUpdateButton.tsx src/renderer/components/MainUpdateButton.test.tsx src/renderer/components/DisplayPreferencesPanel.tsx src/renderer/components/DisplayPreferencesPanel.test.tsx src/renderer/components/IntegrationPanel.tsx src/renderer/components/IntegrationPanel.test.tsx src/renderer/components/UpdatePanel.tsx src/renderer/components/UpdatePanel.test.tsx src/renderer/components/SupportPanel.tsx src/renderer/components/SupportPanel.test.tsx
git commit -m "feat: surface updates and compact settings"
```

Expected: commit succeeds.

---

## Self-Review

- Spec coverage: Task 1 and Task 2 cover the conditional main update entry. Task 3 covers compact settings navigation and section copy. Task 4 covers Display and Integrations density. Task 5 covers Maintenance and Support density. Task 6 covers full verification.
- Placeholder scan: The plan contains no TBD/TODO/FIXME placeholders.
- Type consistency: `AppUpdateState`, `SettingsSectionId`, `MainUpdateButton`, and i18n key names are consistent across tasks.
