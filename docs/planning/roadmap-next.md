# Roadmap Next

## Purpose

This document captures the product direction after the shipped v1.1.11 baseline.

It is not a date-based promise list. It is a prioritization guide for what should happen next, in what order, and why. It is an additive roadmap: valuable existing directions remain in scope, and the new session-operations / free-growth strategy is folded into them rather than replacing them.

## Current Baseline

CodePal is already more than a single floating session list. The shipped baseline includes:

- unified monitoring for Cursor, Claude Code, Codex, CodeBuddy, and GoLand / PyCharm through the shared CodeBuddy JetBrains path
- local session history and on-demand expanded timelines
- token usage analytics, backfill, estimated costs, and HTML reports
- native notifications, click-to-navigate, and capability-gated terminal message delivery
- integration diagnostics, local repair, and Provider Gateway setup for supported desktop clients
- signed / notarized macOS release packaging and updater metadata validation

The next roadmap should build on that local data foundation instead of adding speculative control loops too early.

## Product Positioning

CodePal should become the free local AI coding control tower and operations memory for heavy AI-coding users.

CodePal is:

- a local AI coding workflow observation layer
- a cross-agent session control surface
- a personal AI coding worklog
- an agent session operations layer
- a workflow-health diagnostic tool
- a daily AI work review tool
- a free entry point and gathering layer for heavy AI-coding users

CodePal is not:

- bossware
- a team performance analytics product
- an approval interceptor
- a replacement execution platform for Claude Code, Cursor, Codex, or CodeBuddy
- an autonomous agent scheduler
- a paid dashboard roadmap in disguise

## Planning Principle

CodePal should become a local AI coding operations memory layer for heavy AI-coding users.

That means:

- keep the monitoring-first trust boundary
- turn existing session, usage, and timeline data into useful after-the-fact understanding
- measure workflow health and tool friction, not developer productivity scores
- make observability confidence visible wherever data may be partial, estimated, inferred, or best-effort
- guide the user's attention without taking execution control
- allow bounded user-triggered operations where adapter capability and preflight checks make them safe enough
- prove sustained free individual value before team sharing, billing, cloud sync, or broader control surfaces

Research source: `docs/planning/research/deep-research-report.md`.

## Free Growth Constraint

Medium-term and long-term planning should not be pulled by monetization yet.

Current product decisions should optimize for:

- daily open rate among heavy AI-coding users
- long-term local trust
- habit formation around session review and daily digest
- active recommendation to other developers
- community contribution of adapters, templates, schemas, and troubleshooting knowledge

Do not design the next roadmap as Pro / Team / Enterprise packaging. Future commercial possibilities can exist, but they are not the current product driver. The current job is to make CodePal strong enough as a free local control tower that heavy users naturally gather around it.

Free should mean complete for the core personal workflow:

- free session history
- free session review cards
- free day digest
- free agent usage overview
- free local reports
- free integration repair
- free templates
- free workflow-health diagnostics
- free observation confidence labels
- free local export
- free adapter ecosystem and contribution guide
- free community shared prompt / review templates using sanitized data

## Track 0: Session Operations Layer

This is the nearest action-oriented addition to the existing monitoring foundation.

Goal: move from observe-only into user-triggered operations without changing the trust boundary.

Near-term capabilities:

- session card action bar
- jump to terminal / IDE
- open repo
- send structured follow-up message when a reliable terminal channel exists
- resume session when the adapter exposes a reliable path
- repair integration
- export review
- mark outcome
- close / archive session
- local action log
- action confidence
- capability-gated UI

Design rules:

- every action is explicitly user-triggered
- every action runs a preflight
- every action checks adapter capability
- every action writes a local log entry
- failures explain what happened in user-readable language
- best-effort actions are labeled as best-effort before execution
- no action is sent to a cloud service by default

Preferred product names:

- Session Operations Layer
- Agent Operator
- Local Agent Control Surface
- Attention Queue

Avoid calling this an agent scheduler.

### Capability Manifest

Each agent adapter should expose a capability manifest so the UI can show available actions and confidence instead of pretending every agent supports the same controls.

