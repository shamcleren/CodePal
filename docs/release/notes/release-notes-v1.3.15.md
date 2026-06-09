# CodePal v1.3.15

This patch release hardens the CodeBuddy Code / IDE login window and carries the macOS updater install fix forward for a real in-app update validation.

## Fixed

- Shows a local white loading page before navigating to the CodeBuddy login URL, reducing blank or black-window flashes during slow login navigation.
- Added a readable CodeBuddy login failure page and main-process diagnostic log when Electron cannot load the login URL, instead of leaving the user with an empty window.
- Keeps the ShipIt launchd kickstart fallback and startup self-healing added in v1.3.14.

## Verified

- `npm test -- src/main/usage/codebuddyQuotaService.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
