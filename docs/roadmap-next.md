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

## v1.1.0 Planned Features

These five features define the v1.1.0 release scope. They move CodePal from monitoring-only toward lightweight interaction and awareness.

### 1. macOS Notifications And Sounds

**Priority: highest — no external blockers, can start immediately.**

Add native macOS notifications and optional sounds for important session state transitions.

Initial candidate states:

- session completed
- session waiting for a decision
- session errored
- long-running session became active again

Design decisions:

- whether notifications are enabled by default
- whether sounds can be disabled independently
- which states should stay silent and only update the main panel
- how to avoid repeated notifications when one state flickers

### 2. Allow (Approval Expansion)

**Priority: high — Cursor already works, Codex blocked on upstream.**

Cursor `approval` / `Allow / Deny` already round-trips through the hook path. Codex approval is blocked because the current public Codex `notify` hook is completion-only, not a real approval source.

Next steps:

- resume Codex approval work only when upstream exposes a real approval / permission hook
- required: stable `sessionId` in the approval payload, explicit approval semantics
- keep the existing canonical pending-action model and response-target routing

Relevant code: `src/main/hook/`, `src/main/ingress/hookIngress.ts`, `src/main/actionResponse/dispatchActionResponse.ts`

### 3. Send Message (CodePal → Agent)

**Priority: medium — depends on session ownership and delivery semantics.**

Enable outbound message delivery from CodePal to a running agent session.

Preconditions:

- session ownership must be unambiguous (one CodePal panel → one agent session)
- delivery mechanism must be reliable per agent (stdin pipe, hook response, local protocol)
- must not interfere with the existing monitoring-first data flow

This is not freeform `text_input`; scope is limited to structured message delivery to an identified running session.

### 4. Click-To-Navigate (IDE / Terminal Jump)

**Priority: lower — depends on per-agent navigation APIs.**

Allow clicking a session or activity row to jump to the corresponding IDE window or terminal pane.

Preconditions:

- each agent adapter must expose a way to activate its window or pane
- Cursor and JetBrains IDEs may support window activation via CLI or AppleScript
- terminal-based agents (Claude Code, Codex) need a reliable pane-focus mechanism
- must degrade gracefully when navigation is unavailable

### 5. Session Restore on App Update

**Priority: high — directly improves update experience, no external blockers.**

Restore recent sessions from SQLite history on app startup so the dashboard is not empty after an update or restart.

Design decisions (resolved):

- restore scope: user-initiated sessions updated within the last 24 hours, capped at 150
- restore depth: session metadata only (activity items lazy-loaded on expand as before)
- stale status normalization: `running` / `waiting` demoted to `idle` on restore
- pre-install flush: history writer explicitly flushed before `quitAndInstall()` to prevent data loss
- merge safety: live hook events always take precedence over restored state

## Ongoing Priorities

These continue alongside v1.1.0 feature work:

### Monitoring Depth

- broader Claude quota calibration beyond the current token usage and statusLine-derived `rate_limits` snapshots
- broader Cursor real-world payload calibration
- broader CodeBuddy payload and transcript-shape calibration
- deeper JetBrains coverage on the shared monitoring path
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
- stronger approval and control-loop workflows
- more advanced diagnostics and automation

These are direction candidates, not committed SKUs.

## Longer-Term Expansion

These directions are worth recording now, but they should remain explicitly behind v1.1.0 and the current monitoring-baseline work.

### Dynamic Island / Ambient Surface

One possible future direction is a lighter-weight macOS presence layer beyond the main floating panel.

Potential uses:

- glanceable running / waiting state
- quota pressure cues
- pending approval nudges
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

- forcing full cross-agent control before monitoring reliability is mature
- expanding updater complexity before release trust and validation stay reliable
- implementing billing before user-value retention is validated
- overloading README or release messaging with speculative roadmap promises

## Decision Order

If planning effort is limited, the recommended decision order is:

1. strengthen monitoring depth
2. keep macOS distribution trust and release ergonomics reliable
3. improve update-state UX and recovery
4. validate sustained usage patterns
5. design paid / team expansion from real usage evidence
