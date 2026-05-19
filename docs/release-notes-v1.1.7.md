## CodePal v1.1.7

This patch ships the usage analytics improvements that landed after the first v1.1.6 cut.

### Highlights

- **Claude / Codex history backfill**: local token history can be imported into Analytics from existing Claude and Codex JSONL logs.
- **Readable Top Sessions**: detailed HTML reports now show first-user-message summaries with shortened session IDs, instead of leading with opaque UUIDs.
- **Longer analytics retention**: detailed activity history stays on a configurable day window, while token analytics can be kept for much longer or forever.
- **Cleaner Analytics summary cards**: top agent and top model cards now use primary and secondary text so compact views stay readable.

### Validation

- Full local validation completed
- Signed and notarized macOS package produced
