# CodePal v1.0.0 Release Notes

CodePal v1.0.0 is the first release candidate for the monitoring-first product direction.

It gives you one floating desktop panel for keeping multiple AI coding agents visible in one place.

## Highlights

- One floating panel for Cursor, Claude Code, Codex, CodeBuddy, and the currently calibrated GoLand / PyCharm path
- Flat, time-sorted session monitoring with clearer `running`, `waiting`, `completed`, and `error` states
- Unified activity timeline for assistant, tool, and system events with lower-noise rendering
- Usage visibility across supported sources
- In-app integration diagnostics and repair, plus login-state reset for Cursor and CodeBuddy
- Bilingual desktop UI with `system` / `en` / `zh-CN`

## Install

1. Open the repository `Releases` page.
2. Download the latest macOS `.dmg` or `.zip`.
3. Move `CodePal.app` into `Applications`.
4. Launch the app.
5. If macOS blocks the app on first launch, allow it manually in Security settings.

The main remaining release blocker is final macOS signing / notarization.

## Remaining Release Blocker

- macOS signing / notarization is still the main item left before the polished 1.0.0 distribution bar is met

## Known Follow-Ups

- Claude does not yet have an authoritative live quota/reset source. Current behavior is token-first, with last-known quota retained locally when statusline data is available.
- Cursor payload coverage is still expanding beyond the currently normalized subset.
- CodeBuddy payload and transcript-shape calibration is still expanding beyond the currently confirmed subset.
- GoLand / PyCharm support currently stays within the shared CodeBuddy JetBrains watcher path and calibrated scope.
- CodePal is still monitoring-first, not a full cross-agent control console.

## Not In This Release

- Freeform `text_input`
- A general CodePal -> agent message channel
- Deep IDE pane navigation guarantees
- Deep terminal control
- Anything beyond the remaining signing / notarization release step

## Feedback That Helps

- which agent was involved
- whether the issue was in session visibility, activity, usage, or settings
- what you expected to see
- what CodePal actually showed
- whether it reproduced consistently
- screenshots when relevant

## Validation

Validated on 2026-04-08:

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run dist:mac`
