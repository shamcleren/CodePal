# CodePal v1.3.16

This patch release tightens CodeBuddy login-window isolation, stabilizes session project attribution, and quiets stale macOS updater cache noise.

## Fixed

- Keeps CodeBuddy login and quota windows detached from the main CodePal panel so successful login auto-close does not black out the app.
- Preserves a session's first resolved project attribution, while still allowing sessions that started as unknown to be filled in later.
- Treats missing pending ShipIt update app bundles as stale cache instead of logging a startup error stack.

## Verified

- `npm test -- src/main/update/macShipItKickstart.test.ts`
- `npm test -- src/main/session/sessionStore.test.ts src/main/history/historyRuntime.test.ts src/main/usage/codebuddyQuotaService.test.ts src/main/usage/codebuddyQuotaWindow.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
