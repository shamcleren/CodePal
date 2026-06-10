# CodePal v1.3.17

This patch release polishes the model-pricing analytics surface and keeps pricing history cleaner after model catalog updates.

## Fixed

- Improves the historical pricing modal with a clearer header, tighter table spacing, sticky table headers, and a dedicated pricing-events section.
- Keeps non-current historical pricing rows out of pricing-change events, so stale model records do not appear as fresh pricing updates.
- Updates Analytics preference and Provider Gateway health-check tests to match the current vendor-filter and upstream-model behavior.

## Verified

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run dist:mac`
- `node scripts/verify-mac-release-assets.cjs <current 1.3.17 assets>`
