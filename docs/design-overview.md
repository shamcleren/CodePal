# Design Overview

## What CodePal Is

CodePal is a floating desktop monitoring panel for AI coding agents and IDE-integrated agent workflows.

Its Phase 1 job is simple:

- collect session and activity signals from multiple tools
- normalize them into one shared model
- render them in a compact dashboard that stays readable during active work

CodePal is intentionally stronger on visibility than on control.

## Product Goal

Modern agent workflows are fragmented across IDE panes, terminal sessions, browser dashboards, and local hook processes.

CodePal reduces that fragmentation by providing:

- one place to see which agent sessions are active
- one place to inspect meaningful recent activity
- one place to keep usage and quota context visible
- one settings surface for integration diagnostics and local repair
- one local provider gateway that can bridge supported desktop clients to third-party model providers without leaking provider tokens into those clients

## Phase 1 Boundary

Phase 1 is dashboard-first.

The product focus is:

- unified monitoring
- clear session state visibility
- bounded approval / structured-choice handling already present in the app
- low-noise timeline rendering

Phase 1 is explicitly not trying to deliver:

- freeform `text_input`
- a general CodePal -> agent messaging channel
- deep IDE or terminal navigation guarantees
- full control-loop parity across every supported agent

## Product Direction Beyond Phase 1

Phase 1 defines the monitoring-first baseline, not the full product ceiling.

The longer-term direction expands CodePal from a shared monitoring surface into a broader multi-agent operations layer with four major tracks:

- stronger cross-agent control flows
- outbound message delivery into agent surfaces where that becomes safely supportable
- deeper observability across events, health, and reliability
- shared capability abstractions that reduce one-off integration logic

These tracks are intentionally described separately from Phase 1 so the document can capture future direction without overstating current delivery.

## Core User Experience

The main panel should answer four questions quickly:

1. Which sessions matter right now?
2. Which ones are running, waiting, completed, or broken?
3. What just happened inside a session?
4. Am I about to hit usage or quota limits?

The settings window should answer:

1. Is each integration healthy?
2. Is CodePal receiving events correctly?
3. Can the app safely install or repair the local integration config?

## Architecture Shape

CodePal follows a shared monitoring pipeline:

`integration source -> main ingress -> normalization / session update -> session store + history store -> renderer`

Cross-cutting concerns like notifications are implemented as `sessionStore` callbacks rather than per-path wiring. When `sessionStore.applyEvent()` detects a status change, it invokes the registered `onStatusChange` callback, which routes to the notification service. This means every event path (hook ingress, file watchers) automatically gains notification support without adapter-specific code.

Main responsibilities:

- `src/adapters/`
  Normalize upstream agent-specific payloads into shared session/activity semantics
- `src/main/`
  Own desktop lifecycle, ingress, watcher bootstrap, integration repair, provider gateway proxying, usage aggregation, the in-memory session summary store, and the persisted SQLite history store
- `src/renderer/`
  Render the monitoring dashboard and settings UI
- `src/shared/`
  Define shared types used across main and renderer boundaries

## Capability Layers

CodePal is easiest to reason about as a layered product rather than a single dashboard.

### 1. Monitoring Layer

This is the current foundation:

- session ingestion
- activity normalization
- state visibility
- usage and quota visibility
- integration diagnostics

### 2. Action Layer

This layer covers structured actions that can safely round-trip through existing agent or hook semantics.

Current examples already present in bounded form:

- `approval`
- `single_choice`
- `multi_choice`

Longer-term growth here means better cross-agent control-loop coverage, not renderer-only exceptions.

### 3. Messaging Layer

This layer is not part of the current Phase 1 baseline, but it is part of the broader product direction.

Its goal is to support outbound CodePal -> agent message delivery when upstream tools expose safe and stable semantics for:

- session targeting
- prompt ownership
- message delivery acknowledgement
- response correlation

In other words, `send message` belongs to the longer-term architecture, but should not be described as already delivered.

### 4. Capability Unification Layer

This is where future shared abstractions such as ACP / `acpx` belong.

The purpose of this layer would be to unify common agent capabilities behind clearer shared semantics so CodePal does not need to keep growing one-off per-agent adaptations forever.

This layer is explicitly deferred from the current product baseline, but it remains part of the architectural direction.

### 5. Provider Gateway Layer

This layer lets CodePal act as a local provider gateway for desktop AI clients.

Current baseline:

