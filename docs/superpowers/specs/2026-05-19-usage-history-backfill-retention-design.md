# Usage History Backfill, Retention, and Analytics Design

## Context

CodePal v1.1.6 added a standalone Analytics page backed by the local
`token_usage` table in `history.sqlite`. The first version covers date ranges,
summary cards, a daily trend chart, a per-model table, and an HTML report.

That table is currently populated only when CodePal observes live Claude,
Codex, or CodeBuddy usage events after installation. It also shares the same
cleanup policy as detailed session history:

- default retention: 2 days
- default storage cap: 100 MB
- automatic cleanup deletes old `token_usage` rows together with session
  activity/debug rows

This is too short for token analytics. Usage trends are most useful over weeks
or months, and a new user should see historical Claude/Codex usage immediately
when local upstream logs already exist. The analysis surface also needs more
shape: users should be able to answer what drove spend, which models or agents
dominated, whether cache helped, and which sessions or time windows were
unusually expensive.

The import design borrows the proven local-log approach used by
`miss-you/codetok`: read Claude Code JSONL files under
`~/.claude/projects/**/*.jsonl` and Codex JSONL files under
`~/.codex/sessions/**/*.jsonl`, then aggregate token counters already emitted
by those tools instead of retokenizing prompts locally.

The analytics design also borrows from `ccusage`, Token Tracker, and Claude's
official analytics docs:

- `ccusage` exposes daily, weekly, monthly, session, block, model, cache, JSON,
  and responsive compact views.
- Token Tracker emphasizes local-first, multi-agent, token-count-only metrics.
- Claude's official analytics focuses on summary metrics, charts, adoption, data
  export, and explicitly separates usage metrics from contribution metrics.

Reference links:

- `miss-you/codetok`: https://github.com/miss-you/codetok
- `ccusage`: https://github.com/ryoppippi/ccusage
- `ccusage` daily reports: https://ccusage.com/guide/daily-reports
- `ccusage` Codex daily reports: https://ccusage.com/guide/codex/daily
- `ccusage` blocks reports: https://ccusage.com/guide/blocks-reports
- Token Tracker: https://www.tokentracker.cc/
- Claude Code analytics docs: https://code.claude.com/docs/en/analytics

## Goals

- Backfill Claude and Codex token usage from existing local logs on first run.
- Make Analytics useful immediately for new installs and upgrades.
- Retain token analytics much longer than detailed session content.
- Keep detailed session activity history bounded by default.
- Remove automatic size-based deletion as a default behavior.
- Make Analytics more diagnostic, not just decorative.
- Preserve the user's current stacked daily chart direction.
- Add agent/model/session/time-window views without turning the app into a
  billing console.
- Keep all cleanup local to CodePal-managed SQLite data; never delete upstream
  Claude or Codex logs.
- Make imported data idempotent so repeated scans do not duplicate usage.

## Non-Goals

- Do not call provider billing APIs.
- Do not claim billing-grade cost accuracy.
- Do not parse or store full raw upstream prompts for analytics backfill.
- Do not delete files under `~/.claude`, `~/.codex`, `~/.cursor`,
  `~/.codebuddy`, or JetBrains roots.
- Do not import Cursor cloud billing history in this change.
- Do not add team, leaderboard, PR attribution, or accepted-lines analytics.
- Do not make provider billing dashboards the source of truth.
- Do not turn Analytics into a marketing-style dashboard. It should remain a
  compact operational surface.

## Current Behavior

### Live Usage Writes

Claude live usage comes from assistant entries with `message.usage`:

- `input_tokens`
- `output_tokens`
- `cache_read_input_tokens`
- `cache_creation_input_tokens`

Codex live usage comes from `event_msg` entries with
`payload.type = "token_count"`:

- `input_tokens`
- `output_tokens`
- `cached_input_tokens`
- `reasoning_output_tokens`

The current Codex watcher prefers `last_token_usage` when present, falling back
to `total_token_usage`.

### Cleanup

`historyStore.runCleanup()` currently applies the same time cutoff to:

- `session_activity_items`
- `session_event_debug`
- `token_usage`

Then it enforces `maxStorageMb` by deleting oldest activity/debug/token rows
until the database is under the cap. This can silently remove long-range
analytics data.

## Proposed Behavior

Use separate retention policies for two kinds of data:

1. Analytics token data
   Small, numeric, useful for long-term trend analysis.
2. Detailed session history
   Larger, content-bearing, more privacy-sensitive.

Recommended defaults:

- analytics token retention: `forever`
- detailed session history retention: `30 days`
- automatic max-size cleanup: removed from default behavior

The settings UI should show current database size and manual cleanup actions,
but size alone should not automatically delete analytics data.

Analytics should grow from a simple overview into a compact analysis workspace:

- summary cards for tokens, requests, cache hit rate, estimated cost, top model,
  and top agent
- stacked daily trend showing input, output, cache read, and cache creation
- agent and model breakdown table with sortable columns
- expensive sessions table for finding outliers
- optional weekly/monthly grouping for longer ranges
- import status for historical Claude/Codex backfill
- HTML report with the same metrics, suitable for sharing or archiving

