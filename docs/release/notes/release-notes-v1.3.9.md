# CodePal v1.3.9

This hotfix focuses on macOS auto-update reliability and a small Analytics trend control follow-up.

- Rebuilt the updater `.zip` from the final signed app bundle before notarization, blockmap generation, and `latest-mac.yml` refresh.
- Added final macOS release asset validation that extracts the updater `.zip`, mounts the `.dmg`, and verifies both app bundles with `codesign` and Gatekeeper assessment before upload.
- Hardened the release workflow so GitHub Release draft assets are downloaded and re-validated after upload before publishing.
- Added Daily Trend grouping by Agent and by Model, alongside the existing project and token-type views.
