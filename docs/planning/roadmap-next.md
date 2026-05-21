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

The current post-v1.1.11 development baseline also adds:

- capability manifest and local action broker primitives for bounded Session Operations
- a compact session action surface with jump, inline message, and list-level delete placement
- footer-level per-session usage stats for requests, input, output, cache, and estimated cost
- two built-in semantic visual themes, `graphite-ops` and `paper-ops`, with theme-aware session footer and Analytics surfaces

The next roadmap should build on that local data foundation instead of adding speculative control loops too early.

## Next Version Scope

The next version should pivot from passive review UI to actionable workflow infrastructure.

Ship in the next version:

- Work Item Flow MVP:
  - derive work items from sessions, status changes, pending states, errors, and user-triggered operations
  - support states such as `waiting`, `needs_follow_up`, `failed`, `completed`, and `deferred`
  - group items by project / repository when the source path is reliable
  - keep item titles and next actions concise enough to scan in the main workflow
- CLI Operation Flow MVP:
  - expose a bounded operation surface for target terminal / agent sessions
  - run preflight before execution
  - support dry-run where the operation type allows it
  - record execute result, error, timestamp, target, and source session into a local operation log
  - keep operations explicitly user-triggered; do not add autonomous scheduling or automatic execution queues
- Report Facts layer:
  - build a deterministic daily / weekly / monthly facts object from work items, operation logs, session status, and usage stats
  - include requests, input, output, cache, estimated cost, completed / failed / follow-up counts, and notable operation results
  - treat this facts object as the only supported input to reports; do not ask an LLM to summarize raw transcripts by default
- Manual LLM report generation:
  - allow manual generation of daily / weekly / monthly reports after the Report Facts layer exists
  - gate all LLM report generation behind an explicit settings switch because it spends the user's model quota
  - provide a model selector and default to the cheapest configured model that is capable of summarization
  - show the selected model and an estimated token / cost range before generation when pricing data is available
  - default to a lower-cost configured model because the hard fact extraction is deterministic
  - keep stronger models as an optional deep-analysis path, not the default
  - keep any background / automatic report generation opt-in only, with a clear quota warning
  - require redaction controls before prompts, paths, assistant content, command output, or repo identifiers leave the local app

Do not ship in the next version:

- top-level ReviewCard
- Review Page
- static Digest tab that only restates session logs
- subjective data-confidence badges
- LLM summaries over unbounded raw transcripts
- autonomous CLI execution, auto-approval, auto-merge, or auto task assignment

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
- show factual source and coverage where data may be partial, estimated, inferred, or best-effort
- guide the user's attention without taking execution control
- allow bounded user-triggered operations where adapter capability and preflight checks make them safe enough
- prove sustained free individual value before team sharing, billing, cloud sync, or broader control surfaces

Research source: `docs/planning/research/deep-research-report.md`.

## Free Growth Constraint

Medium-term and long-term planning should not be pulled by monetization yet.

Current product decisions should optimize for:

- daily open rate among heavy AI-coding users
- long-term local trust
- habit formation around work item flow, CLI operation flow, and useful LLM reports
- active recommendation to other developers
- community contribution of adapters, templates, schemas, and troubleshooting knowledge

Do not design the next roadmap as Pro / Team / Enterprise packaging. Future commercial possibilities can exist, but they are not the current product driver. The current job is to make CodePal strong enough as a free local control tower that heavy users naturally gather around it.

Free should mean complete for the core personal workflow:

- free session history
- free work item flow
- free CLI operation flow
- free daily / weekly / monthly reports when LLM generation is useful
- free agent usage overview
- free local reports
- free integration repair
- free templates
- free workflow-health diagnostics
- free factual source and coverage indicators where they affect decisions
- free local export
- free adapter ecosystem and contribution guide
- free community shared prompt / review templates using sanitized data

## Track 0: Session Operations Layer

This is the nearest action-oriented addition to the existing monitoring foundation.

Goal: move from observe-only into user-triggered operations without changing the trust boundary.

Near-term capabilities:

- session card action bar (detail view): jump to terminal / IDE
- open repo (deferred: workspacePath rarely available from session data; reintroduce when path extraction is reliable)
- send structured follow-up message when a reliable terminal channel exists (inline input, not in action bar)
- resume session when the adapter exposes a reliable path
- repair integration
- export report (deferred until Report Facts and redaction controls exist)
- delete session (list-level action, not in action bar)
- local action log
- action confidence
- capability-gated UI

Deferred / removed from MVP:

- mark outcome — removed: the footer usage summary does not need manual tagging; outcome should be derived from work item flow if it becomes useful
- close / archive session — renamed to "delete session" and moved to list-level; users should not need to open a session detail to delete it

Action placement rules:

- action bar (inside session detail): navigation and interaction actions that operate on the live session context (jump, open repo, send message)
- list-level (session row in the main list): destructive or structural actions that do not require opening the detail view (delete session)
- do not place destructive actions inside the detail view; do not place context-dependent actions at the list level

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

