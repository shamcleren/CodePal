## CodePal v1.3.0

This release adds a daily Work Review layer on top of CodePal's monitoring history, so recent AI coding sessions can be reviewed by day and by project instead of only as a live session list. It also tightens session timing, project attribution, and Analytics filtering for heavier daily use.

### Highlights

- **Daily Work Review**: a new personal review page summarizes the last 14 days of completed and in-progress sessions, with managed / observed source labels and quick jumps back to current sessions.
- **Project grouping**: sessions, history, work review entries, and usage analytics now use shared project attribution so work can be scanned by repository instead of by raw agent stream.
- **Live run and context signals**: session rows now surface running duration, latest running time, session duration, and context pressure where upstream data is available.
- **Analytics filters and trend cleanup**: project / agent / model filters are persisted, trend controls remain visible even when a filtered range has no points, and temporary report redaction toggles were removed from the Analytics page.
- **Review usability polish**: project groups can collapse, long project groups stay compact, and low-value prompt / tool boilerplate is filtered out of review summaries.

### Validation

- `npm run lint` - clean
- `npm test` - 976 tests across 107 files, all passing
- `npm run build` - successful
- `npm run test:e2e` - 17 Playwright tests passing
- `git diff --check` - clean