## Settings Model

Replace the current history settings shape:

```ts
type HistorySettings = {
  persistenceEnabled: boolean;
  retentionDays: number;
  maxStorageMb: number;
};
```

with a split model:

```ts
type RetentionPreset = "30d" | "90d" | "180d" | "365d" | "forever";

type HistorySettings = {
  persistenceEnabled: boolean;
  detailRetention: RetentionPreset;
  analyticsRetention: RetentionPreset;
};
```

Migration behavior:

- Existing `retentionDays` maps to `detailRetention`.
- Existing `maxStorageMb` is ignored for cleanup but can be dropped only after
  settings normalization safely handles old configs.
- Existing users with no explicit history settings get:
  - `detailRetention: "30d"`
  - `analyticsRetention: "forever"`

Optional follow-up:

- If a future release needs disk guardrails, add warning thresholds and manual
  cleanup prompts instead of silent size-based deletion.

## Data Model

Keep `token_usage` in the existing `history.sqlite`, but make token rows
idempotent.

Add source metadata columns:

- `source_key TEXT`
- `source_kind TEXT`

Suggested `source_kind` values:

- `claude-assistant-usage`
- `codex-token-count-delta`
- `codex-token-count-total`
- `codebuddy-function-call`

Add a unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_source_key
  ON token_usage (agent, source_key)
  WHERE source_key IS NOT NULL;
```

For live events, source keys should be stable when upstream data exposes a
stable id. When no stable key exists, keep the existing append behavior rather
than inventing weak keys.

For backfilled events, source keys are mandatory.

Add derived query shapes rather than duplicating derived data:

- daily token stats
- weekly token stats
- monthly token stats
- model token stats
- agent token stats
- session token stats
- import diagnostics

These can be backed by SQL aggregation over `token_usage` and the existing
`sessions` table.

## Claude Backfill

Scan:

```text
~/.claude/projects/**/*.jsonl
```

Parse only assistant entries that contain `message.usage`.

Deduplication:

- Prefer a composite key based on `message.id` plus request id when available.
- If request id is absent, use `sessionId + message.id`.
- If neither is available, use `file path + byte offset` as a last-resort key.

Streaming behavior:

- Claude JSONL can contain streaming or repeated assistant usage entries.
- Backfill should group by the dedupe key and use last-entry-wins before writing
  to `token_usage`.

Token mapping:

- `input_tokens` -> `inputTokens`
- `output_tokens` -> `outputTokens`
- `cache_read_input_tokens` -> `cacheReadTokens`
- `cache_creation_input_tokens` -> `cacheCreationTokens`

Model mapping:

- Use `message.model` when present.
- Leave model `NULL` only when the upstream log does not provide one.

## Codex Backfill

Scan:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
```

Parse `event_msg` entries with `payload.type = "token_count"`.

Model mapping:

- Track model from `turn_context.payload.model` per session.
- Use that model for subsequent `token_count` rows.

Deduplication and counting:

Codex logs can expose both incremental and cumulative counters. The backfill
must not double count them.

Recommended policy:

1. If `last_token_usage` is present:
   - Treat it as an event-level delta.
   - Write one row per token_count event.
   - Source key: `codex:<sessionId>:<timestamp>:<event-index>`.
2. If only `total_token_usage` is present:
   - Treat it as a session cumulative snapshot.
   - Write only the final snapshot per session.
   - Source key: `codex:<sessionId>:final-total`.

When both are present, use `last_token_usage` for historical event rows and
ignore `total_token_usage` for cost aggregation. `total_token_usage` can still
be retained in diagnostic metadata if needed later.

Token mapping:

- `input_tokens` -> `inputTokens`
- `output_tokens` -> `outputTokens`
- `cached_input_tokens` -> `cacheReadTokens`
- `reasoning_output_tokens` -> `reasoningTokens`

Reasoning tokens should remain visible as tokens but should not be included in
estimated cost unless a model pricing record explicitly supports a separate
reasoning rate in a future schema.

## Import Lifecycle

Run backfill automatically when:

- CodePal starts and history persistence is enabled.
- The app detects that the current history database has not completed a usage
  backfill for the current importer version.

Track progress in `history_meta`:

- `usage_backfill_version`
- `usage_backfill_completed_at`
- `usage_backfill_last_error`

The backfill should:

- run in the background after the main window is usable
- process files in bounded batches
- skip unreadable or malformed files without failing the whole import
- periodically refresh Analytics diagnostics when new rows are imported

Manual action:

- Add a "Re-import local Claude/Codex usage" action for users who want to rescan
  after deleting CodePal history or after a parser fix.

## Analytics UX

The page should stay dense and operational. It should not look like a sales
dashboard. The first viewport should answer:

1. How much did I use?
2. What did it probably cost?
3. Which agent/model caused most of it?
4. Is cache helping or just inflating total tokens?
5. Did any day or session spike?

### Range Controls

Keep the existing presets:

- today
- 7d
- 30d
- custom

