## CodePal v1.2.0

This release pivots CodePal from passive monitoring toward actionable workflow infrastructure. It adds Report Facts and work item foundations, replaces the daily bar chart with an SVG line trend, introduces a Work Health strip, and ships an attention queue banner for sessions that need action.

### Highlights

- **Report Facts and work items**: deterministic daily/weekly/monthly report facts derived from sessions, work items, operation logs, and usage stats. Work items track `waiting`, `needs_follow_up`, `failed`, `completed`, and `deferred` states.
- **LLM report generation**: manual LLM-generated reports from Report Facts, gated behind a settings switch with model selection. Includes redaction controls for session titles and model names.
- **Attention queue banner**: sessions that need attention (failed, waiting, needs follow-up) are surfaced at the top of the Sessions view with expandable detail and jump-to-session.
- **SVG line trend chart**: the daily stacked bar chart is replaced by an SVG line chart with LTTB downsampling, agent filter chips, and hover crosshair tooltips.
- **Work Health strip**: compact health signals on the Analytics page — attention count, longest wait, unrecovered failures, context-near-full, and cost anomaly vs previous equal-length range.
- **Report settings panel**: preferences section for enabling LLM reports and setting a default model.
- **Semantic built-in themes**: `graphite-ops` (dark) and `paper-ops` (light) with full theme-aware component styles for analytics, work health, and trend charts.

### Validation

- `npm run lint` — clean
- `npm test` — 905 tests across 100 files, all passing
- `npm run build` — successful