Example capabilities:

- `observeSession`
- `observeUsage`
- `jumpToSession`
- `sendStructuredMessage`
- `resumeSession`
- `startSession`
- `stopSession`
- `repairIntegration`
- `exportTranscript`
- `estimateCost`
- `observeQuota`
- `observeContextPressure`

Each capability should include:

- support level: `supported`, `partial`, `best_effort`, or `unsupported`
- source: hook, log, transcript, terminal, provider, or manual
- confidence: high, medium, or low
- caveats
- preflight requirements
- user-readable failure reasons

### Action Broker

CodePal should centralize user-triggered operations through a local action broker.

Action types:

- `jump`
- `send_message`
- `resume`
- `open_repo`
- `repair_integration`
- `export_review`
- `mark_outcome`
- `close_session`
- `archive_session`

Broker lifecycle:

1. user triggers an action
2. broker loads session state and adapter capability
3. broker runs preflight
4. broker shows confidence, target, and caveats when needed
5. user confirms when the action is risky or best-effort
6. broker executes locally
7. broker records a local action log
8. broker reports success or a user-readable failure
9. review cards and timelines can include the action history

## Track 1: Personal AI Work Memory

This remains the highest-leverage product layer.

Goal: make CodePal useful not only while an agent is running, but also when the user wants to understand what happened after the work is done.

Near-term capabilities:

- session review cards / pages that summarize duration, major phases, waiting/error periods, model usage, token/cost totals, completion state, and outcome
- deterministic first-pass summaries that do not depend on LLM-generated text
- optional LLM summaries only when they are local-controllable, disableable, and redaction-aware
- daily digest view across agents: what ran, what finished, what stalled, where usage concentrated, and which sessions need follow-up
- exportable local reports in HTML / Markdown with redaction controls for prompts, paths, and assistant content
- better session titles and grouping by project / repository when the source path is reliable
- local-only retention controls that separate detailed transcript-like history from aggregate analytics

Session review cards should include:

- agent type
- repo / project
- session start and end time
- duration
- completion / interruption / idle / error state
- resume events
- context compact / compression signals
- token usage
- estimated cost
- major activity timeline
- waiting time
- user intervention count
- jump / message / repair / export / mark-outcome action history
- session outcome marker
- data confidence

Why first:

- it uses the existing history SQLite, usage backfill, Analytics page, and HTML report foundation
- it gives users a reason to open CodePal at the end of the day, not only when something is stuck
- it fits the local privacy contract better than team dashboards or remote analytics

## Track 2: Workflow Health

CodePal should move toward workflow-quality diagnostics without becoming a bossware or performance-scoring product.

Useful signals:

- waiting time: how long sessions spend in waiting / idle gaps
- idle time: how long active-looking work has gone quiet
- error recovery: how often sessions error and whether they later resume or complete
- session churn: repeated aborts, restarts, compactions, or subexecution-heavy runs
- context pressure: context compaction, model switching, or very large token runs where upstream signals allow it
- quota pressure: local usage, estimated cost, and last-known rate-limit snapshots
- abnormal cost: token / cost outliers relative to recent personal history
- unresolved work: completed or idle sessions without a clear outcome
- observability coverage: how much work CodePal could confidently observe versus infer or miss

Design rules:

- present these as personal workflow-health signals
- avoid rankings, individual productivity scoring, or team-level evaluation language
- label estimated, backfilled, inferred, and real-time data differently
- show missing data explicitly instead of hiding gaps behind polished charts

## Track 3: Observability Confidence

Before expanding to many more agents or platforms, make trust in the observed data visible.

Near-term work:

- show which integrations are live, backfilled, estimated, degraded, or unsupported
- expose event-delivery reliability and recent ingestion gaps in diagnostics
- label usage rows, cost estimates, timeline segments, session reviews, and digests by data source and confidence
- make terminal delivery capabilities explicit: tmux, WezTerm, kitty, iTerm2, and Ghostty are supported; Terminal.app and Warp remain outside reliable message-send support
- keep unknown upstream payloads in adapter calibration work, not renderer-specific guessing
- keep Provider Gateway quota surfaces honest: MiMo quota remains dashboard/manual until a stable official quota API exists

