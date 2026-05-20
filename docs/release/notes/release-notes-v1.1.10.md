## CodePal v1.1.10

This patch fixes inflated analytics totals from local usage history imports.

### Highlights

- **Fixed duplicated analytics rows**: legacy token usage rows without source keys are cleaned up when matching backfilled rows exist.
- **Deduped repeated Codex token snapshots**: repeated Codex `token_count` snapshots now use a stable usage signature instead of timestamp-based keys.
- **Corrected Codex cached-input accounting**: Codex cached input is stored separately from non-cached input so totals and cost estimates do not double count cached tokens.
- **Safe startup cleanup**: the one-time local analytics cleanup uses indexed temp tables and migration markers so app startup remains fast after the first cleanup.

### Validation

- Reproduced the inflated 2026-05-18 and 2026-05-19 local analytics totals on a real history database copy
- Verified cleanup on a copied local database reduces duplicate totals without touching the original database
- Unit, lint, build, and diff hygiene validation completed