- `jump` (action bar)
- `send_message` (inline input)
- `resume` (action bar)
- `open_repo` (deferred — workspacePath rarely available)
- `repair_integration` (action bar)
- `export_report` (deferred until Report Facts and redaction controls exist)
- `delete_session` (list-level)

Note: `mark_outcome`, `close_session`, and `archive_session` are removed from the action type list. Outcome should be auto-inferred, not manually tagged. Session removal is `delete_session` at list level.

Broker lifecycle:

1. user triggers an action
2. broker loads session state and adapter capability
3. broker runs preflight
4. broker shows confidence, target, and caveats when needed
5. user confirms when the action is risky or best-effort
6. broker executes locally
7. broker records a local action log
8. broker reports success or a user-readable failure
9. work items, operation logs, and future reports can include the action history

## Track 1: Work Items, CLI Operation Flow, And Reports

This remains the highest-leverage product layer.

Goal: make CodePal useful when work needs to move forward, not merely when the user wants to reread what happened.

Already started in the current development baseline:

- deterministic per-session usage stats stay in the expanded footer: requests, input, output, cache, and estimated cost
- heavy ReviewCard UI is intentionally not the primary surface
- theme-aware footer and analytics surfaces remain readable in both dark and light themes

Next increments:

- Report Facts layer: deterministic input for daily / weekly / monthly reports
- work item flow: waiting, needs follow-up, failed, completed, and deferred items across agents
- CLI operation flow: target terminal, preflight, dry-run, execute, result, and local action log
- LLM-generated daily / weekly / monthly reports from work items and operation logs, not from a static metric card
- redaction controls for prompts, paths, assistant content, command output, and repo identifiers before report export
- better item titles and grouping by project / repository when the source path is reliable
- local-only retention controls that separate detailed transcript-like history from aggregate analytics

The footer-level usage summary may cover:

- request count
- input tokens
- output tokens
- cache tokens
- estimated cost

Work item and CLI operation flow should add:

- repo / project
- current owner / next action
- linked sessions and terminal targets
- preflight status and dry-run output
- execution result and local action history
- follow-up / failed / completed state transitions
- report export and redaction metadata

LLM report rules:

- reports are generated only from Report Facts plus selected operation-log excerpts, not from unbounded raw transcripts
- LLM report generation must be controlled by a settings switch because it spends the user's quota
- users must be able to choose the report model; default to the cheapest configured summarization-capable model
- background report generation must stay opt-in and show a quota/cost warning
- the default model should be a lower-cost configured model; expensive models are opt-in for deeper analysis
- generation should be manual in the next version, not scheduled or automatic
- redaction must run before report prompts leave the local app

Why first:

- it converts CodePal from passive monitoring into useful local operation handoff
- it gives users a reason to keep CodePal open during active work, not only at the end of the day
- it creates the structured substrate that LLM daily / weekly / monthly reports actually need
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

## Track 3: Source And Coverage Transparency

Before expanding to many more agents or platforms, make the source and coverage of important data visible without pretending CodePal can assign a universal confidence score.

Near-term work:

- show which integrations are live, backfilled, estimated, degraded, or unsupported
- expose event-delivery reliability and recent ingestion gaps in diagnostics
- label usage rows, cost estimates, timelines, work items, CLI operations, and reports by concrete data source when it affects user decisions
- make terminal delivery capabilities explicit: tmux, WezTerm, kitty, iTerm2, and Ghostty are supported; Terminal.app and Warp remain outside reliable message-send support
- keep unknown upstream payloads in adapter calibration work, not renderer-specific guessing
- keep Provider Gateway quota surfaces honest: MiMo quota remains dashboard/manual until a stable official quota API exists

Each source / coverage indicator should distinguish only factual provenance:

- data source
- live observation vs log backfill
- reported value vs estimated value
- deduped / cleaned status
- best-effort status
- known missing fields
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

Do not start with billing implementation. First validate whether users keep the app open and come back to the work item flow, CLI operation flow, report generation, and attention surfaces.

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

1. ~~define capability manifest and action broker primitives~~ — done (v1.2.0-dev)
2. ship Session Operations MVP — revised scope:
   - capability manifest: done
   - action broker: done (jump, sendMessage)
   - session action bar: jump only (detail view)
   - send message: inline input (already working)
   - delete session: list-level button (done)
   - ~~open repo~~: deferred — workspacePath rarely available
   - ~~mark outcome~~: removed — derive outcome from work item flow if it becomes useful
   - ~~close session~~: replaced by delete_session at list level
3. keep deterministic per-session stats at the footer level:
   - requests / input / output / cache / estimated cost: started
   - top-level ReviewCard / Review Page: deferred unless it enables a concrete action
4. define Report Facts schema for daily / weekly / monthly reports
5. design and validate work item flow plus CLI operation flow
6. add manual LLM-generated daily / weekly / monthly reports on top of Report Facts and local operation logs
7. add factual source / coverage indicators only where they change user decisions
8. add workflow-health signals and Attention Queue
9. add ambient presence only after attention signals are useful
10. open community templates, schemas, and adapter contribution paths
11. only then revisit optional shared ops visibility, cloud sync, broader control flows, new platforms, or commercial packaging