Add longer-range grouping behavior:

- For ranges up to 45 days, default chart grouping is daily.
- For ranges above 45 days, default chart grouping is weekly.
- For ranges above 180 days, monthly becomes available and recommended.

The selected grouping should apply to both the in-app chart and HTML report.

### Summary Cards

Keep the current cards and add:

- estimated cost label remains explicit
- top agent by total tokens
- top model by estimated cost
- cache read total
- cache creation total
- average tokens per request

Do not show more than eight cards at once on the default view. If more metrics
are useful, put them in the report or secondary tables.

### Daily/Weekly/Monthly Trend Chart

Use the user's current stacked-bar direction:

- input
- output
- cache read
- cache creation

The chart should include:

- y-axis labels
- hover/title details with all token components and total
- legend
- stable layout on narrow panels
- no text overlap when many days are shown

For narrow ranges, bar labels can show dates. For long ranges, labels should
thin out rather than collide.

### Breakdown Tables

Add two primary tables:

1. By model
2. By agent

Both should show:

- requests
- input
- output
- cache read
- cache creation
- total
- estimated cost
- share of total cost or tokens

Tables should support a compact mode by hiding lower-priority columns when the
panel is narrow, following the same spirit as `ccusage` responsive tables.

### Expensive Sessions

Add a "Top sessions" table for the selected range.

Columns:

- agent
- model(s)
- session title or short id
- last activity
- total tokens
- estimated cost
- cache hit rate

This table is the bridge between Analytics and CodePal's monitoring identity.
Clicking a session row can expand the session in the existing dashboard/history
surface in a later follow-up; v1.1.7 can ship the table without navigation if
that keeps scope tight.

### Blocks and Active Windows

Do not fully implement `ccusage blocks` in the first pass.

However, preserve room in the data model for time-window grouping, because
Claude's 5-hour windows are useful for session planning and burn-rate analysis.
A later release can add:

- active 5-hour Claude block
- burn rate
- projected final tokens/cost
- warning against historical maximum or user-defined threshold

### HTML Report

The HTML report should mirror the in-app page:

- summary cards
- stacked trend chart
- model table
- agent table
- top sessions table
- import status and generated timestamp

The report remains self-contained and local.

## Cleanup Behavior

Automatic cleanup should use separate cutoffs:

- `session_activity_items` and `session_event_debug`: `detailRetention`
- `token_usage`: `analyticsRetention`

If retention is `forever`, do not delete rows for that data type.

Manual cleanup actions:

- Clear detailed session history
- Clear analytics usage history
- Clear all persisted CodePal history

The existing single "Clear persisted history" action can remain, but the UI
should make it clear that it deletes both details and analytics. Adding separate
buttons reduces surprise.

## Privacy and UX

Analytics backfill should only store numeric usage counters, model id, agent,
session id, timestamp, and minimal session title metadata that is already stored
by the existing history layer.

It should not store full prompts, assistant responses, or tool outputs beyond
what is already stored by detailed session history.

The Analytics page should display a small status line:

- "Imported from local Claude/Codex logs"
- last import time
- import error if the last run partially failed

Cost labels must continue to say "Estimated Cost".

## Accuracy

Backfilled token counts are more complete than live-only collection because they
include usage recorded before CodePal was installed.

They are still local-log-derived. Accuracy depends on upstream Claude/Codex log
format and completeness.

Estimated cost remains approximate because provider billing can include:

- long-context multipliers
- priority or fast-lane multipliers
- batch or flex discounts
- subscriptions, credits, taxes, or account-level billing adjustments

The UI should make this visible without being noisy:

- label cost as "Estimated Cost"
- add a tooltip or small help text explaining local-log-derived token counts
- include the cost calculation mode in the HTML report

## Testing

Add focused tests for:

- Claude backfill parses assistant usage rows.
- Claude backfill deduplicates streaming rows with last-entry-wins.
- Codex backfill writes `last_token_usage` as deltas.
- Codex backfill uses only the final `total_token_usage` when no deltas exist.
- Re-running backfill does not duplicate rows.
- Cleanup deletes detailed history while preserving forever analytics rows.
- Cleanup deletes analytics rows when analytics retention is finite.
- Settings migration maps old `retentionDays` to the new detail retention.
- Settings UI renders separate detail and analytics retention controls.
- Analytics chart preserves stacked input/output/cache components.
- Analytics queries return model, agent, and top-session breakdowns.
- HTML report includes model, agent, top-session, and import-status sections.

## Rollout

1. Add schema migration and idempotent token usage writes.
2. Add Claude/Codex backfill importers.
3. Split retention settings and cleanup behavior.
4. Add token stats query helpers for daily/weekly/monthly, model, agent, and
   session breakdowns.
5. Add import diagnostics and manual re-import IPC.
6. Update Analytics and HTML report to use the richer analysis shape.
7. Update History settings UI copy and retention controls.
8. Update docs/current-status and release notes.

This can ship as a small v1.1.7 feature without changing the dashboard-first
Phase 1 product boundary.