- Claude Desktop can point at CodePal's local Anthropic-compatible gateway.
- CodePal exposes Anthropic-style model names that pass Claude Desktop local validation.
- CodePal rewrites those names to upstream provider model IDs before forwarding.
- Codex Desktop can point at CodePal's OpenAI Responses-compatible endpoint.
- CodePal adapts Codex `/v1/responses` requests into Anthropic-compatible `/v1/messages` calls for the active provider.
- Client auto-setup adds and can activate a Claude Desktop `CodePal Gateway` entry, and adds a Codex Desktop `codepal-mimo` profile. Explicit switch actions save the previous client defaults before writing CodePal as the active provider, so restore can put the previous default provider back.
- Provider token storage, model mappings, health checks, and client setup live in CodePal settings.

Design boundary:

- Client configs store only the local CodePal gateway URL and dummy local auth values.
- Real provider tokens stay in CodePal's local secret store or environment fallback.
- Provider-specific behavior is config-driven through provider profiles and model mappings, not hard-coded into renderer UI.

## Monitoring Model

The product depends on a shared session model rather than tool-specific renderer logic.

Each integration should map into common concepts:

- session identity
- session state
- recent user prompt timing
- timeline activity items
- optional pending action metadata
- optional usage / quota data

This keeps the renderer simple and avoids per-tool UI forks.

The renderer still treats the dashboard list as a summary surface. Full retained history is loaded only when a session row is expanded, so restart-safe history does not degrade the main monitoring path.

On startup, recent user-initiated sessions (last 24 hours, up to 150) are restored from the SQLite history store into the in-memory session store. This means the dashboard is immediately populated after an app update or restart without resurfacing lifecycle-only noise such as bare "session ended" rows. Restored sessions that were `running` or `waiting` at shutdown are normalized to `idle`, and live hook events always take precedence over restored state.

## Integration Strategy

CodePal supports multiple intake styles because upstream tools expose different surfaces.

Current patterns include:

- executable hook ingress
- local session-log watching
- local transcript watching
- usage-specific aggregation services

The design rule is to normalize at the edge and preserve shared types in the middle.

## Future Observability Direction

Today, CodePal is primarily a monitoring product built around sessions, timelines, and usage visibility.

Over time, observability may expand beyond that baseline into richer operational coverage such as:

- source health and event-delivery reliability
- ingestion diagnostics and gap detection
- event-rate and backlog visibility
- per-integration warning surfaces
- structured logs, metrics, and trace-like correlation for debugging adapter behavior

The intent is not to turn CodePal into a generic infrastructure observability suite.

The intent is to make multi-agent operations more trustworthy by showing whether CodePal is receiving, correlating, and representing upstream signals correctly.

## Supported Surfaces Today

### Cursor

- hook-driven monitoring path
- timeline normalization
- dashboard quota sync
- user-level config repair

### Claude Code

- local transcript/session-log monitoring
- timeline normalization
- first-pass token usage visibility
- can use Claude Desktop / Claude Code third-party inference through the local CodePal provider gateway when the desktop client is configured for Gateway mode

### Codex

- session-log driven monitoring
- timeline normalization
- notify hook groundwork in settings, but not a completed live approval loop
- usage visibility in the shared monitoring surface
- can use the local CodePal provider gateway through a Codex `model_provider` using `wire_api = "responses"`

### CodeBuddy

- hook normalization plus local transcript watching
- dashboard timeline integration
- monthly quota sync in settings
- user-level config repair

### GoLand / PyCharm

- shared JetBrains watcher path through the CodeBuddy plugin framework
- shared monitoring and usage visibility within the current calibrated scope

## UI Principles

The default panel should feel like a usable dashboard, not a control console.

That means:

- flat session ordering by recent relevance
- stronger state visibility for `running` vs `waiting`
- expanded timelines that privilege assistant and tool signal
- suppression of low-information status noise
- hover details instead of forcing navigation
- compact usage display in the header

## Settings Principles

Settings should be operational, not decorative.

They exist to:

- expose integration health clearly
- show the current listener / entrypoint status
- repair supported user config safely
- manage local provider gateway profiles, model mappings, health checks, and client setup
- keep display and usage preferences visible but secondary

Invalid existing config should be reported, not silently overwritten.

## Known Design Constraints

- upstream payload quality still varies across tools
- some tools have stronger monitoring support than control-loop support
- usage sources are not equally mature across all integrations
- signed / notarized macOS distribution depends on release credentials staying configured and verified
- future message-send, observability, and capability-unification work all depend on upstream APIs or hook semantics becoming stable enough to support them cleanly

## Source Of Truth

Use these documents in this order:

1. `README.md` for repository-facing overview
2. `docs/design-overview.md` for product and architecture framing
3. `docs/context/current-status.md` for implementation baseline, shipped behavior, and active gaps

Historical handoff notes under `docs/context/` are supporting context, not the primary design contract.
