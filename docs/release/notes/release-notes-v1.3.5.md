## CodePal v1.3.5

This patch release fixes an Analytics refresh regression introduced in v1.3.4.

### Highlights

- **Analytics chart refresh fix**: the Analytics page now advances the live chart range after manual or automatic refreshes, so the Daily Trend right edge and hover labels reflect the latest refresh time instead of the time when the page was first opened.
- **Report format alignment**: reports opened from Analytics now use the same summary-card shape and compact project breakdown as the Analytics page, including Top Agent, Top Model, Cache Hit, and project-level estimated cost rows.
- **Regression coverage**: added a focused test to keep the Analytics chart domain tied to the current refresh timestamp.

### Validation

- `npm test -- src/renderer/components/AnalyticsPage.test.ts src/renderer/components/AnalyticsLineChart.test.tsx src/renderer/App.test.tsx`
- `npm test -- src/main/report/generateHtmlReport.test.ts`
- `npm run lint`
- `npm run build`
- `git diff --check`
