## CodePal v1.1.6

This patch focuses on quieter monitoring and better usage visibility.

### Highlights

- **New Analytics page**: token usage now has a dedicated page with quick ranges, custom dates, per-model breakdowns, and browser-opened HTML reports.
- **Clearer Provider Gateway setup**: Settings now show gateway URL, provider/profile state, model mappings, token status, and health checks in one place.
- **Less noisy Codex sessions**: guardian / sandbox / subagent work is merged into the nearest user session, and `Chunk ID` tool output no longer takes over the main list.
- **Dashboard polish**: approval bulk actions were removed from the main UI, settings navigation is calmer, and recent sessions sort more reliably.

### Validation

- Full local validation completed
- Signed and notarized macOS package produced
