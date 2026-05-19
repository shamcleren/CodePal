# Usage Backfill, Retention, and Analytics Split

## Goal

Make usage analytics useful immediately after install by importing local Claude / Codex token history, keep analytics for much longer than detailed session transcripts, and split the UX into a compact in-app view plus a detailed HTML report.

## Implementation Steps

1. Extend shared usage and settings types:
   - Add source keys for token usage writes.
   - Add agent/session usage summaries and import status.
   - Replace `retentionDays` / `maxStorageMb` settings with `detailRetention` and `analyticsRetention`.

2. Update SQLite persistence:
   - Add `source_kind` and `source_key` to `token_usage`.
   - Upsert token usage by `(agent, source_key)` so repeated imports and restart lookback windows are idempotent.
   - Ensure token-only historical sessions have a minimal session row.
   - Split cleanup into detailed session retention and analytics retention; remove automatic max-size trimming.

3. Add history backfill:
   - Scan `~/.claude/projects/**/*.jsonl` for assistant `message.usage`.
   - Scan `~/.codex/sessions/**/*.jsonl` for `event_msg` token counts and nearby model context.
   - Store import status for the UI/report.

4. Update surfaces:
   - Settings: expose detailed session retention and analytics retention presets.
   - Analytics page: keep a compact summary, daily trend, and model/agent toggle.
   - HTML report: include detailed model, agent, top-session, and backfill sections.

5. Verify:
   - Focused tests for settings migration, cleanup, idempotent token storage, backfill, settings UI, and HTML report.
   - Full lint/test/build before completion.
