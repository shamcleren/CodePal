import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesPath = path.resolve(process.cwd(), "src/renderer/styles.css");

function cssBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`).exec(css);
  return match?.[0] ?? "";
}

function cssBlocks(css: string, selector: string): string[] {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, "g")), (match) => match[0]);
}

function themeTokens(css: string, theme: string): string[] {
  const selector = `[data-theme="${theme}"]`;
  const start = css.indexOf(selector);
  if (start < 0) {
    return [];
  }

  const blockStart = css.indexOf("{", start);
  const blockEnd = css.indexOf("}", blockStart);
  const block = css.slice(blockStart, blockEnd);
  return Array.from(new Set(block.match(/--[a-z0-9-]+(?=\s*:)/g) ?? [])).sort();
}

function removeCssBlock(css: string, selectorPattern: string): string {
  const selector = new RegExp(`${selectorPattern}\\s*\\{`);
  const match = selector.exec(css);
  if (!match) {
    return css;
  }

  let depth = 0;
  for (let index = match.index; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return `${css.slice(0, match.index)}${css.slice(index + 1)}`;
      }
    }
  }

  return css;
}

function componentCss(css: string): string {
  return removeCssBlock(
    removeCssBlock(css, String.raw`:root,\s*\[data-theme="graphite-ops"\]`),
    String.raw`\[data-theme="paper-ops"\]`,
  );
}

describe("renderer layout styles", () => {
  it("keeps the session list scrollable inside the floating window", () => {
    const css = fs.readFileSync(stylesPath, "utf8");

    expect(css).toMatch(/\.app\s*\{[\s\S]*height:\s*100vh;/);
    expect(css).toMatch(/\.app\s*\{[\s\S]*overflow:\s*hidden;/);
    expect(css).toMatch(/\.app\s*\{[\s\S]*color:\s*var\(--text\);/);
    expect(css).toMatch(/\.session-list\s*\{[\s\S]*min-height:\s*0;/);
    expect(css).toMatch(/\.session-list\s*\{[\s\S]*overflow-y:\s*auto;/);
  });

  it("keeps the compact status row and contained session details layout", () => {
    const css = fs.readFileSync(stylesPath, "utf8");

    expect(css).toMatch(/\.status-bar\s*\{[\s\S]*align-items:\s*center;/);
    expect(css).toMatch(/\.app-header__actions\s*\{/);
    expect(css).toMatch(/\.app-update-button\s*\{/);
    expect(css).toMatch(/\.app-update-button--error\s*\{/);
    expect(css).toMatch(/\.status-bar\s*\{[\s\S]*justify-content:\s*space-between;/);
    expect(css).toMatch(/\.status-bar\s*\{[\s\S]*padding:\s*10px 12px;/);
    expect(css).toMatch(/\.status-bar__group\s*\{/);
    expect(css).toMatch(/\.usage-strip\s*\{/);
    expect(css).toMatch(/\.usage-strip__agent\s*\{/);
    expect(css).toMatch(/\.display-panel\s*\{/);
    expect(css).toMatch(/\.display-panel__summary\s*\{/);
    expect(css).toMatch(/\.display-panel__actions\s*\{/);
    expect(css).toMatch(/\.session-row__summary-text\s*\{[\s\S]*white-space:\s*nowrap;/);
    expect(css).toMatch(/\.session-row__pending\s*\{/);
    expect(css).toMatch(/\.session-row__summary\s*\{[\s\S]*padding:\s*12px 44px 12px 12px;/);
    expect(css).toMatch(/\.session-row__delete-trigger\s*\{[\s\S]*top:\s*12px;/);
    expect(css).toMatch(/\.session-row__delete-trigger\s*\{[\s\S]*right:\s*12px;/);
    expect(css).toMatch(/\.session-row__delete-trigger\s*\{[\s\S]*width:\s*24px;/);
    expect(css).toMatch(
      /\.session-row:hover\s+\.session-row__delete-trigger,\s*\.session-row__delete-trigger:focus-visible\s*\{[\s\S]*opacity:\s*1;/,
    );
    expect(css).not.toMatch(/\.session-row:focus-within\s+\.session-row__delete-trigger/);
    expect(css).toMatch(/\.session-row--running\s*\{/);
    expect(css).toMatch(/\.session-row--waiting\s*\{/);
    expect(css).toMatch(/\.session-row--error\s*\{/);
    expect(css).toMatch(/\.session-row--completed\s*\{/);
    expect(css).toMatch(/\.session-row--idle\s*\{/);
    expect(css).toMatch(/\.session-row--offline\s*\{/);
    expect(css).toMatch(/\.session-row--running::before\s*\{/);
    expect(css).toMatch(/\.session-row--running\s*\{[\s\S]*animation:\s*session-running-pulse/);
    expect(css).toMatch(/@keyframes session-running-pulse/);
    expect(css).toMatch(/@keyframes session-running-sheen/);
    expect(css).toMatch(
      /\.session-row__details-shell\s*\{[\s\S]*max-height:\s*min\(72vh,\s*640px\);/,
    );
    expect(css).toMatch(/--session-details-shell-bg:/);
    expect(css).toMatch(/--session-review-band-bg:/);
    expect(css).toMatch(/--session-timeline-bg:/);
    expect(css).toMatch(/--session-footer-bg:/);
    expect(css).toMatch(/\[data-theme="graphite-ops"\]/);
    expect(css).toMatch(/\[data-theme="paper-ops"\]/);
    expect(css).not.toMatch(/\[data-theme="classic"\]/);
    expect(css).toMatch(
      /\.session-row__details-shell\s*\{[\s\S]*background:\s*var\(--session-details-shell-bg\);/,
    );
    expect(css).toMatch(/\.session-row__details-shell\s*\{[\s\S]*overflow:\s*hidden;/);
    expect(css).toMatch(/\.session-row__details-header\s*\{/);
    expect(css).toMatch(/\.session-row__details-header\s*\{[\s\S]*min-height:\s*30px;/);
    expect(css).toMatch(
      /\.session-row__details-header\s*\{[\s\S]*background:\s*var\(--session-review-band-bg\);/,
    );
    expect(css).toMatch(/\.session-row__details\s*\{[\s\S]*overflow:\s*auto;/);
    expect(css).toMatch(
      /\.session-row__details\s*\{[\s\S]*background:\s*var\(--session-timeline-bg\);/,
    );
    expect(css).toMatch(
      /\.session-row__footer\s*\{[\s\S]*background:\s*var\(--session-footer-bg\);/,
    );
    expect(css).toMatch(/\.session-row__history-status\s*\{/);
    expect(css).toMatch(/\.session-row__history-status--loading\s*\{/);
    expect(css).toMatch(/\.session-row__history-status--error\s*\{/);
    expect(css).toMatch(/\.session-row__footer-usage\s*\{/);
    expect(css).toMatch(/\.session-row__footer-stat\s*\{/);
    expect(css).toMatch(/\.session-row__footer-stat-value\s*\{/);
    expect(css).toMatch(/\.app-settings-drawer__content\s*\{[\s\S]*overflow:\s*hidden;/);
    expect(css).toMatch(/\.settings-nav\s*\{/);
    expect(css).toMatch(/\.settings-nav__item--active\s*\{/);
    expect(css).toMatch(/\.settings-content\s*\{[\s\S]*overflow:\s*hidden;/);
    expect(css).toMatch(/\.settings-section-shell\s*\{[\s\S]*overflow-y:\s*auto;/);
    expect(css).toMatch(/\.settings-section-shell\s*\{[\s\S]*align-content:\s*start;/);
    expect(css).toMatch(/\.settings-section-shell\s*\{[\s\S]*grid-auto-rows:\s*max-content;/);
    expect(css).toMatch(/\.settings-stack--maintenance\s*\{/);
    expect(css).toMatch(/\.integration-panel__details\s*\{[\s\S]*flex-direction:\s*column;/);
    expect(css).toMatch(/\.integration-grid\s*\{[\s\S]*align-items:\s*start;/);
    expect(css).toMatch(/\.session-stream__item--message\s*\{/);
    expect(css).toMatch(/\.session-stream__item--message\s*\{[\s\S]*width:\s*min\(100%,\s*82%\);/);
    expect(css).toMatch(/\.session-stream__item--message-user\s*\{[\s\S]*margin-left:\s*auto;/);
    expect(css).toMatch(/\.session-stream__item--message-agent[\s\S]*margin-right:\s*auto;/);
    expect(css).toMatch(/\.session-stream__item--artifact\s*\{/);
    expect(css).toMatch(/\.session-stream__item--artifact\s*\{[\s\S]*border-radius:\s*14px;/);
    expect(css).toMatch(/\.session-stream__item--artifact-call\s+\.session-stream__body\s*\{/);
    expect(css).toMatch(/\.session-stream__item--artifact-result\s+\.session-stream__body\s*\{/);
    expect(css).toMatch(/\.session-stream__artifact-type\s*\{[\s\S]*font-size:\s*8px;/);
    expect(css).toMatch(/\.session-stream__artifact-body-shell\s*\{/);
    expect(css).toMatch(/\.session-stream__artifact-summary\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
    expect(css).toMatch(/\.session-stream__item--note\s*\{/);
    expect(css).toMatch(/\.session-stream__section--primary\s*\{/);
    expect(css).toMatch(/\.session-stream__virtual-viewport\s*\{/);
    expect(css).toMatch(/\.session-stream__virtual-viewport\s*\{[\s\S]*position:\s*relative;/);
    expect(css).toMatch(/\.session-stream__virtual-item\s*\{/);
    expect(css).toMatch(/\.session-stream__virtual-item\s*\{[\s\S]*position:\s*absolute;/);
    expect(css).toMatch(/\.session-stream__item--artifact-active::after\s*\{/);
    expect(css).toMatch(/@keyframes session-artifact-scan/);
    expect(css).toMatch(/\.pending-action\s*\{[\s\S]*border-radius:\s*14px;/);
    expect(css).toMatch(/\.pending-action__eyebrow\s*\{/);
    expect(css).toMatch(/\.pending-action__btn\s*\{/);
    expect(css).toMatch(/\.session-stream__code\s*\{/);
    expect(css).toMatch(/\.session-stream__code\s*\{[\s\S]*max-width:\s*100%;/);
    expect(css).toMatch(/\.session-stream__code\s*\{[\s\S]*display:\s*inline;/);
    expect(css).toMatch(/\.session-stream__code\s*\{[\s\S]*border-radius:\s*5px;/);
    expect(css).toMatch(/\.session-stream__code\s*\{[\s\S]*box-decoration-break:\s*clone;/);
    expect(css).toMatch(/\.session-stream__code\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/\.session-stream__code\s*\{[\s\S]*word-break:\s*break-word;/);
    expect(css).toMatch(/\.session-stream__codeblock\s*\{/);
    expect(css).toMatch(/\.session-stream__codeblock-shell\s*\{/);
    expect(css).toMatch(/\.session-stream__codeblock-shell\s*\{[\s\S]*position:\s*relative;/);
    expect(css).toMatch(/\.session-stream__codeblock-shell\s*\{[\s\S]*border-radius:\s*9px;/);
    expect(css).toMatch(/\.session-stream__codeblock-copy\s*\{[\s\S]*position:\s*absolute;/);
    expect(css).toMatch(/\.session-stream__codeblock-copy\s*\{[\s\S]*top:\s*8px;/);
    expect(css).toMatch(/\.session-stream__codeblock-copy\s*\{[\s\S]*right:\s*8px;/);
    expect(css).toMatch(/\.session-stream__codeblock-content\s*\{/);
    expect(css).toMatch(/\.session-stream__codeblock-code\s*\{/);
    expect(css).toMatch(/\.session-stream__plaintext\s*\{/);
    expect(css).toMatch(/\.session-stream__plaintext--diff\s*\{/);
    expect(css).toMatch(/\.session-stream__plaintext--json\s*\{/);
    expect(css).toMatch(/\.session-stream__plaintext--log\s*\{/);
    expect(css).toMatch(/\.session-stream__plaintext-line--add\s*\{/);
    expect(css).toMatch(/\.session-stream__plaintext-line--remove\s*\{/);
    expect(css).toMatch(/\.session-stream__strong\s*\{/);
    expect(css).toMatch(/\.session-stream__link\s*\{/);
    expect(css).toMatch(/\.session-row__loading\s*\{/);
    expect(css).toMatch(/\.session-row__loading-bubble\s*\{/);
    expect(css).toMatch(/\.session-row__loading-dots\s*\{/);
    expect(css).toMatch(/\.session-stream__typing-indicator\s*\{/);
    expect(css).toMatch(/\.session-stream__typing-dots\s*\{/);
    expect(css).toMatch(/@keyframes session-loading-dots/);
  });

  it("keeps analytics text and surfaces theme-aware in light mode", () => {
    const css = fs.readFileSync(stylesPath, "utf8");

    expect(css).toMatch(/--text-muted:/);
    expect(css).toMatch(/--text-faint:/);
    expect(css).toMatch(/--native-control-scheme:/);
    expect(css).toMatch(/--analytics-muted-text:/);
    expect(css).toMatch(/--analytics-control-bg:/);
    expect(css).toMatch(/--analytics-control-hover-bg:/);
    expect(css).toMatch(/--analytics-control-active-bg:/);
    expect(css).toMatch(/--analytics-subtle-bg:/);
    expect(css).toMatch(/--analytics-table-head-bg:/);
    expect(css).toMatch(/--analytics-row-hover-bg:/);
    expect(css).toMatch(/--analytics-table-text:/);
    expect(css).toMatch(/--analytics-table-number-text:/);
    expect(css).not.toMatch(/var\(--panel\)/);

    expect(cssBlock(css, ".analytics-page__range-btn")).toContain(
      "background: var(--analytics-control-bg);",
    );
    expect(cssBlock(css, ".analytics-page__range-btn:hover")).toContain(
      "background: var(--analytics-control-hover-bg);",
    );
    expect(cssBlock(css, ".analytics-page__range-btn--active")).toContain(
      "background: var(--analytics-control-active-bg);",
    );
    expect(cssBlock(css, ".analytics-page__date-input")).toContain(
      "color-scheme: var(--native-control-scheme);",
    );
    expect(cssBlock(css, ".analytics-page__chart-y-axis")).toContain(
      "color: var(--analytics-muted-text);",
    );
    expect(cssBlock(css, ".analytics-page__chart-y-axis")).not.toContain("opacity:");
    expect(cssBlock(css, ".analytics-page__table-agent")).toContain(
      "color: var(--analytics-muted-text);",
    );
    expect(cssBlock(css, ".analytics-page__table-agent")).not.toContain("opacity:");
    expect(cssBlock(css, ".analytics-page__table td")).toContain(
      "color: var(--analytics-table-text);",
    );
    expect(cssBlock(css, ".analytics-page__table-model")).toContain(
      "color: var(--analytics-table-text);",
    );
    expect(cssBlocks(css, ".analytics-page__table td.analytics-page__table-num")).toContainEqual(
      expect.stringContaining("color: var(--analytics-table-number-text);"),
    );
  });

  it("keeps built-in theme templates aligned on semantic tokens", () => {
    const css = fs.readFileSync(stylesPath, "utf8");

    expect(themeTokens(css, "paper-ops")).toEqual(themeTokens(css, "graphite-ops"));
    expect(themeTokens(css, "graphite-ops")).toEqual(
      expect.arrayContaining([
        "--font-display",
        "--font-ui",
        "--font-mono",
        "--text-on-accent",
        "--surface-info",
        "--surface-warning",
        "--surface-success",
        "--surface-muted",
        "--message-agent-bg",
        "--message-user-bg",
        "--artifact-bg",
        "--analytics-table-text",
        "--analytics-table-number-text",
        "--pending-card-bg",
        "--external-card-bg",
        "--timeline-footer-fade",
        "--brand-claude",
        "--brand-codebuddy-bg",
        "--brand-jetbrains-bg",
      ]),
    );
  });

  it("keeps component styles on semantic theme tokens instead of raw colors", () => {
    const css = fs.readFileSync(stylesPath, "utf8");
    const rawColorLines = componentCss(css)
      .split("\n")
      .filter((line) => !line.includes("white-space"))
      .filter((line) => !line.includes(".display-panel__theme-swatch--"))
      .filter((line) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|\bwhite\b|\bblack\b/.test(line));

    expect(rawColorLines).toEqual([]);
    expect(componentCss(css)).not.toMatch(/letter-spacing:\s*0\.[0-9]+em/);
    expect(componentCss(css)).not.toMatch(/font-family:\s*ui-|var\(--font-mono,/);
  });

  it("does not reference undefined css variables", () => {
    const css = fs.readFileSync(stylesPath, "utf8");
    const definitions = new Set(
      Array.from(css.matchAll(/--([a-z0-9-]+)\s*:/g), (match) => match[1]),
    );
    const references = Array.from(css.matchAll(/var\(--([a-z0-9-]+)/g), (match) => match[1]);

    expect(Array.from(new Set(references.filter((name) => !definitions.has(name)))).sort()).toEqual([]);
  });
});
