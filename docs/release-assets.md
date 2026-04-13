# Release Assets

This document defines the recommended screenshot and media set for the current CodePal release flow.

The goal is to make README and GitHub Releases feel product-facing rather than like internal engineering notes.

## Priority Order

1. `docs/hero-main.png`
2. `docs/settings-focus.png` (optional)
3. `docs/codepal-demo.gif` (optional)

Do not start with the GIF. Get the main dashboard asset clean first.

## 1. Hero Main

Target file: `docs/hero-main.png`

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

## 2. Settings Focus

Target file: `docs/settings-focus.png`

Purpose:

- optional secondary screenshot for README
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

## 3. Demo GIF

Target file: `docs/codepal-demo.gif`

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
2. `settings-focus.png` only if it adds real value

If the GIF exists, place it after the static screenshots or only on the Release page.

## Current Assessment

Current files:

- `docs/icon.png`
- `docs/index.png`
- `docs/setting.png`

`docs/icon.png` now uses the refreshed CodePal app icon. The source artwork and menu bar glyph live under `design/codepal-icon-redesign/`.

The screenshots are useful references, but they are still closer to engineering screenshots than polished release assets.

The main gap is not resolution. The main gap is focus, especially around making the dashboard the clear visual hero.
