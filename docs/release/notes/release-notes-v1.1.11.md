## CodePal v1.1.11

This release deepens monitoring for Claude and Codex and fixes a background hook startup issue.

### Highlights

- **Claude statusLine enrichment**: model id is now captured from Claude Code's statusLine payload and surfaced in quota diagnostics, so the usage strip can show model-aware data even when rate limits are absent.
- **Codex timeline noise filtering**: low-value Codex lifecycle items (Working, Context compacted, Turn aborted) are now hidden from the expanded session timeline.
- **Estimated cost in usage strip**: when model pricing data and token counts are both available, the status bar now shows an estimated cost per agent (e.g. `$17.55`).
- **Background hook fix**: agent hooks no longer require the CodePal GUI to be launched before hook events are processed.

### Validation

- `npm test` — 769 tests across 82 files, all passing
- `npm run lint` — clean
- `npm run build` — successful
