# CodePal v1.3.13

This patch release makes CodeBuddy usage visible and easier to trust while keeping the shared quota strip aligned across agents.

## Fixed

- Added verified CodeBuddy Code / IDE quota fetching through the authenticated browser session, including fallbacks for `invalid_fetch_site` and Electron session fetch failures.
- Added configurable CodeBuddy quota refresh intervals, defaulting to 5 minutes.
- Updated the usage strip so quota percentages consistently mean available quota; CodeBuddy now shows `total_used / total_quota` as used amount and total amount, plus the available percentage.
- Improved Cursor, Codex, and CodeBuddy tool-call activity text so generic task labels are replaced with clearer tool names where possible.

## Verified

- `npm run lint`
- `npm test`
- `npm run build`
