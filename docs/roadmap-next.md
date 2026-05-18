# Roadmap Next

## Purpose

This document captures the near-term and medium-term product direction after the current V1 release baseline.

It is not a date-based promise list.

It exists to help prioritize what should happen next, in what order, and why.

## Planning Principle

CodePal should continue strengthening the monitoring-first foundation before expanding into broader control or monetization layers.

That means:

- stabilize and deepen the current monitoring experience first
- improve release ergonomics before scaling distribution
- validate sustained user value before implementing paid features

## v1.1.0 Features — Shipped

All five original v1.1.0 features are now shipped. See individual sections for delivery details.

### 1. macOS Notifications And Sounds — Shipped (v1.1.0)

Native macOS notifications and optional sounds for session state transitions. Covers: completed, waiting for decision, errored, resumed after long idle. Per-state toggle in settings, 30 s debounce to avoid duplicate storms. Notification service wired as a `sessionStore` callback so every event path gains notification support automatically.

### 2. ~~Allow (Approval Expansion)~~ — Dropped (v1.1.3)

CodePal dropped the Claude PreToolUse blocking hook and embraced dashboard-only monitoring. Approval flows remain the responsibility of each agent and its CLI; CodePal will not act as an approval intermediary.

Residual `actionResponse/` code is retained for Cursor passive observation only and should not be extended.

### 3. Send Message (CodePal → Agent) — Shipped (v1.1.1, expanded v1.1.5)

Capability-gated terminal delivery. `canReply(session)` returns true for tmux, WezTerm, kitty, iTerm2, and Ghostty; the composer is hidden for all other environments. Sender precedence: tmux > WezTerm > kitty > iTerm2 > Ghostty. This is not freeform `text_input`; scope is limited to structured message delivery into a known terminal pane.

### 4. Click-To-Navigate (IDE / Terminal Jump) — Shipped (v1.1.1, expanded v1.1.5)

Per-terminal precise focus dispatch. tmux: `switch-client` + `select-window`. iTerm2: AppleScript by session id. Terminal.app: AppleScript by tty. Ghostty: AppleScript activate. WezTerm: `wezterm cli activate-pane`. kitty: `kitten @ focus-window`. `open -a` remains the final fallback. JetBrains IDE workspace activation is explicitly out of scope — JetBrains sessions are monitored through the shared CodeBuddy plugin watcher, but CodePal does not attempt to focus JetBrains windows.

### 5. Session Restore on App Update — Shipped (v1.1.0)

On startup, recent user-initiated sessions (last 24 hours, up to 150) are restored from SQLite history. Stale `running` / `waiting` statuses are normalized to `idle`. Live hook events always take precedence over restored state.

## What's Next

With v1.1.0–v1.1.5 shipped, the near-term focus shifts to:

### Tier 2 Agent / Terminal Expansion

- **Gemini CLI**: hook event shape differs (`SessionStart` / `BeforeAgent` / `AfterAgent` / `Notification`), needs a dedicated `geminiHook.ts`
- **Kimi CLI**: payload is nearly identical to Claude but config lives in `~/.kimi/config.toml` `[[hooks]]`, needs a TOML installer
- **Warp**: env var (`$WARP_IS_LOCAL_SHELL_SESSION`) is captured at hook time, but jump and send-message are not implemented; the Open Island approach (SQLite pane table + AX menu cycling) is complex and needs separate evaluation

### Monitoring Depth

- broader Claude quota calibration beyond the current token usage and statusLine-derived `rate_limits` snapshots
- broader Cursor real-world payload calibration
- broader CodeBuddy payload and transcript-shape calibration
- continued signal-to-noise improvements in the activity timeline

### Distribution And Release Ergonomics

- smoother installation and first-run onboarding on macOS
- consistent release artifacts, release notes, and updater metadata across patch releases
- continued verification of signed and notarized macOS distribution
- more predictable in-app update discovery and recovery when a release is unavailable or malformed

### Product Polish

- more predictable settings and diagnostics UX
- stronger empty / degraded / expired state messaging
- better resilience around last-known usage and login-state handling
- refreshed macOS menu bar and in-app icon assets so size, sharpness, and dark-mode rendering stay consistent

## Distribution And Updates

Built-in macOS updates are now part of the release story, but they should stay tied to release trust and artifact validation rather than growing as an isolated feature.

The recommended order from here is:

1. keep the signed / notarized release loop working reliably
2. keep updater metadata and blockmap validation in every patch release
3. improve first-run and update-state messaging around missing, expired, or malformed releases
4. expand update UX only after the current release cadence stays stable

Why this order:

- auto-update trust depends on the binary and metadata staying correct
- release validation catches distribution failures before they become user-facing update failures
- update UX work is easier to justify once release cadence remains predictable

## Potential Team / Pro Features

Paid functionality should be considered only after CodePal proves it has strong ongoing usage value as a monitoring surface.

The current recommendation is to postpone payment implementation and first validate:

- whether users keep the app open day to day
- which monitoring signals they rely on most
- whether the strongest value is personal visibility, team visibility, or operational control

### Likely Free Foundation

- core session monitoring
- basic timeline visibility
- basic quota / usage visibility
- supported local integration repair

### Likely Pro / Team Directions

- richer historical usage and quota analysis
- deeper observability and reliability views
- broader agent / IDE coverage
- team-shared operational views
- more advanced diagnostics and automation

These are direction candidates, not committed SKUs.

## Longer-Term Expansion

These directions are worth recording now, but they should remain explicitly behind the current Tier 2 expansion and monitoring-baseline work.

### Dynamic Island / Ambient Surface

One possible future direction is a lighter-weight macOS presence layer beyond the main floating panel.

Potential uses:

- glanceable running / waiting state
- quota pressure cues
- pending-decision awareness (notification-level, not control)
- lightweight ambient presence while the full panel stays hidden

This should be treated as a product-surface expansion, not just a visual tweak.

It would affect:

- information density
- notification behavior
- interaction entry points
- which states deserve ambient exposure versus full-panel detail

### Windows Adaptation

Windows support is also a meaningful future direction, but it should follow macOS maturity rather than run ahead of it.

The value is clear:

- broader developer reach
- more realistic multi-IDE adoption
- less dependence on a single-platform release story

But it also implies platform work across:

- packaging and distribution
- system tray / window behavior
- local config paths
- hook installation and repair flows
- platform-specific filesystem and permission differences

The recommended posture is:

- record Windows support as a real expansion path
- avoid committing to it until the macOS interaction model and release workflow are more settled

## What Should Not Happen Too Early

The following are attractive, but should not jump ahead of the current baseline work:

- adding agent control or approval interception — CodePal is monitoring-only by design; control belongs to each agent's CLI
- JetBrains IDE workspace activation — JetBrains sessions are monitored through the shared CodeBuddy plugin watcher, but CodePal will not attempt to focus JetBrains windows
- expanding updater complexity before release trust and validation stay reliable
- implementing billing before user-value retention is validated
- overloading README or release messaging with speculative roadmap promises

## Decision Order

If planning effort is limited, the recommended decision order is:

1. expand Tier 2 agent / terminal coverage (Gemini, Kimi, Warp evaluation)
2. strengthen monitoring depth
3. keep macOS distribution trust and release ergonomics reliable
4. validate sustained usage patterns
5. design paid / team expansion from real usage evidence
