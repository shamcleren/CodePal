## CodePal v1.3.5

This patch release fixes an Analytics refresh regression introduced in v1.3.4 and temporarily disables Provider Gateway client mutation paths while the safety model is tightened.

### Highlights

- **Analytics chart refresh fix**: the Analytics page now advances the live chart range after manual or automatic refreshes, so the Daily Trend right edge and hover labels reflect the latest refresh time instead of the time when the page was first opened.
- **Report format alignment**: reports opened from Analytics now use the same summary-card shape and compact project breakdown as the Analytics page, including Top Agent, Top Model, Cache Hit, and project-level estimated cost rows.
- **Provider Gateway safety hotfix**: the local Provider Gateway is disabled in this build, and Claude / Codex client setup actions are blocked so opening CodePal cannot start the gateway or rewrite client provider configuration.
- **Safer Claude integration repair**: startup migration no longer treats missing Gateway environment variables as a repair target when the gateway is disabled, avoiding unintended changes to existing Claude model defaults.
- **Updated cost estimates**: Claude Opus 4.8 pricing is included, and cost estimation now normalizes common model-id variants before matching the local pricing table.
- **Regression coverage**: added a focused test to keep the Analytics chart domain tied to the current refresh timestamp.

### Validation

- `npm test -- src/renderer/components/AnalyticsPage.test.ts src/renderer/components/AnalyticsLineChart.test.tsx src/renderer/App.test.tsx`
- `npm test -- src/main/report/generateHtmlReport.test.ts`
- `npm test -- src/main/integrations/integrationService.test.ts src/main/gateway/claudeDesktopGateway.test.ts src/main/report/llmReportGateway.test.ts src/renderer/components/ProviderGatewayPanel.test.tsx`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`