Each confidence label should distinguish:

- data source
- live observation vs log backfill
- reported value vs estimated value
- deduped / cleaned status
- best-effort status
- known missing fields
- adapter completeness
- terminal path stability

## Track 4: Attention Queue And Ambient Presence

Ambient UI should compress real value, not replace it.

The valuable layer is Attention Queue: it routes the user's attention to sessions and integrations that need action. Menu bar / mini presence work should follow once those signals are useful.

Attention Queue candidates:

- running sessions
- sessions waiting for decision
- sessions idle too long
- errored sessions
- sessions that should be resumed
- sessions that should be closed or reviewed
- abnormal token / cost consumption
- integrations that need repair
- repos with unusually dense AI activity
- quota or context pressure

Good ambient candidates:

- glanceable running / waiting state
- needs-attention count
- quota or rate-limit pressure
- sessions that need follow-up after ending
- degraded integration state
- review reminder

Avoid:

- adding decorative surfaces before deciding which signals are genuinely high-frequency
- spamming notifications
- moving approval interception back into CodePal

## Track 5: Community And Ecosystem

This track strengthens the free user-gathering strategy without adding team surveillance or paid analytics.

Useful community surfaces:

- community prompt templates
- session review templates
- adapter contribution guide
- report schema
- local-first export format
- workflow-health recipes
- public examples with sanitized data
- GitHub integration docs
- issue-based adapter requests
- community troubleshooting knowledge base

Privacy-preserving sharing rules:

- users share templates, schemas, recipes, and sanitized examples
- no default transcript upload
- no default telemetry
- no hidden cloud analytics pipeline
- all report exports are local-first and redaction-aware

## Track 6: Optional Shared Ops Visibility

Team features are a later phase, not the next step.

If pursued, the first team layer should be shared operational visibility, not productivity scoring:

- shared degraded-integration or quota-pressure awareness
- shared anonymized workflow issues
- shared templates
- shared adapter configs
- shared troubleshooting knowledge
- opt-in redacted session summaries
- aggregate workflow-health trends without personal rankings
- explicit role-based visibility for summary versus content

Do not build:

- team admin dashboards that score individual developers
- AI usage rankings
- leaderboards
- manager productivity analytics
- developer surveillance

Team/cloud work requires updating the privacy and support documents before release readiness:

- what is shared
- who can read it
- whether prompts, paths, code snippets, or assistant output are included
- where data is stored
- how redaction and opt-out work

## Commercialization Note

The previous "individual-first paid value" idea remains a possible future discussion, but it should not drive this roadmap.

If commercial work is ever revisited, it should:

- start from proven individual local value
- avoid gating the core personal workflow behind payment
- avoid turning free into a crippled edition
- avoid pulling the product toward team surveillance
- come after durable daily usage and trust are validated

Do not start with billing implementation. First validate whether users keep the app open and come back to the review / digest / attention surfaces.

## Explicitly Deferred

- Pro / Team / Enterprise packaging as a roadmap driver
- freeform `text_input` as a universal agent console
- restoring CodePal as a Claude approval intermediary
- JetBrains workspace activation guarantees
- team dashboards that score individual developers
- cloud sync or remote analytics without a redesigned privacy model
- Windows support before the macOS interaction model and release workflow remain stable over time
- auto approval
- approval interception
- auto task splitting
- auto agent selection
- auto opening multiple CLI sessions
- auto command execution
- auto result merging
- auto model switching by cost
- background autonomous execution queues

## Decision Order

If planning effort is limited, use this order:

1. define capability manifest and action broker primitives
2. ship Session Operations MVP
3. design and validate session review
4. add observability-confidence labels across review, usage, timelines, diagnostics, and operations
5. add day digest and local report export
6. add workflow-health signals and Attention Queue
7. add ambient presence only after attention signals are useful
8. open community templates, schemas, and adapter contribution paths
9. only then revisit optional shared ops visibility, cloud sync, broader control flows, new platforms, or commercial packaging
