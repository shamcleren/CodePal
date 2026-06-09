# CodePal v1.3.14

This patch release fixes the macOS updater install handoff after a downloaded update has already reached the local Squirrel / ShipIt cache.

## Fixed

- Added a macOS ShipIt kickstart fallback when CodePal starts installing an update, so a submitted but pending `launchd` ShipIt job is nudged to actually replace the app bundle.
- Added startup self-healing for machines that relaunch the old app with a newer pending ShipIt bundle already staged in the updater cache.
- Kept the updater install shutdown path aligned with history and Provider Gateway cleanup while avoiding the previous stall after download.

## Verified

- `npm test -- src/main/update/macShipItKickstart.test.ts src/main/startupSafety.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
