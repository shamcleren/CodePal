# Release Assets

This document defines the recommended screenshot and media set for the current CodePal release flow.

The goal is to make README and GitHub Releases feel product-facing rather than like internal engineering notes.

## Priority Order

1. `docs/assets/hero-main.png`
2. `docs/assets/analytics-overview.png`
3. `docs/assets/work-review.png`
4. `docs/index.html`
5. `docs/assets/codepal-demo.mp4` (optional but recommended for release pages)
6. `docs/assets/settings-focus.png` (optional)

Do not start with the video. Get the main dashboard, Analytics, and Work Review assets clean first.

## 1. Hero Main

Target file: `docs/assets/hero-main.png`

Purpose:

- top screenshot for README
- first screenshot for GitHub Release page

What it should show:

- the usage strip
- 2 to 4 session rows only
- at least one clearly `running` or `waiting` session
- enough activity detail to show that this is a monitoring product

What it should avoid:

- a long historical session list
- too many repeated idle/completed rows
- obviously noisy or low-value text
- sensitive local content

Recommended capture style:

- use a realistic but curated dataset
- crop to the most product-relevant upper area of the main panel
- keep the screenshot wide enough to preserve the floating-panel feel
- prefer a clean, dark background with no distracting desktop clutter

## 2. Analytics Overview

Target file: `docs/assets/analytics-overview.png`

Purpose:

- secondary README screenshot
- product page proof for token / cost / trend coverage
- release-facing proof that CodePal is now more than a live session list

What it should show:

- total tokens, requests, input, output, cache, and estimated cost
- a visible trend chart
- project / agent / model filters when space allows
- source / coverage text only when it helps explain what is shown

What it should avoid:

- real project names, account names, or model provider secrets
- a chart with too many unreadable points
- raw transcript text

## 3. Work Review

Target file: `docs/assets/work-review.png`

Purpose:

- secondary README screenshot
- product page proof for local operations memory

What it should show:

- Today / Yesterday daily grouping
- project grouping
- completed and in-progress items
- data coverage labels

What it should avoid:

- real task titles
- real repository paths
- internal incident / customer names

## 4. Static Product Page

Target file: `docs/index.html`

Purpose:

- GitHub Pages product page when Pages is configured to serve `docs/`
- richer release-facing page than README can comfortably provide

Guidelines:

- keep it static and dependency-free
- reference only checked-in assets under `docs/assets/`
- keep release copy aligned with README positioning
- do not embed third-party trackers or remote fonts

## 5. Demo Video

Target file: `docs/assets/codepal-demo.mp4`

Source:

- `promo/remotion-codepal/`
- `docs/assets/walkthrough/*.png`

Purpose:

- product page media
- optional GitHub Release demo asset

Recommended sequence:

1. introduce that this is a real CodePal walkthrough with synthetic data
2. show session monitoring
3. click to expand one session
4. click into Analytics
5. click into Work Review
6. click into Settings / diagnostics briefly

Constraints:

- keep it around 15 to 20 seconds
- drive animation with Remotion `useCurrentFrame()` and explicit frame timing
- use only screenshots generated from an isolated CodePal profile with synthetic data
- render a still frame before the full video when changing layout

## 6. Settings Focus

Target file: `docs/assets/settings-focus.png`

Purpose:

- optional support screenshot for GitHub Pages / Release material
- optional support screenshot for GitHub Release page

Priority:

- lower than the main dashboard hero
- only worth adding if it clearly helps explain diagnostics, setup, or login-state repair

What it should show:

- integration diagnostics
- usage settings
- Cursor / CodeBuddy login-state refresh or deletion flow when relevant

What it should avoid:

- large empty regions with no useful signal
- too much low-priority detail below the fold
- sensitive account information

Recommended capture style:

- crop tighter than the full settings window
- center the screenshot around the highest-value controls
- keep labels readable without requiring zoom

## Legacy Demo GIF

Target file: `docs/assets/codepal-demo.gif`

Status:

- optional for the current release

Purpose:

- used only if README or Release page still feels too static after the two screenshots are improved

Recommended sequence:

1. open CodePal
2. show the main panel with active sessions
3. expand one session
4. open Settings
5. refresh or clear a supported login state

Constraints:

- keep it around 10 to 15 seconds
- avoid full-product walkthroughs
- avoid tiny cursor movement or over-busy motion
- optimize for quick understanding, not completeness

## Capture Guidelines

- Prefer stable sample data over live clutter.
- Blur or replace anything user-specific.
- Keep copy readable at GitHub README scale.
- Avoid screenshots that require the viewer to decode a dense table before understanding the product.
- If choosing between “more complete” and “more legible”, choose “more legible”.

## README Placement

Recommended order:

1. `hero-main.png`
2. `analytics-overview.png`
3. `work-review.png`
4. `codepal-demo.mp4` or `docs/index.html` when richer media is useful
5. `settings-focus.png` only if it adds real value

Prefer `codepal-demo.mp4` over the legacy GIF. If the GIF exists, place it after the static screenshots or only on the Release page.

## Current Assessment

Current files:

- `docs/assets/icon.png`
- `docs/assets/hero-main.png`
- `docs/assets/analytics-overview.png`
- `docs/assets/work-review.png`
- `docs/assets/settings-focus.png`
- `docs/assets/codepal-demo.mp4`
- `docs/index.html`

`docs/assets/icon.png` now uses the refreshed CodePal app icon. The source artwork and menu bar glyph live under `design/codepal-icon-redesign/`.

The screenshots and video must be generated from sanitized synthetic data. Use:

```bash
npm run build
npm run promo:capture
cd promo/remotion-codepal
npm install
npm run still
npm run render
```

Review generated assets before publishing. They must not expose real usernames, local project paths, transcript contents, provider URLs, account status, API keys, or tokens.
