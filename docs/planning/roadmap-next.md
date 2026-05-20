# Roadmap Next

## Purpose

This document captures the product direction after the shipped v1.1.11 baseline.

It is not a date-based promise list. It is a prioritization guide for what should happen next, in what order, and why.

## Current Baseline

CodePal is already more than a single floating session list. The shipped baseline includes:

- unified monitoring for Cursor, Claude Code, Codex, CodeBuddy, and GoLand / PyCharm through the shared CodeBuddy JetBrains path
- local session history and on-demand expanded timelines
- token usage analytics, backfill, estimated costs, and HTML reports
- native notifications, click-to-navigate, and capability-gated terminal message delivery
- integration diagnostics, local repair, and Provider Gateway setup for supported desktop clients
- signed / notarized macOS release packaging and updater metadata validation

The next roadmap should build on that local data foundation instead of adding speculative control loops too early.

## Planning Principle

CodePal should become a local AI coding operations memory layer for heavy AI-coding users.

That means:

- keep the monitoring-first trust boundary
- turn existing session, usage, and timeline data into useful after-the-fact understanding
- measure workflow health and tool friction, not developer productivity scores
- prove sustained individual value before team, billing, cloud sync, or broader control surfaces

Research source: `docs/planning/research/deep-research-report.md`.

## Track 1: Personal AI Work Memory

This is the highest-leverage next product layer.

Goal: make CodePal useful not only while an agent is running, but also when the user wants to understand what happened after the work is done.

Near-term capabilities:

- session review pages that summarize duration, major phases, waiting/error periods, model usage, token/cost totals, and completion state
- daily digest view across agents: what ran, what finished, what stalled, where usage concentrated, and which sessions need follow-up
- exportable local reports in HTML / Markdown with redaction controls for prompts, paths, and assistant content
- better session titles and grouping by project / repository when the source path is reliable
- local-only retention controls that separate detailed transcript-like history from aggregate analytics

Why first:

- it uses the existing history SQLite, usage backfill, Analytics page, and HTML report foundation
- it gives users a reason to open CodePal at the end of the day, not only when something is stuck
- it fits the local privacy contract better than team dashboards or remote analytics

## Track 2: Workflow Health

CodePal should move toward workflow-quality diagnostics without becoming a bossware or performance-scoring product.

Useful signals:

- waiting time: how long sessions spend in waiting / idle gaps
- error recovery: how often sessions error and whether they later resume or complete
- session churn: repeated aborts, restarts, compactions, or subexecution-heavy runs
- context pressure: context compaction, model switching, or very large token runs where upstream signals allow it
- quota pressure: local usage, estimated cost, and last-known rate-limit snapshots
- observability coverage: how much work CodePal could confidently observe versus infer or miss

Design rules:

- present these as personal workflow-health signals
- avoid rankings, individual productivity scoring, or team-level evaluation language
- label estimated, backfilled, inferred, and real-time data differently

## Track 3: Observability Confidence

Before expanding to many more agents or platforms, make trust in the observed data visible.

Near-term work:

- show which integrations are live, backfilled, estimated, degraded, or unsupported
- expose event-delivery reliability and recent ingestion gaps in diagnostics
- make terminal delivery capabilities explicit: tmux, WezTerm, kitty, iTerm2, and Ghostty are supported; Terminal.app and Warp remain outside reliable message-send support
- keep unknown upstream payloads in adapter calibration work, not renderer-specific guessing
- keep Provider Gateway quota surfaces honest: MiMo quota remains dashboard/manual until a stable official quota API exists

## Track 4: Ambient Presence

Ambient UI should compress real value, not replace it.

Treat Dynamic Island / menu bar / mini presence work as a follow-up after session review and workflow-health value exists.

Good ambient candidates:

- glanceable running / waiting state
- quota or rate-limit pressure
- sessions that need follow-up after ending
- degraded integration state

Avoid:

- adding decorative surfaces before deciding which signals are genuinely high-frequency
- moving approval interception back into CodePal

## Track 5: Individual-First Paid Value

Paid functionality should start with individual local value.

Potential Pro direction:

- longer local history retention and richer analytics ranges
- advanced session review and day digest
- redacted report export
- project / repository grouping
- more detailed observability-confidence diagnostics
- configurable workflow-health thresholds and notifications

Do not start with billing implementation. First validate whether users keep the app open and come back to the review/digest surfaces.

## Track 6: Team Later, With A New Trust Model

Team features are a later phase, not the next step.

If pursued, the first team layer should be shared operational visibility, not productivity scoring:

- shared degraded-integration or quota-pressure awareness
- opt-in redacted session summaries
- aggregate workflow-health trends without personal rankings
- explicit role-based visibility for summary versus content

Team/cloud work requires updating the privacy and support documents before release readiness:

- what is shared
- who can read it
- whether prompts, paths, code snippets, or assistant output are included
- where data is stored
- how redaction and opt-out work

## Explicitly Deferred

- freeform `text_input`
- restoring CodePal as a Claude approval intermediary
- JetBrains workspace activation guarantees
- team dashboards that score individual developers
- cloud sync or remote analytics without a redesigned privacy model
- Windows support before the macOS interaction model and release workflow remain stable over time

## Decision Order

If planning effort is limited, use this order:

1. design and validate session review
2. add day digest and local report export
3. add workflow-health signals and observability-confidence labels
4. decide whether individual Pro value is strong enough to price
5. only then revisit ambient surfaces, team sharing, cloud sync, broader control flows, and new platforms
